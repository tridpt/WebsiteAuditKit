import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { brandingReport, csvRows } from './fixtures/branding-report.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-batch-test-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const store = await import('../server/store.mjs');
const workspace = await import('../server/workspace.mjs');
const { createApp } = await import('../server/index.mjs');
const { createMonitor } = await import('../server/monitor.mjs');
const { batchHtml, batchCsv } = await import('../server/batch-export.mjs');
const { createBatchManager } = await import('../server/batch.mjs');
const { batchComparisonHtml, batchComparisonCsv } = await import('../server/batch-export.mjs');
const { defaultBranding } = await import('../server/branding.mjs');
const urls = ['http://127.0.0.1/one', 'http://127.0.0.1/two', 'http://127.0.0.1/three'];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = ({ id, url, device }) => ({
  ...brandingReport(),
  id,
  url,
  requestedUrl: url,
  device,
  createdAt: new Date().toISOString(),
});
async function seed(websites = urls) {
  const client = await workspace.createClient({ name: 'Khách hàng hàng đợi' });
  const project = await workspace.saveProject(null, {
    clientId: client.id,
    name: 'Kiểm tra cả dự án',
    websites,
  });
  return { client, project };
}
async function withApp(runner, work) {
  const instance = createApp({ auditRunner: runner, startupDelayMs: 60_000 });
  await instance.batches.ready;
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  process.env.PORT = String(server.address().port);
  const json = async (route, body, method = 'GET', extra = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return {
      status: res.status,
      body: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text,
    };
  };
  const wait = async (route, predicate = (b) => b.status !== 'running') => {
    for (let i = 0; i < 500; i++) {
      const result = await json(route);
      assert.equal(result.status, 200);
      if (predicate(result.body)) return result.body;
      await pause(10);
    }
    throw new Error('Batch did not reach expected state.');
  };
  try {
    await work({ instance, json, wait });
  } finally {
    await instance.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
beforeEach(async () => {
  await store.saveWorkspace({ version: 1, clients: [], projects: [], reports: {}, monitors: {} });
  await store.saveBatches([]);
  await store.saveMonitors([]);
});
after(async () => {
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-batch-test-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
});

test('batch serializes websites, reserves the audit slot and preserves successful reports through retry', async () => {
  const { project } = await seed();
  const monitor = await createMonitor({
    name: 'Lịch chờ',
    url: urls[0],
    device: 'mobile',
    maxPages: 1,
    interval: 'weekly',
  });
  const calls = [];
  let concurrent = 0;
  let peak = 0;
  let fail = true;
  await withApp(
    async (input) => {
      calls.push(input.url);
      concurrent++;
      peak = Math.max(peak, concurrent);
      try {
        await pause(70);
        if (input.url === urls[1] && fail) throw new Error('Website tạm lỗi');
        return report(input);
      } finally {
        concurrent--;
      }
    },
    async ({ json, wait }) => {
      const base = `/api/projects/${project.id}/batches`;
      const started = await Promise.all([
        json(base, { device: 'desktop', maxPages: 1 }, 'POST'),
        json(base, {}, 'POST'),
      ]);
      assert.deepEqual(started.map((r) => r.status).sort(), [202, 409]);
      const batch = started.find((r) => r.status === 202).body;
      assert.equal((await json('/api/audits', { url: urls[0] }, 'POST')).status, 409);
      assert.equal((await json(`/api/monitors/${monitor.id}/run`, {}, 'POST')).status, 409);
      assert.equal(
        (await json(`/api/projects/${project.id}`, { name: 'Không đổi' }, 'PATCH')).status,
        409,
      );
      assert.equal((await json(`/api/projects/${project.id}`, undefined, 'DELETE')).status, 409);
      assert.equal((await json(`${base}/${batch.id}/export?format=json`)).status, 409);
      const done = await wait(`${base}/${batch.id}`);
      assert.equal(done.status, 'partial');
      assert.equal(done.progress, 100);
      assert.equal(peak, 1);
      assert.deepEqual(calls, urls);
      const ids = done.items.map((item) => item.reportId);
      assert.ok(ids[0] && ids[2]);
      assert.equal(ids[1], null);
      fail = false;
      const retry = await json(`${base}/${batch.id}/retry`, {}, 'POST');
      assert.equal(retry.status, 202, JSON.stringify(retry.body));
      const completed = await wait(`${base}/${retry.body.id}`);
      assert.equal(completed.status, 'completed');
      assert.equal(completed.retryOf, batch.id);
      assert.equal(completed.items[0].reportId, ids[0]);
      assert.equal(completed.items[2].reportId, ids[2]);
      assert.deepEqual(calls, [...urls, urls[1]]);
      for (const item of completed.items) {
        const saved = await store.readReport(item.reportId);
        assert.equal(saved.device, 'desktop');
        assert.equal((await workspace.getWorkspace()).reports[item.reportId], project.id);
      }
      assert.equal((await json(`${base}/${completed.id}/retry`, {}, 'POST')).status, 400);
      const summary = (await json(`${base}/${completed.id}/summary`)).body;
      assert.equal(summary.totals.available, 3);
      assert.equal(summary.tasks.length, 24);
      assert.equal((await store.readBatches()).length, 2);
    },
  );
});

test('cancellation aborts current website, never starts remaining URLs and retry only runs unfinished URLs', async () => {
  const { project } = await seed();
  const calls = [];
  let hold = true;
  await withApp(
    async (input) => {
      calls.push(input.url);
      if (input.url === urls[1] && hold)
        await new Promise((resolve, reject) => {
          input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
          if (input.signal.aborted) reject(input.signal.reason);
        });
      return report(input);
    },
    async ({ json, wait }) => {
      const base = `/api/projects/${project.id}/batches`;
      const first = (await json(base, {}, 'POST')).body;
      await wait(
        `${base}/${first.id}`,
        (b) => b.items[1].status === 'running' && Boolean(b.items[1].jobId),
      );
      const cancelled = await json(`${base}/${first.id}/cancel`, {}, 'POST');
      assert.equal(cancelled.status, 200);
      const done = await wait(`${base}/${first.id}`);
      assert.equal(done.status, 'cancelled');
      assert.deepEqual(calls, urls.slice(0, 2));
      assert.equal(done.items[0].status, 'completed');
      assert.deepEqual(
        done.items.slice(1).map((i) => i.status),
        ['cancelled', 'cancelled'],
      );
      assert.ok(await store.readReport(done.items[0].reportId));
      const partial = (await json(`${base}/${first.id}/summary`)).body;
      assert.equal(partial.totals.incomplete, 2);
      assert.equal(partial.websites.filter((s) => s.score !== null).length, 1);
      hold = false;
      const retry = (await json(`${base}/${first.id}/retry`, {}, 'POST')).body;
      assert.equal((await wait(`${base}/${retry.id}`)).status, 'completed');
      assert.deepEqual(calls, [urls[0], urls[1], urls[1], urls[2]]);
    },
  );
});

test('restart recovers interrupted queue without silently resuming and preserves completed results', async () => {
  const { project } = await seed();
  const saved = report({ id: randomUUID(), url: urls[0], device: 'mobile' });
  await store.saveReport(saved);
  await workspace.assignResource('reports', saved.id, project.id);
  const id = randomUUID();
  await store.saveBatches([
    {
      id,
      projectId: project.id,
      projectName: project.name,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      status: 'running',
      device: 'mobile',
      maxPages: 1,
      retryOf: null,
      cancelRequested: false,
      error: null,
      items: urls.map((url, i) => ({
        url,
        status: i === 0 ? 'completed' : i === 1 ? 'running' : 'queued',
        reportId: i === 0 ? saved.id : null,
        error: null,
      })),
    },
  ]);
  const calls = [];
  await withApp(
    async (input) => {
      calls.push(input.url);
      return report(input);
    },
    async ({ json, wait }) => {
      const base = `/api/projects/${project.id}/batches`;
      const recovered = (await json(`${base}/${id}`)).body;
      assert.equal(recovered.status, 'interrupted');
      assert.equal(calls.length, 0);
      assert.equal(recovered.items[0].reportId, saved.id);
      assert.deepEqual(
        recovered.items.slice(1).map((i) => i.status),
        ['cancelled', 'cancelled'],
      );
      const retried = (await json(`${base}/${id}/retry`, {}, 'POST')).body;
      await wait(`${base}/${retried.id}`);
      assert.deepEqual(calls, urls.slice(1));
    },
  );
});

test('each website revalidates network access and a blocked URL does not halt the rest of the queue', async () => {
  const { project } = await seed(['http://169.254.169.254/', urls[0]]);
  const calls = [];
  await withApp(
    async (input) => {
      calls.push(input.url);
      return report(input);
    },
    async ({ json, wait }) => {
      const base = `/api/projects/${project.id}/batches`;
      for (const input of [{ device: 'tablet' }, { maxPages: 100 }, [], null])
        assert.equal((await json(base, input, 'POST')).status, 400);
      assert.equal((await json(base, {}, 'POST', { 'sec-fetch-site': 'cross-site' })).status, 403);
      const started = (await json(base, {}, 'POST')).body;
      const done = await wait(`${base}/${started.id}`);
      assert.equal(done.status, 'partial');
      assert.equal(done.items[0].status, 'failed');
      assert.deepEqual(calls, [urls[0]]);
    },
  );
});

test('aggregate excludes removed reports, keeps unmeasured scores empty and escapes HTML and CSV content', async () => {
  const { project, client } = await seed(urls.slice(0, 2));
  await workspace.updateClient(client.id, {
    name: '=HYPERLINK("evil")',
    branding: { ...defaultBranding, agencyName: 'Mộc <Studio>' },
  });
  await withApp(
    async (input) => {
      const data = report(input);
      data.score = input.url === urls[0] ? 21 : null;
      data.checks[0].title = '<script>alert(1)</script>';
      data.checks[0].done = false;
      data.checks[1].title = '\t=HYPERLINK("evil")';
      return data;
    },
    async ({ json, wait }) => {
      const base = `/api/projects/${project.id}/batches`;
      const started = (await json(base, {}, 'POST')).body;
      const done = await wait(`${base}/${started.id}`);
      const summary = (await json(`${base}/${done.id}/summary`)).body;
      assert.deepEqual(
        summary.websites.map((s) => s.score),
        [21, null],
      );
      const html = batchHtml(summary, { ...defaultBranding, agencyName: 'Mộc <Studio>' });
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(!html.includes('<script>'));
      assert.ok(html.includes('Mộc &lt;Studio&gt;'));
      const rows = csvRows(batchCsv(summary, defaultBranding));
      assert.ok(rows.every((row) => row.length === 19));
      assert.ok(rows.slice(1).every((row) => row[1].startsWith("'=")));
      assert.ok(rows.some((row) => row[11].startsWith("'\t=")));
      assert.equal(
        (await json(`${base}/${done.id}/export?format=json`)).body.branding.agencyName,
        'Mộc <Studio>',
      );
      await workspace.assignResource('reports', done.items[0].reportId, null);
      const without = (await json(`${base}/${done.id}/summary`)).body;
      assert.equal(without.totals.available, 1);
      assert.equal(without.tasks.length, 8);
      assert.ok(without.websites.find((s) => s.url === urls[0]).reportMissing);
      assert.equal((await json(`/api/projects/${project.id}`, undefined, 'DELETE')).status, 200);
      assert.deepEqual(await store.readBatches(), []);
      assert.ok(await store.readReport(done.items[1].reportId));
    },
  );
});

test('corrupt queue data is preserved and batch writes are refused', async () => {
  const { project } = await seed();
  const invalid = '[{"status":"running"}]';
  await fs.writeFile(store.batchesFile, invalid);
  await withApp(report, async ({ json }) => {
    assert.equal((await json(`/api/projects/${project.id}/batches`, {}, 'POST')).status, 500);
    assert.equal((await json(`/api/projects/${project.id}`, undefined, 'DELETE')).status, 500);
    assert.ok((await workspace.getWorkspace()).projects.some((item) => item.id === project.id));
    assert.equal(await fs.readFile(store.batchesFile, 'utf8'), invalid);
  });
});

test('a failed progress write stops the active audit before starting the next website', async () => {
  const { project } = await seed(urls.slice(0, 2));
  let saves = 0;
  let activeCount = 0;
  let peak = 0;
  let abortCount = 0;
  const jobs = new Map();
  const manager = createBatchManager({
    storage: {
      read: async () => [],
      save: async () => {
        if (++saves === 3) throw new Error('Tệp tạm thời bị khóa');
      },
    },
    getJob: (id) => jobs.get(id),
    isBusy: () => activeCount > 0,
    createJob: async () => {
      activeCount++;
      peak = Math.max(peak, activeCount);
      const job = {
        id: randomUUID(),
        status: 'running',
        controller: new AbortController(),
        error: null,
      };
      job.completion = new Promise((resolve) => {
        const finish = (cancelled) => {
          if (job.status !== 'running') return;
          activeCount--;
          job.status = cancelled ? 'cancelled' : 'completed';
          if (cancelled) abortCount++;
          resolve();
        };
        job.controller.signal.addEventListener('abort', () => finish(true), { once: true });
        setTimeout(() => finish(false), 80);
      });
      jobs.set(job.id, job);
      return job;
    },
  });
  await manager.ready;
  const batch = await manager.start(project.id);
  let done;
  for (let i = 0; i < 200; i++) {
    done = await manager.get(project.id, batch.id);
    if (done.status !== 'running') break;
    await pause(10);
  }
  await manager.close();
  assert.equal(done.status, 'partial');
  assert.equal(done.items[0].status, 'failed');
  assert.equal(done.items[1].status, 'completed');
  assert.equal(peak, 1);
  assert.equal(abortCount, 1);
  assert.equal(activeCount, 0);
});

test('batch comparison aligns URLs, classifies score and issue changes, and exports the selected pair', async () => {
  const { project, client } = await seed([urls[0], urls[1]]);
  const before = report({ id: randomUUID(), url: urls[0], device: 'mobile' });
  before.createdAt = '2026-10-24T01:00:00.000Z';
  before.score = 51;
  before.requestedUrl = urls[0];
  before.checks[1].status = 'fail';
  before.checks[2].status = 'pass';
  const beforeSecond = { ...before, id: randomUUID(), url: urls[1], requestedUrl: urls[1] };
  const after = report({ id: randomUUID(), url: urls[0], device: 'mobile' });
  after.createdAt = '2026-10-24T03:00:00.000Z';
  after.score = 71;
  after.requestedUrl = urls[0];
  after.checks[1].status = 'pass';
  after.checks[2].status = 'fail';
  const afterSecond = {
    ...after,
    id: randomUUID(),
    url: urls[1],
    requestedUrl: urls[1],
    score: 41,
  };
  await store.saveReport(before);
  await store.saveReport(beforeSecond);
  await store.saveReport(after);
  await store.saveReport(afterSecond);
  await workspace.assignResource('reports', before.id, project.id);
  await workspace.assignResource('reports', beforeSecond.id, project.id);
  await workspace.assignResource('reports', after.id, project.id);
  await workspace.assignResource('reports', afterSecond.id, project.id);
  const beforeBatch = {
    id: randomUUID(),
    projectId: project.id,
    projectName: project.name,
    createdAt: '2026-10-24T01:30:00.000Z',
    finishedAt: '2026-10-24T01:40:00.000Z',
    status: 'completed',
    device: 'mobile',
    maxPages: 1,
    retryOf: null,
    cancelRequested: false,
    error: null,
    items: [
      { url: urls[0], status: 'completed', reportId: before.id, error: null },
      { url: urls[1], status: 'completed', reportId: beforeSecond.id, error: null },
    ],
  };
  const afterBatch = {
    ...beforeBatch,
    id: randomUUID(),
    createdAt: '2026-10-24T03:30:00.000Z',
    finishedAt: '2026-10-24T03:40:00.000Z',
    items: [
      { url: urls[0], status: 'completed', reportId: after.id, error: null },
      { url: urls[1], status: 'completed', reportId: afterSecond.id, error: null },
    ],
  };
  await store.saveBatches([afterBatch, beforeBatch]);
  await withApp(report, async ({ json }) => {
    const endpoint = `/api/projects/${project.id}/batch-comparison`;
    const comparison = (await json(`${endpoint}?before=${beforeBatch.id}&after=${afterBatch.id}`))
      .body;
    assert.equal(comparison.status, undefined);
    assert.equal(comparison.project.id, project.id);
    assert.equal(comparison.totals.websites, 2);
    assert.equal(comparison.totals.common, 2);
    assert.equal(comparison.websites.find((site) => site.url === urls[0]).status, 'improved');
    assert.equal(comparison.websites.find((site) => site.url === urls[1]).status, 'regressed');
    assert.equal(comparison.websites.find((site) => site.url === urls[0]).scoreDelta, 20);
    assert.ok(comparison.totals.resolvedIssues > 0);
    assert.ok(comparison.totals.newIssues > 0);
    assert.equal(comparison.trends.weekly.periods.length, 12);
    assert.equal(comparison.trends.monthly.series.length, 2);
    const html = batchComparisonHtml(comparison, {
      ...defaultBranding,
      agencyName: 'Mộc <Studio>',
    });
    assert.ok(html.includes('Mộc &lt;Studio&gt;'));
    assert.ok(html.includes('Lỗi mới') && html.includes('Đã sửa'));
    const csv = csvRows(batchComparisonCsv(comparison, defaultBranding));
    assert.ok(csv.length > 2 && csv.every((row) => row.length === 22));
    assert.equal(
      (await json(`${endpoint}/export?before=${beforeBatch.id}&after=${afterBatch.id}&format=json`))
        .body.before.id,
      beforeBatch.id,
    );
    assert.equal(
      (await json(`${endpoint}?before=${afterBatch.id}&after=${beforeBatch.id}`)).status,
      400,
    );
    assert.equal(
      (await json(`${endpoint}?before=${beforeBatch.id}&after=${beforeBatch.id}`)).status,
      400,
    );
    assert.equal((await json(`${endpoint}?before=bad&after=${afterBatch.id}`)).status, 400);
    assert.equal(
      (await json(`${endpoint}/export?before=${beforeBatch.id}&after=${afterBatch.id}&format=xml`))
        .status,
      400,
    );
    assert.equal(
      (
        await json(
          `${endpoint}/export?before=${beforeBatch.id}&after=${afterBatch.id}&format=html&interval=daily`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await json(
          `${endpoint}/export?before=${beforeBatch.id}&after=${afterBatch.id}&format=html&url=bad`,
        )
      ).status,
      400,
    );
    assert.equal(
      (await workspace.getWorkspace()).clients.find((item) => item.id === client.id).name,
      client.name,
    );
  });
});
