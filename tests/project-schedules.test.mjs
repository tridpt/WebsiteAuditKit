import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { brandingReport } from './fixtures/branding-report.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-project-schedule-test-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const store = await import('../server/store.mjs');
const workspace = await import('../server/workspace.mjs');
const { createProjectScheduleManager, nextProjectRun, validateProjectSchedule } =
  await import('../server/project-schedules.mjs');
const { compareBatchRuns } = await import('../server/batch-comparison.mjs');
const { createApp } = await import('../server/index.mjs');
const { createMonitor } = await import('../server/monitor.mjs');
const urls = ['http://127.0.0.1:9981/one', 'http://127.0.0.1:9981/two'];
const input = (extra = {}) => ({ device: 'mobile', maxPages: 5, interval: 'daily', ...extra });
const pause = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
beforeEach(async () => {
  await store.saveWorkspace({ version: 1, clients: [], projects: [], reports: {}, monitors: {} });
  await store.saveMonitors([]);
  await store.saveBatches([]);
  await store.saveProjectSchedules([]);
});
after(async () => {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(temporary).startsWith('website-audit-project-schedule-test-'));
  await fs.rm(temporary, { recursive: true, force: true });
});
async function seed(name = 'Dự án định kỳ') {
  const client = await workspace.createClient({ name: 'Mộc Studio' });
  return workspace.saveProject(null, { clientId: client.id, name, websites: urls });
}
function harness(project, initial = []) {
  let clock = new Date('2026-10-25T03:00:00.000Z'),
    saved = structuredClone(initial),
    unavailable = false,
    writeError = false;
  const history = [],
    calls = [];
  const storage = {
    read: async () => structuredClone(saved),
    save: async (next) => {
      if (writeError) throw new Error('Disk full');
      saved = structuredClone(next);
    },
  };
  const batches = {
    ready: Promise.resolve(),
    isActive: () => unavailable,
    list: async (projectId) => history.filter((b) => b.projectId === projectId),
    compare: (projectId, before, after) =>
      compareBatchRuns(
        history.find((b) => b.projectId === projectId && b.id === before),
        history.find((b) => b.projectId === projectId && b.id === after),
        history,
      ),
    start: async (id, config, retry, meta) => {
      if (unavailable) throw Object.assign(new Error('Busy'), { code: 'BUSY' });
      calls.push({ id, config, meta });
      const current = (await workspace.getWorkspace()).projects.find((p) => p.id === id);
      const batch = {
        id: randomUUID(),
        projectId: id,
        projectName: current.name,
        createdAt: clock.toISOString(),
        finishedAt: null,
        status: 'running',
        ...config,
        ...meta,
        items: current.websites.map((url) => ({
          url,
          status: 'queued',
          reportId: null,
          error: null,
        })),
      };
      history.push(batch);
      return structuredClone(batch);
    },
  };
  const options = { batches, isBusy: () => unavailable, now: () => new Date(clock), storage };
  const manager = createProjectScheduleManager(options);
  return {
    manager,
    options,
    history,
    calls,
    storage,
    get saved() {
      return structuredClone(saved);
    },
    advance: (ms = 86_400_000) => {
      clock = new Date(clock.getTime() + ms);
    },
    busy: (value) => {
      unavailable = value;
    },
    failWrites: (value) => {
      writeError = value;
    },
    async settle(
      batchId,
      { score = 80, status = 'completed', failIndex = -1, adjust = () => {} } = {},
    ) {
      const batch = history.find((b) => b.id === batchId);
      for (const [index, item] of batch.items.entries()) {
        if (index === failIndex || status === 'cancelled' || status === 'interrupted') {
          item.status = status === 'partial' ? 'failed' : 'cancelled';
          item.error = 'Unavailable';
          continue;
        }
        const report = {
          ...brandingReport(),
          id: randomUUID(),
          url: item.url,
          requestedUrl: item.url,
          device: batch.device,
          createdAt: clock.toISOString(),
          score,
        };
        report.checks.forEach((check) => {
          check.status = 'pass';
          check.urls = [item.url];
        });
        report.pages[0].url = item.url;
        report.categories.performance.score = score;
        adjust(report, index);
        await store.saveReport(report);
        await workspace.assignResource('reports', report.id, project.id);
        item.reportId = report.id;
        item.status = 'completed';
      }
      batch.status = status;
      batch.finishedAt = clock.toISOString();
      await manager.finish(structuredClone(batch));
      return batch;
    },
  };
}

