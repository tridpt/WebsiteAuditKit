import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-monitor-test-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const store = await import('../server/store.mjs');
const {
  nextMonitorRun,
  validateMonitorInput,
  createMonitor,
  getMonitor,
  updateMonitor,
  deleteMonitor,
  claimMonitorRun,
  finishMonitorRun,
  failMonitorRun,
  dueMonitors,
  listMonitors,
  markMonitorRead,
  recoverMonitorRuns,
  removeMonitorReport,
} = await import('../server/monitor.mjs');
const { createApp } = await import('../server/index.mjs');
const origin = 'http://127.0.0.1:9981/';
const input = (extra = {}) => ({
  name: 'Khách hàng A',
  url: origin,
  device: 'mobile',
  maxPages: 5,
  interval: 'daily',
  ...extra,
});
let serial = 0;
function report(extra = {}) {
  return {
    id: randomUUID(),
    url: origin,
    title: 'Fixture website',
    device: 'mobile',
    maxPages: 5,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, serial++)).toISOString(),
    score: 80,
    pages: [{ url: origin, title: 'A useful title' }],
    links: [{ url: `${origin}help`, source: origin, state: 'ok', status: 200 }],
    checks: [
      {
        id: 'title',
        category: 'seo',
        title: 'Tiêu đề trang',
        severity: 'high',
        status: 'pass',
        evidence: [],
        urls: [],
        weight: 5,
      },
    ],
    categories: Object.fromEntries(
      ['performance', 'seo', 'links', 'mobile'].map((id) => [id, { score: 80 }]),
    ),
    scope: { scannedPages: 1, checkedLinks: 1 },
    ...extra,
  };
}
async function finish(id, data) {
  await store.saveReport(data);
  return finishMonitorRun(id, data);
}
async function due(id, at = '2026-01-01T00:00:00.000Z') {
  await store.withMonitorsLock(async () => {
    const monitors = await store.readMonitors();
    monitors.find((monitor) => monitor.id === id).nextRunAt = at;
    await store.saveMonitors(monitors);
  });
}
beforeEach(async () => {
  await store.withMonitorsLock(() => store.saveMonitors([]));
});
after(async () => {
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-monitor-test-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
});

test('monitor input validates settings and schedules 24 hours or seven days from the actual start', () => {
  assert.equal(nextMonitorRun('daily', '2026-10-24T03:00:00Z'), '2026-10-25T03:00:00.000Z');
  assert.equal(nextMonitorRun('weekly', '2026-10-24T03:00:00Z'), '2026-10-31T03:00:00.000Z');
  for (const extra of [
    { name: ' ' },
    { name: 'x'.repeat(81) },
    { interval: 'hourly' },
    { interval: 'toString' },
    { device: 'tablet' },
    { maxPages: 2 },
    { active: 'yes' },
    { url: 'file:///secret' },
  ])
    assert.throws(() => validateMonitorInput(input(extra)));
  assert.deepEqual(
    validateMonitorInput({ name: ' A ', nextRunAt: 'tampered' }, { partial: true }),
    { name: 'A' },
  );
});

test('concurrent monitor writes preserve every project and corrupt data is never overwritten', async () => {
  const monitors = await Promise.all(
    Array.from({ length: 10 }, (_, index) => createMonitor(input({ name: `Project ${index}` }))),
  );
  assert.equal((await store.readMonitors()).length, 10);
  await Promise.all(monitors.map((monitor) => updateMonitor(monitor.id, { interval: 'weekly' })));
  assert.ok((await store.readMonitors()).every((monitor) => monitor.interval === 'weekly'));
  await fs.writeFile(store.monitorsFile, '{broken');
  await assert.rejects(createMonitor(input()), /Không đọc được dữ liệu/);
  assert.equal(await fs.readFile(store.monitorsFile, 'utf8'), '{broken');
  await store.saveMonitors([]);
  await createMonitor(input());
  assert.equal((await store.readMonitors()).length, 1);
});

test('overdue runs are claimed once, paused schedules stay stopped, and stale scheduler snapshots are rejected', async () => {
  const monitor = await createMonitor(input());
  await due(monitor.id);
  assert.equal((await dueMonitors()).length, 1);
  const start = new Date('2026-10-24T03:00:00Z');
  const claims = await Promise.allSettled([
    claimMonitorRun(monitor.id, start),
    claimMonitorRun(monitor.id, start),
  ]);
  assert.equal(claims.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await getMonitor(monitor.id)).nextRunAt, '2026-10-25T03:00:00.000Z');
  assert.equal(
    (await listMonitors())[0].running,
    true,
    'claimed runs are visible while the job is preparing',
  );
  assert.deepEqual(await dueMonitors(start), []);
  await assert.rejects(updateMonitor(monitor.id, { device: 'desktop' }), { code: 'BUSY' });
  await assert.rejects(deleteMonitor(monitor.id), { code: 'BUSY' });
  await failMonitorRun(monitor.id, { code: 'ABORTED', message: 'Đã hủy' });
  await due(monitor.id);
  await updateMonitor(monitor.id, { active: false });
  assert.deepEqual(await dueMonitors(), []);
  assert.equal(await claimMonitorRun(monitor.id, new Date(), { scheduled: true }), null);
  const manual = await claimMonitorRun(monitor.id);
  assert.equal(
    manual.lastStatus,
    'running',
    'manual runs remain available while schedule is paused',
  );
});

