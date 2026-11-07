import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { brandingReport, csvRows } from './fixtures/branding-report.mjs';
import { reportHtml, exportCsv } from '../server/export.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-workspace-test-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const store = await import('../server/store.mjs');
const workspace = await import('../server/workspace.mjs');
const { defaultBranding, updateBranding } = await import('../server/branding.mjs');
const { createApp } = await import('../server/index.mjs');
const { createMonitor, getMonitor, claimMonitorRun, failMonitorRun } =
  await import('../server/monitor.mjs');
const clientInput = { name: 'Mộc Studio', contact: 'hello@moc.example', notes: 'Chăm sóc website' };
const projectInput = (clientId, extra = {}) => ({
  clientId,
  name: 'Website chính',
  websites: ['https://client.example/'],
  notes: '',
  ...extra,
});
beforeEach(async () => {
  await store.withWorkspaceLock(() =>
    store.saveWorkspace({ version: 1, clients: [], projects: [], reports: {}, monitors: {} }),
  );
  await store.withMonitorsLock(() => store.saveMonitors([]));
  await updateBranding(defaultBranding);
});
after(async () => {
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-workspace-test-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
});
test('client and project inputs whitelist fields, bound text and normalize website lists', () => {
  assert.deepEqual(workspace.validateClient({ ...clientInput, name: ' Mộc ', secret: true }), {
    ...clientInput,
    name: 'Mộc',
  });
  const clientId = randomUUID();
  assert.deepEqual(
    workspace.validateProject(
      projectInput(clientId, { websites: ['https://example.com', 'https://example.com/'] }),
    ).websites,
    ['https://example.com/'],
  );
  for (const input of [
    null,
    [],
    {},
    { name: ' ' },
    { ...clientInput, contact: 'x'.repeat(161) },
    {
      ...clientInput,
      branding: { ...defaultBranding, logoDataUrl: 'https://example.com/logo.png' },
    },
  ])
    assert.throws(() => workspace.validateClient(input));
  for (const extra of [
    { clientId: 'bad' },
    { name: '' },
    { websites: [] },
    { websites: Array(11).fill('https://example.com') },
    { websites: ['file:///secret'] },
  ])
    assert.throws(() => workspace.validateProject(projectInput(clientId, extra)));
});
test('concurrent client/project changes persist and client deletion requires moving or deleting projects', async () => {
  const clients = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      workspace.createClient({ ...clientInput, name: `Khách hàng ${index}` }),
    ),
  );
  const projects = await Promise.all(
    clients.map((client) => workspace.saveProject(null, projectInput(client.id))),
  );
  assert.equal((await workspace.getWorkspace()).projects.length, 8);
  await assert.rejects(() => workspace.deleteClient(clients[0].id), { code: 'BUSY' });
  await workspace.saveProject(projects[0].id, { clientId: clients[1].id });
  await workspace.deleteClient(clients[0].id);
  assert.equal((await workspace.getWorkspace()).clients.length, 7);
  assert.equal(
    (await workspace.getWorkspace()).projects.find((p) => p.id === projects[0].id).clientId,
    clients[1].id,
  );
  await assert.rejects(() => workspace.saveProject(null, projectInput(randomUUID())), {
    code: 'NOT_FOUND',
  });
});
test('corrupt or inconsistent workspace is preserved on attempted writes', async () => {
  for (const invalid of [
    '{bad',
    'null',
    '{"version":1,"clients":[],"projects":[],"reports":[],"monitors":{}}',
    JSON.stringify({
      version: 1,
      clients: [],
      projects: [{ ...projectInput(randomUUID()), id: randomUUID() }],
      reports: {},
      monitors: {},
    }),
  ]) {
    await fs.writeFile(store.workspaceFile, invalid);
    await assert.rejects(() => workspace.createClient(clientInput));
    assert.equal(await fs.readFile(store.workspaceFile, 'utf8'), invalid);
  }
});
test('resource membership is explicit and deleting a project detaches without deleting audits or monitors', async () => {
  const client = await workspace.createClient(clientInput);
  const project = await workspace.saveProject(null, projectInput(client.id));
  const report = brandingReport();
  await store.saveReport(report);
  const monitor = await createMonitor({
    name: 'Theo dõi',
    url: 'https://client.example/',
    device: 'mobile',
    maxPages: 5,
    interval: 'weekly',
  });
  await Promise.all([
    workspace.assignResource('reports', report.id, project.id),
    workspace.assignResource('monitors', monitor.id, project.id),
  ]);
  await assert.rejects(() => workspace.assignResource('reports', report.id, randomUUID()), {
    code: 'NOT_FOUND',
  });
  await workspace.deleteProject(project.id);
  assert.deepEqual((await workspace.getWorkspace()).reports, {});
  assert.deepEqual((await workspace.getWorkspace()).monitors, {});
  assert.deepEqual(await store.readReport(report.id), report);
  assert.ok(await getMonitor(monitor.id));
  assert.equal(
    await workspace.assignResource('reports', report.id, project.id, { allowMissing: true }),
    false,
  );
});
test('exports choose each client brand, inherit current global branding and escape project context', async () => {
  const first = await workspace.createClient({
    ...clientInput,
    name: '=CUSTOMER()',
    branding: { ...defaultBranding, agencyName: 'Agency A' },
  });
  const second = await workspace.createClient({ ...clientInput, name: 'Khách B' });
  const p1 = await workspace.saveProject(
    null,
    projectInput(first.id, { name: '<script>project</script>' }),
  );
  const p2 = await workspace.saveProject(null, projectInput(second.id));
  const a = brandingReport(),
    b = brandingReport();
  await Promise.all([store.saveReport(a), store.saveReport(b)]);
  await workspace.assignResource('reports', a.id, p1.id);
  await workspace.assignResource('reports', b.id, p2.id);
  await updateBranding({ agencyName: 'Agency chung' });
  const contextA = await workspace.exportContext(a.id);
  assert.equal(contextA.branding.agencyName, 'Agency A');
  assert.equal((await workspace.exportContext(b.id)).branding.agencyName, 'Agency chung');
  const html = reportHtml(a, contextA.branding, contextA.context);
  assert.ok(html.includes('&lt;script&gt;project&lt;/script&gt;') && !html.includes('<script>'));
  const csv = csvRows(exportCsv(a, contextA.branding, contextA.context));
  assert.equal(csv[1][11], "'=CUSTOMER()");
  assert.equal(csv[1][12], '<script>project</script>');
  await workspace.updateClient(first.id, { branding: null });
  assert.equal((await workspace.exportContext(a.id)).branding.agencyName, 'Agency chung');
  assert.equal((await workspace.exportContext(randomUUID())).context, null);
});
test('project task list uses the latest audit per requested URL and excludes other projects', async () => {
  const client = await workspace.createClient(clientInput);
  const project = await workspace.saveProject(null, projectInput(client.id));
  const old = brandingReport(),
    latest = brandingReport(),
    otherUrl = brandingReport(),
    unassigned = brandingReport();
  old.createdAt = '2026-10-23T00:00:00Z';
  latest.createdAt = '2026-10-24T00:00:00Z';
  latest.checks[0].assignee = 'Linh';
  otherUrl.url = otherUrl.requestedUrl = 'https://second.example/';
  for (const report of [old, latest, otherUrl, unassigned]) {
    await store.saveReport(report);
    if (report !== unassigned) await workspace.assignResource('reports', report.id, project.id);
  }
  const tasks = await workspace.projectTasks(project.id);
  assert.equal(tasks.length, latest.checks.length + otherUrl.checks.length);
  assert.ok(tasks.some((task) => task.check.assignee === 'Linh'));
  assert.ok(tasks.every((task) => task.reportId !== old.id && task.reportId !== unassigned.id));
});
test('task metadata validates dates and statuses without changing audit measurement fields', () => {
  assert.deepEqual(
    workspace.validateTaskPatch({
      assignee: ' Linh ',
      dueDate: '2028-02-29',
      workflow: 'doing',
      status: 'pass',
      weight: 999,
    }),
    { assignee: 'Linh', dueDate: '2028-02-29', workflow: 'doing', done: false },
  );
  assert.deepEqual(workspace.validateTaskPatch({ done: true }), { done: true, workflow: 'done' });
  for (const input of [
    {},
    { dueDate: '2026-02-29' },
    { dueDate: 'invalid' },
    { dueDate: '2026-13-01' },
    { assignee: 'x'.repeat(81) },
    { workflow: 'passed' },
    { workflow: 'doing', done: true },
    { done: 'yes' },
  ])
    assert.throws(() => workspace.validateTaskPatch(input));
});
test('API binds manual and monitor audits to a project, guards live runs and preserves score on task changes', async () => {
  let hold = true,
    release;
  const runner = async ({ id, url, device }) => {
    if (hold)
      await new Promise((resolve) => {
        release = resolve;
      });
    return { ...brandingReport(), id, url, requestedUrl: url, device };
  };
  const instance = createApp({ auditRunner: runner, startupDelayMs: 60_000 });
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = async (route, body, method = 'POST', headers = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const until = async (predicate) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('Project job did not finish');
  };
  try {
    assert.equal(
      (await json('/api/clients', clientInput, 'POST', { Origin: 'https://evil.example' })).status,
      403,
    );
    const client = (await json('/api/clients', clientInput)).body;
    assert.equal(
      (
        await json(
          '/api/projects',
          projectInput(client.id, { websites: ['http://169.254.169.254/'] }),
        )
      ).status,
      400,
    );
    const project = (
      await json('/api/projects', projectInput(client.id, { websites: ['http://127.0.0.1:9998/'] }))
    ).body;
    assert.ok(project.id);
    assert.equal((await json(`/api/clients/${client.id}`, null, 'DELETE')).status, 409);
    const started = await json('/api/audits', {
      url: 'http://127.0.0.1:9998/',
      device: 'mobile',
      maxPages: 1,
      projectId: project.id,
    });
    assert.equal(started.status, 202);
    await until(() => release);
    assert.equal((await json(`/api/projects/${project.id}`, null, 'DELETE')).status, 409);
    hold = false;
    release();
    await until(() => instance.jobs.get(started.body.id).status === 'completed');
    assert.equal((await workspace.getWorkspace()).reports[started.body.id], project.id);
    const report = await store.readReport(started.body.id);
    const change = await json(
      `/api/reports/${report.id}/checks/${report.checks[1].id}`,
      { assignee: 'Minh', dueDate: '2026-12-01', workflow: 'done' },
      'PATCH',
    );
    assert.equal(change.status, 200);
    const saved = await store.readReport(report.id);
    assert.equal(saved.score, report.score);
    assert.equal(saved.checks[1].status, report.checks[1].status);
    assert.ok(saved.checks[1].done);
    const exported = (await json(`/api/reports/${report.id}/export?format=json`, null, 'GET')).body;
    assert.equal(exported.context.project.id, project.id);
    const monitor = (
      await json('/api/monitors', {
        name: 'Dự án',
        url: 'http://127.0.0.1:9998/',
        device: 'mobile',
        maxPages: 1,
        interval: 'weekly',
        projectId: project.id,
      })
    ).body;
    assert.equal((await workspace.getWorkspace()).monitors[monitor.id], project.id);
    await claimMonitorRun(monitor.id);
    assert.equal(
      (await json(`/api/monitors/${monitor.id}/project`, { projectId: null }, 'PATCH')).status,
      409,
    );
    await failMonitorRun(monitor.id, { code: 'ABORTED', message: 'test' });
    const monitored = await json(`/api/monitors/${monitor.id}/run`, {});
    assert.equal(monitored.status, 202);
    await until(() => instance.jobs.get(monitored.body.id).status === 'completed');
    assert.equal((await workspace.getWorkspace()).reports[monitored.body.id], project.id);
    assert.equal(
      (await json(`/api/reports/${report.id}/project`, { projectId: randomUUID() }, 'PATCH'))
        .status,
      404,
    );
    assert.equal((await json(`/api/projects/${project.id}`, null, 'DELETE')).status, 200);
    assert.ok(await store.readReport(report.id));
    assert.ok(await getMonitor(monitor.id));
    assert.deepEqual((await workspace.getWorkspace()).reports, {});
  } finally {
    hold = false;
    release?.();
    instance.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