test('schedule validation, exact 24h/7d cadence and corrupt storage preservation', async () => {
  assert.equal(nextProjectRun('daily', '2026-10-25T03:00:00Z'), '2026-10-26T03:00:00.000Z');
  assert.equal(nextProjectRun('weekly', '2026-10-25T03:00:00Z'), '2026-11-01T03:00:00.000Z');
  for (const invalid of [
    null,
    [],
    input({ interval: 'monthly' }),
    input({ device: 'tablet' }),
    input({ maxPages: '5' }),
    input({ active: 'yes' }),
    input({ nextRunAt: '2020-01-01' }),
  ])
    assert.throws(() => validateProjectSchedule(invalid), { code: 'INVALID_SCHEDULE' });
  const project = await seed();
  await fs.writeFile(store.projectSchedulesFile, '{bad json');
  const h = harness(project);
  const manager = createProjectScheduleManager({
    ...h.options,
    storage: { read: store.readProjectSchedules, save: store.saveProjectSchedules },
  });
  await assert.rejects(manager.list(), /Không đọc được lịch dự án/);
  await assert.rejects(manager.save(project.id, input()), /Không đọc được lịch dự án/);
  assert.equal(await fs.readFile(store.projectSchedulesFile, 'utf8'), '{bad json');
  await manager.close();
  await h.manager.close();
});

test('one schedule per project persists, pause/resume resets overdue dates and failed writes roll back', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    const first = await h.manager.save(project.id, input());
    assert.equal(first.nextRunAt, '2026-10-26T03:00:00.000Z');
    await h.manager.save(project.id, input({ interval: 'weekly' }));
    assert.equal((await h.manager.list()).length, 1);
    await h.manager.save(project.id, { active: false }, true);
    h.advance(8 * 86_400_000);
    assert.equal((await h.manager.due()).length, 0);
    const resumed = await h.manager.save(project.id, { active: true }, true);
    assert.equal(resumed.nextRunAt, '2026-11-09T03:00:00.000Z');
    h.failWrites(true);
    await assert.rejects(h.manager.save(project.id, { active: false }, true), /Disk full/);
    assert.equal((await h.manager.get(project.id)).active, true);
    h.failWrites(false);
    const restarted = createProjectScheduleManager(h.options);
    assert.deepEqual(await restarted.get(project.id), await h.manager.get(project.id));
    await restarted.close();
  } finally {
    await h.manager.close();
  }
});

test('due runs wait while busy, avoid concurrent claims, use current project URLs and advance only once', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    h.advance(4 * 86_400_000);
    const dueAt = (await h.manager.get(project.id)).nextRunAt;
    h.busy(true);
    await assert.rejects(h.manager.run(project.id, { scheduled: true }), { code: 'BUSY' });
    assert.equal((await h.manager.get(project.id)).nextRunAt, dueAt);
    h.busy(false);
    await workspace.saveProject(project.id, { websites: [urls[1]] });
    const results = await Promise.allSettled([
      h.manager.run(project.id, { scheduled: true }),
      h.manager.run(project.id, { scheduled: true }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled' && r.value).length, 1);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(
      h.history[0].items.map((item) => item.url),
      [urls[1]],
    );
    assert.equal((await h.manager.get(project.id)).nextRunAt, '2026-10-30T03:00:00.000Z');
    assert.equal((await h.manager.due()).length, 0);
    await assert.rejects(h.manager.save(project.id, { device: 'desktop' }, true), { code: 'BUSY' });
    await assert.rejects(h.manager.remove(project.id), { code: 'BUSY' });
    await h.manager.save(project.id, { active: false }, true);
    await h.settle(h.history[0].id);
    assert.equal((await h.manager.get(project.id)).active, false);
  } finally {
    await h.manager.close();
  }
});