test('first scan creates a baseline and comparable score drops generate one persistent alert', async () => {
  const monitor = await createMonitor(input());
  const first = report();
  const baseline = await finish(monitor.id, first);
  assert.equal(baseline.alert, null);
  assert.equal(baseline.monitor.notifications.length, 0);
  assert.equal(baseline.monitor.runs[0].baseline, true);
  const second = report({ score: 75 });
  const regression = await finish(monitor.id, second);
  assert.equal(regression.alert.scoreDrop, 5);
  assert.equal(regression.monitor.previousReportId, first.id);
  assert.equal(regression.monitor.notifications.length, 1);
  assert.equal((await listMonitors())[0].unreadAlerts, 1);
  await markMonitorRead(monitor.id);
  assert.equal((await listMonitors())[0].unreadAlerts, 0);
  const stable = await finish(monitor.id, report({ score: 75 }));
  assert.equal(stable.alert.hasAlert, false);
  assert.equal(stable.monitor.notifications.length, 1, 'stable scans do not append notifications');
  assert.ok(stable.monitor.notifications[0].readAt);
});

test('scope, device and measurement-source changes never produce a false total-score alert', async () => {
  for (const extra of [
    { pages: [{ url: `${origin}another`, title: 'Another' }] },
    { device: 'desktop' },
    {
      lighthouse: {
        available: true,
        version: '12.8.2',
        device: 'mobile',
        settings: { throttlingMethod: 'simulate' },
      },
    },
  ]) {
    const monitor = await createMonitor(input());
    await finish(monitor.id, report());
    const result = await finish(monitor.id, report({ score: 30, ...extra }));
    assert.equal(result.alert.scoreDelta, null);
    assert.equal(result.alert.scoreDrop, 0);
    assert.equal(result.alert.hasAlert, false);
    assert.equal(result.monitor.runs.at(-1).comparable, false);
  }
});

test('new broken links and SEO problems alert, while unmeasured URLs and unknown responses stay unverified', async () => {
  const monitor = await createMonitor(input());
  const first = report();
  await finish(monitor.id, first);
  const second = report({
    links: [{ ...first.links[0], state: 'broken', status: 404 }],
    checks: [
      {
        ...first.checks[0],
        status: 'fail',
        urls: [origin],
        evidence: [`${origin} — missing title`],
      },
    ],
  });
  const result = await finish(monitor.id, second);
  assert.equal(result.alert.brokenLinks, 1);
  assert.equal(result.alert.seoIssues, 1);
  const unknown = await finish(
    monitor.id,
    report({
      links: [{ ...first.links[0], state: 'unknown', status: 403 }],
      checks: second.checks,
    }),
  );
  assert.equal(unknown.alert.hasAlert, false);
  assert.equal(unknown.alert.resolvedIssues, 0);
  assert.equal(unknown.alert.unverifiedIssues, 1);
  const expanded = await finish(
    monitor.id,
    report({
      links: [
        ...first.links,
        { url: `${origin}unseen`, state: 'broken', status: 404, source: origin },
      ],
      checks: second.checks,
    }),
  );
  assert.equal(expanded.alert.brokenLinks, 0);
  assert.ok(expanded.alert.unverifiedIssues >= 1);
});

test('performance drops alert even when total drop is smaller; small variations stay quiet', async () => {
  const monitor = await createMonitor(input());
  const first = report();
  await finish(monitor.id, first);
  const categories = { ...first.categories, performance: { score: 74 } };
  const result = await finish(monitor.id, report({ score: 78, categories }));
  assert.equal(result.alert.scoreDrop, 0);
  assert.equal(result.alert.speedDrop, 6);
  assert.equal(result.alert.hasAlert, true);
  assert.equal((await finish(monitor.id, report({ score: 77, categories }))).alert.hasAlert, false);
});

test('run history and notifications are bounded, cancellation is quiet, and target changes reset the baseline', async () => {
  const monitor = await createMonitor(input());
  for (let index = 0; index < 15; index++) await finish(monitor.id, report());
  assert.equal((await getMonitor(monitor.id)).runs.length, 12);
  for (let index = 0; index < 23; index++)
    await failMonitorRun(monitor.id, new Error(`Failure ${index}`));
  assert.equal((await getMonitor(monitor.id)).notifications.length, 20);
  await failMonitorRun(monitor.id, { code: 'ABORTED', message: 'Đã hủy' });
  assert.equal((await getMonitor(monitor.id)).notifications.length, 20);
  const updated = await updateMonitor(monitor.id, { url: `${origin}new-site` });
  assert.equal(updated.lastStatus, 'never');
  assert.equal(updated.lastReportId, null);
  assert.deepEqual(updated.runs, []);
  assert.deepEqual(updated.notifications, []);
});