test('baseline, regression thresholds, confirmed new issues and notification read state are idempotent', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    const first = (await h.manager.run(project.id)).batch;
    await h.settle(first.id);
    assert.equal((await h.manager.get(project.id)).lastStatus, 'baseline');
    assert.equal((await h.manager.get(project.id)).unreadAlerts, 0);
    h.advance();
    const next = (await h.manager.run(project.id)).batch;
    const done = await h.settle(next.id, {
      score: 75,
      adjust: (r, i) => {
        if (i === 0) r.checks[1].status = 'fail';
      },
    });
    const schedule = await h.manager.get(project.id);
    assert.equal(schedule.lastStatus, 'alert');
    assert.equal(schedule.unreadAlerts, 1);
    assert.equal(schedule.runs.at(-1).scoreDrops, 2);
    assert.equal(schedule.runs.at(-1).newIssues, 1);
    assert.equal(schedule.runs.at(-1).beforeBatchId, first.id);
    await h.manager.finish(done);
    await h.manager.reconcile();
    assert.equal((await h.manager.get(project.id)).runs.length, 2);
    assert.equal((await h.manager.get(project.id)).notifications.length, 1);
    await h.manager.read(project.id);
    assert.equal((await h.manager.get(project.id)).unreadAlerts, 0);
    assert.ok(h.saved[0].notifications[0].readAt);
    h.advance();
    const mild = (await h.manager.run(project.id)).batch;
    await h.settle(mild.id, {
      score: 73,
      adjust: (r, i) => {
        if (i === 0) r.checks[1].status = 'fail';
      },
    });
    assert.equal((await h.manager.get(project.id)).lastStatus, 'healthy');
    assert.equal((await h.manager.get(project.id)).notifications.length, 1);
  } finally {
    await h.manager.close();
  }
});

test('partial/cancelled runs retain a complete baseline and device changes never create false score alerts', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    const first = (await h.manager.run(project.id)).batch;
    await h.settle(first.id);
    h.advance();
    const partial = (await h.manager.run(project.id)).batch;
    await h.settle(partial.id, { status: 'partial', failIndex: 0 });
    let schedule = await h.manager.get(project.id);
    assert.equal(schedule.baselineBatchId, first.id);
    assert.equal(schedule.lastStatus, 'incomplete');
    assert.equal(schedule.unreadAlerts, 1);
    h.advance();
    const cancel = (await h.manager.run(project.id)).batch;
    await h.settle(cancel.id, { status: 'cancelled' });
    schedule = await h.manager.get(project.id);
    assert.equal(schedule.baselineBatchId, first.id);
    assert.equal(schedule.lastStatus, 'cancelled');
    assert.equal(schedule.unreadAlerts, 1);
    await h.manager.save(project.id, { device: 'desktop' }, true);
    h.advance();
    const changed = (await h.manager.run(project.id)).batch;
    await h.settle(changed.id, { score: 20 });
    schedule = await h.manager.get(project.id);
    assert.equal(schedule.lastStatus, 'incomplete');
    assert.equal(schedule.runs.at(-1).scoreDrops, 0);
    assert.equal(schedule.notifications.length, 1);
    assert.ok(schedule.runs.at(-1).websites.every((site) => !site.comparable));
  } finally {
    await h.manager.close();
  }
});

test('recovery connects a claimed token to its persisted batch and completes it once', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    const run = await h.manager.run(project.id);
    const draft = h.saved;
    draft[0].currentBatchId = null;
    await h.storage.save(draft);
    h.history[0].status = 'interrupted';
    h.history[0].finishedAt = '2026-10-25T04:00:00Z';
    const recovered = createProjectScheduleManager(h.options);
    const schedule = await recovered.get(project.id);
    assert.equal(schedule.lastStatus, 'interrupted');
    assert.equal(schedule.runs.length, 1);
    assert.equal(schedule.lastBatchId, run.batch.id);
    assert.equal(schedule.currentRunId, null);
    assert.equal(schedule.unreadAlerts, 1);
    await recovered.reconcile();
    assert.equal((await recovered.get(project.id)).runs.length, 1);
    await recovered.close();
  } finally {
    await h.manager.close();
  }
});

test('orphan claim recovery and missing project cleanup do not replay partially created runs', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    await h.manager.run(project.id);
    h.history.length = 0;
    const recovered = createProjectScheduleManager(h.options);
    assert.equal((await recovered.get(project.id)).lastStatus, 'interrupted');
    assert.equal((await recovered.due()).length, 0);
    assert.equal((await recovered.get(project.id)).unreadAlerts, 1);
    await recovered.close();
    await workspace.deleteProject(project.id);
    const cleaned = createProjectScheduleManager(h.options);
    assert.deepEqual(await cleaned.list(), []);
    assert.deepEqual(h.saved, []);
    await cleaned.close();
  } finally {
    await h.manager.close();
  }
});

test('finish write failures retain a recoverable running token and reconcile without losing alerts', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    const run = await h.manager.run(project.id);
    h.failWrites(true);
    await assert.rejects(h.settle(run.batch.id, { status: 'partial', failIndex: 0 }), /Disk full/);
    assert.equal((await h.manager.get(project.id)).lastStatus, 'running');
    h.failWrites(false);
    await h.manager.reconcile();
    assert.equal((await h.manager.get(project.id)).lastStatus, 'incomplete');
    assert.equal((await h.manager.get(project.id)).notifications.length, 1);
    assert.equal((await h.manager.get(project.id)).runs.length, 1);
  } finally {
    await h.manager.close();
  }
});

test('missing current reports remain incomplete and do not replace an established baseline', async () => {
  const project = await seed(),
    h = harness(project);
  try {
    await h.manager.save(project.id, input());
    const first = (await h.manager.run(project.id)).batch;
    await h.settle(first.id);
    h.advance();
    const next = (await h.manager.run(project.id)).batch;
    const batch = h.history.find((b) => b.id === next.id);
    batch.items.forEach((item) => {
      item.status = 'completed';
      item.reportId = randomUUID();
    });
    batch.status = 'completed';
    batch.finishedAt = batch.createdAt;
    await h.manager.finish(batch);
    const schedule = await h.manager.get(project.id);
    assert.equal(schedule.lastStatus, 'incomplete');
    assert.equal(schedule.baselineBatchId, first.id);
    assert.equal(schedule.runs.at(-1).failed, 2);
    assert.equal(schedule.runs.at(-1).scoreDrops, 0);
    assert.equal(schedule.runs.at(-1).newIssues, 0);
    assert.equal(schedule.unreadAlerts, 1);
  } finally {
    await h.manager.close();
  }
});

async function withApp(work, extra = {}) {
  let clock = new Date();
  let variant = 0;
  const calls = [];
  const runner = async (input) => {
    calls.push(input.url);
    await pause(40);
    const report = {
      ...brandingReport(),
      id: input.id,
      url: input.url,
      requestedUrl: input.url,
      device: input.device,
      score: variant === 1 ? 65 : 80,
      createdAt: new Date().toISOString(),
    };
    report.pages[0].url = input.url;
    report.checks.forEach((check) => {
      check.status = 'pass';
      check.urls = [input.url];
    });
    if (variant === 1) report.checks[3].status = 'fail';
    return report;
  };
  const instance = createApp({
    auditRunner: runner,
    scheduleNow: () => clock,
    startupDelayMs: 60_000,
    ...extra,
  });
  await instance.projectSchedules.ready;
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.PORT = String(server.address().port);
  const json = async (route, body, method = 'GET') => {
    const response = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const wait = async (projectId, runs) => {
    for (let i = 0; i < 300; i++) {
      const s = await instance.projectSchedules.get(projectId);
      if (!s.currentRunId && s.runs.length === runs) return s;
      await pause();
    }
    throw new Error('Scheduled batch timed out');
  };
  try {
    await work({
      instance,
      calls,
      json,
      wait,
      advance: () => {
        clock = new Date(clock.getTime() + 86_400_001);
      },
      variant: (v) => {
        variant = v;
      },
    });
  } finally {
    await instance.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('API schedule runs real batches, stores report membership, compares, exports and deletes schedule while retaining history', async () => {
  const project = await seed();
  await withApp(async ({ instance, calls, json, wait, advance, variant }) => {
    const base = `/api/projects/${project.id}/schedule`;
    assert.equal((await json(base)).body, null);
    assert.equal((await json(base, input({ interval: 'bad' }), 'PUT')).status, 400);
    assert.equal((await json(base, input(), 'PUT')).status, 200);
    advance();
    await instance.runDueWork();
    const first = await wait(project.id, 1);
    assert.equal(first.lastStatus, 'baseline');
    assert.deepEqual(calls, urls);
    const firstBatch = (await json(`/api/projects/${project.id}/batches`)).body[0];
    assert.equal(firstBatch.trigger, 'schedule');
    assert.ok(firstBatch.scheduleRunId);
    for (const item of firstBatch.items)
      assert.equal((await workspace.getWorkspace()).reports[item.reportId], project.id);
    variant(1);
    advance();
    await instance.runDueWork();
    const second = await wait(project.id, 2);
    assert.equal(second.lastStatus, 'alert');
    assert.equal(second.unreadAlerts, 1);
    assert.equal(second.runs.at(-1).scoreDrops, 2);
    assert.equal(second.runs.at(-1).newIssues, 2);
    assert.equal((await json(base + '/read', {}, 'POST')).body.unreadAlerts, 0);
    const history = (await json(`/api/projects/${project.id}/batches`)).body;
    assert.equal(
      (await json(`/api/projects/${project.id}/batches/${history[0].id}/export?format=json`)).body
        .totals.available,
      2,
    );
    assert.equal((await json(base, {}, 'DELETE')).status, 200);
    assert.equal((await json(base)).body, null);
    assert.equal((await json(`/api/projects/${project.id}/batches`)).body.length, 2);
    for (const item of history[0].items)
      assert.equal((await store.readReport(item.reportId)).batchId, history[0].id);
  });
});

test('scheduler shares the slot fairly with website monitors and paused project schedules stay idle', async () => {
  const project = await seed();
  await withApp(async ({ instance, calls, wait, advance }) => {
    await instance.projectSchedules.save(project.id, input());
    const monitor = await createMonitor({
      name: 'Lịch website',
      url: urls[0],
      device: 'mobile',
      maxPages: 1,
      interval: 'daily',
    });
    const stored = await store.readMonitors();
    stored[0].nextRunAt = new Date(Date.now() - 1000).toISOString();
    await store.saveMonitors(stored);
    await instance.runDueWork();
    for (let i = 0; i < 100 && instance.jobs.size === 0; i++) await pause();
    const monitorJob = [...instance.jobs.values()].find((job) => job.monitorId === monitor.id);
    assert.ok(monitorJob);
    await monitorJob.completion;
    await instance.projectSchedules.save(project.id, { active: false }, true);
    advance();
    await instance.runDueWork();
    assert.equal(calls.length, 1);
    await instance.projectSchedules.save(project.id, { active: true }, true);
    advance();
    await instance.runDueWork();
    await wait(project.id, 1);
    assert.deepEqual(calls, [urls[0], ...urls]);
  });
});

test('deleting a project cleans its schedule and preserves saved reports', async () => {
  const project = await seed();
  await withApp(async ({ json, wait }) => {
    const base = `/api/projects/${project.id}/schedule`;
    await json(base, input(), 'PUT');
    const run = await json(base + '/run', {}, 'POST');
    assert.equal(run.status, 202);
    assert.equal((await json(base, {}, 'DELETE')).status, 409);
    assert.equal((await json(`/api/projects/${project.id}`, {}, 'DELETE')).status, 409);
    await wait(project.id, 1);
    const ids = (await store.listReports()).map((r) => r.id);
    assert.equal((await json(`/api/projects/${project.id}`, {}, 'DELETE')).status, 200);
    assert.deepEqual((await json('/api/project-schedules')).body, []);
    assert.deepEqual(
      (await store.listReports()).map((r) => r.id),
      ids,
    );
  });
});

test('persisted running batch recovers after server restart without replaying or duplicating alerts', async () => {
  const project = await seed(),
    h = harness(project);
  await h.manager.save(project.id, input());
  const run = await h.manager.run(project.id);
  await store.saveProjectSchedules(h.saved);
  await store.saveBatches(h.history);
  await h.manager.close();
  await withApp(
    async ({ instance, calls }) => {
      const schedule = await instance.projectSchedules.get(project.id);
      assert.equal(schedule.lastStatus, 'interrupted');
      assert.equal(schedule.lastBatchId, run.batch.id);
      assert.equal(schedule.currentRunId, null);
      assert.equal(schedule.runs.length, 1);
      assert.equal(schedule.notifications.length, 1);
      assert.equal((await instance.batches.list(project.id))[0].status, 'interrupted');
      await instance.runDueWork();
      assert.deepEqual(calls, []);
    },
    { scheduleNow: () => new Date('2026-10-25T04:00:00.000Z') },
  );
  await withApp(async ({ instance }) => {
    const schedule = await instance.projectSchedules.get(project.id);
    assert.equal(schedule.runs.length, 1);
    assert.equal(schedule.notifications.length, 1);
  });
});

test('corrupt project schedule data does not disable existing website monitor scheduling', async () => {
  await fs.writeFile(store.projectSchedulesFile, '{broken json');
  const monitor = await createMonitor({
    name: 'Lịch website độc lập',
    url: urls[0],
    device: 'mobile',
    maxPages: 1,
    interval: 'daily',
  });
  const data = await store.readMonitors();
  data[0].nextRunAt = new Date(Date.now() - 10_000).toISOString();
  await store.saveMonitors(data);
  await withApp(async ({ instance }) => {
    await instance.runDueWork();
    const job = [...instance.jobs.values()].find((job) => job.monitorId === monitor.id);
    assert.ok(job);
    await job.completion;
    assert.equal(job.status, 'completed');
    assert.equal(await fs.readFile(store.projectSchedulesFile, 'utf8'), '{broken json');
  });
});