test('restart recovers interrupted scans and removing a report cleans monitor links without removing other reports', async () => {
  const monitor = await createMonitor(input());
  const first = report();
  const second = report({ score: 70 });
  await finish(monitor.id, first);
  await finish(monitor.id, second);
  await claimMonitorRun(monitor.id);
  await recoverMonitorRuns();
  assert.equal((await getMonitor(monitor.id)).lastStatus, 'error');
  assert.equal((await dueMonitors()).length, 1);
  await removeMonitorReport(second.id, () =>
    fs.rm(store.reportDir(second.id), { recursive: true, force: true }),
  );
  const current = await getMonitor(monitor.id);
  assert.equal(current.lastReportId, first.id);
  assert.equal(current.previousReportId, null);
  assert.equal(current.runs.length, 1);
  assert.equal(current.notifications[0].reportId, null);
  assert.ok(await store.readReport(first.id));
  await deleteMonitor(monitor.id);
  assert.ok(await store.readReport(first.id), 'deleting a monitor preserves audit reports');
  const another = await createMonitor(input());
  const middle = report({ device: 'desktop' });
  const latest = report({ device: 'desktop' });
  await finish(another.id, first);
  await finish(another.id, middle);
  await finish(another.id, latest);
  assert.equal((await getMonitor(another.id)).runs.at(-1).comparable, true);
  await removeMonitorReport(middle.id, () =>
    fs.rm(store.reportDir(middle.id), { recursive: true, force: true }),
  );
  assert.equal(
    (await getMonitor(another.id)).runs.at(-1).comparable,
    false,
    'deleting a middle report must break chart continuity rather than connect incompatible measurements',
  );
});

test('API and scheduler share the audit lock, defer while busy, persist across restart and reject unsafe inputs', async () => {
  let runs = 0;
  let release;
  let hold = true;
  const runner = async ({ id, url, device, signal }) => {
    runs++;
    if (hold)
      await new Promise((resolve, reject) => {
        release = resolve;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    return report({ id, url, device });
  };
  let instance = createApp({ auditRunner: runner, monitorPollMs: 35, startupDelayMs: 20 });
  let server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let base = `http://127.0.0.1:${server.address().port}`;
  async function json(route, body, method = 'POST', headers = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  async function until(predicate) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(
      `timed out waiting for scheduler: ${JSON.stringify({
        runs,
        monitors: await store.readMonitors(),
        jobs: [...instance.jobs.values()].map(({ id, status, error }) => ({ id, status, error })),
      })}`,
    );
  }
  const stop = async () => {
    instance.close();
    await until(() => [...instance.jobs.values()].every((job) => job.status !== 'running'));
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  try {
    assert.equal(
      (await json('/api/monitors', input({ url: 'http://169.254.169.254' }))).status,
      400,
    );
    assert.equal(
      (await json('/api/monitors', input(), 'POST', { Origin: 'https://evil.example' })).status,
      403,
    );
    const created = await json('/api/monitors', input());
    assert.equal(created.status, 201);
    const id = created.body.id;
    const [normal, monitor] = await Promise.all([
      json('/api/audits', { url: origin }),
      json(`/api/monitors/${id}/run`),
    ]);
    assert.deepEqual([normal.status, monitor.status].sort(), [202, 409]);
    await until(() => runs === 1);
    assert.equal(
      (await json(`/api/monitors/${id}`, { url: 'http://192.168.1.1' }, 'PATCH')).status,
      monitor.status === 202 ? 409 : 400,
    );
    const second = await json('/api/monitors', input({ name: 'Second' }));
    await due(second.body.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(runs, 1, 'scheduler cannot start while manual audit is active');
    hold = false;
    release();
    await until(() => runs === 2);
    await until(async () => (await getMonitor(second.body.id)).lastStatus === 'healthy');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(runs, 2, 'overdue history runs once rather than replaying missed intervals');
    await json(`/api/monitors/${id}`, { active: false }, 'PATCH');
    await due(id);
    await stop();
    instance = createApp({ auditRunner: runner, monitorPollMs: 35, startupDelayMs: 20 });
    server = instance.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await json('/api/monitors', null, 'GET')).body.length, 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(runs, 2, 'paused overdue monitor remains paused after restart');
    const deleted = await json(`/api/monitors/${second.body.id}`, null, 'DELETE');
    assert.equal(deleted.status, 200);
    assert.ok((await json('/api/reports', null, 'GET')).body.length >= 2);
    const remaining = await getMonitor(id);
    await due(id);
    await updateMonitor(id, { active: true, url: 'http://192.168.1.1' });
    await due(id);
    await until(async () => (await getMonitor(id)).lastStatus === 'error');
    assert.ok(
      new Date((await getMonitor(id)).nextRunAt) > new Date(),
      'failed URL validation advances schedule',
    );
    const count = (await getMonitor(id)).notifications.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      (await getMonitor(id)).notifications.length,
      count,
      'polling does not repeat a failed run',
    );
    assert.ok(remaining);
  } finally {
    await stop();
  }
});
