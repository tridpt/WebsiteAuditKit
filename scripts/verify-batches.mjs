import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import AxeBuilder from '@axe-core/playwright';
import { brandingReport, csvRows } from '../tests/fixtures/branding-report.mjs';
import { startFixture } from './fixture.mjs';

const real = process.argv.includes('--real');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-batch-verify-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const { createApp } = await import('../server/index.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const { defaultBranding } = await import('../server/branding.mjs');
const store = await import('../server/store.mjs');
const { fixture, url: fixtureUrl } = await startFixture();
const urls = [`${fixtureUrl}/`, `${fixtureUrl}/about`, `${fixtureUrl}/third`].slice(
  0,
  real ? 2 : 3,
);
const calls = [];
let failSecond = true;
let cancelMode = false;
const runner = async (input) => {
  calls.push(input.url);
  input.onProgress(45, 'Đang kiểm tra hàng đợi với dữ liệu giả lập…');
  if (cancelMode && input.url === urls[1])
    await new Promise((resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
      if (input.signal.aborted) reject(input.signal.reason);
    });
  await new Promise((resolve) => setTimeout(resolve, 2200));
  if (failSecond && input.url === urls[1])
    throw new Error('Website tạm thời không phản hồi. Thử lại sau.');
  const data = brandingReport();
  data.checks = data.checks.slice(1, 4);
  return {
    ...data,
    id: input.id,
    url: input.url,
    requestedUrl: input.url,
    createdAt: new Date().toISOString(),
    device: input.device,
    score: input.url === urls[0] ? 33 : input.url === urls[1] ? 79 : 68,
  };
};
const instance = createApp({ ...(real ? {} : { auditRunner: runner }), startupDelayMs: 60_000 });
const server = instance.app.listen(0, '127.0.0.1');
await once(server, 'listening');
process.env.PORT = String(server.address().port);
const base = `http://127.0.0.1:${server.address().port}`;
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const json = async (route, body, method = 'GET') => {
  const response = await fetch(base + route, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};
async function waitBatch(route, predicate = (b) => b.status !== 'running') {
  const until = Date.now() + (real ? 300_000 : 40_000);
  while (Date.now() < until) {
    const { body } = await json(route);
    if (predicate(body)) return body;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timed out waiting for batch.');
}
const browser = await launchBrowser();
let page;
try {
  const client = (
    await json('/api/clients', { name: 'Mộc Studio', contact: 'Linh · hello@moc.example' }, 'POST')
  ).body;
  const project = (
    await json(
      '/api/projects',
      {
        clientId: client.id,
        name: real ? 'Dự án Lighthouse thật' : 'Chăm sóc Mộc Studio',
        websites: urls,
      },
      'POST',
    )
  ).body;
  assert.ok(project.id);
  const route = `/api/projects/${project.id}/batches`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function openProject() {
    if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('button', { name: 'Khách hàng & dự án', exact: true }).click();
    await page.getByRole('button', { name: `Mở dự án ${project.name}`, exact: true }).click();
    await page.getByRole('heading', { name: `${project.name}.`, exact: true }).waitFor();
  }
  async function axe(label) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      [],
      label,
    );
  }
  async function noOverflow() {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  async function screenshot(name) {
    await page.screenshot({
      path: path.join(artifacts, name),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.goto(base, { waitUntil: 'networkidle' });
  if (!real) {
    const logo = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 100;
      const x = c.getContext('2d');
      x.fillStyle = '#28664f';
      x.fillRect(0, 0, 240, 100);
      x.fillStyle = '#fff';
      x.font = 'bold 45px Arial';
      x.fillText('MỘC', 24, 68);
      return c.toDataURL('image/png');
    });
    await json(
      `/api/clients/${client.id}`,
      {
        branding: {
          ...defaultBranding,
          agencyName: 'Mộc Digital',
          tagline: 'Chăm sóc website cho Mộc Studio',
          footer: 'Mộc Digital · hello@moc.example',
          logoDataUrl: logo,
        },
      },
      'PATCH',
    );
    await page.reload({ waitUntil: 'networkidle' });
  }
  await openProject();
  const panel = page.getByRole('region', { name: 'Kiểm tra toàn bộ dự án', exact: true });
  await panel.getByText('Chưa có lần kiểm tra toàn bộ.', { exact: false }).waitFor();
  await axe('Empty batch panel');
  await page.getByLabel('Thiết bị kiểm tra dự án').selectOption(real ? 'mobile' : 'desktop');
  await page.getByLabel('Số trang mỗi website trong dự án').selectOption('1');
  await panel.getByRole('button', { name: 'Kiểm tra toàn bộ dự án', exact: true }).click();
  await panel.locator('.batch-status.running').waitFor();
  const first = (await json(route)).body[0];
  assert.equal((await json(route, {}, 'POST')).status, 409);
  await axe('Running batch and progress');
  await screenshot(real ? 'batch-real-running.png' : 'batch-running.png');
  const done = await waitBatch(`${route}/${first.id}`);
  if (real) {
    assert.equal(done.status, 'completed', JSON.stringify(done));
    assert.equal(done.items.length, 2);
    for (const item of done.items) {
      const report = await store.readReport(item.reportId);
      assert.ok(report.lighthouse.available, report.lighthouse.error);
      assert.equal(report.categories.performance.source, 'Lighthouse');
      assert.equal(report.batchId, done.id);
      assert.equal(report.requestedUrl, item.url);
      assert.equal((await json('/api/workspace')).body.reports[item.reportId], project.id);
    }
    await panel.locator('.batch-status.completed').waitFor({ timeout: 15_000 });
    const summary = (await json(`${route}/${done.id}/export?format=json`)).body;
    assert.equal(summary.totals.available, 2);
    await noOverflow();
    await axe('Real Lighthouse batch results');
    await screenshot('batch-real-completed.png');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: project batch via UI, two sequential real Lighthouse Mobile audits, saved report membership, summary JSON and accessible results.',
    );
  } else {
    assert.equal(done.status, 'partial');
    assert.deepEqual(calls, urls);
    await panel.locator('.batch-status.partial').waitFor({ timeout: 15_000 });
    assert.equal((await json(`${route}/${done.id}/summary`)).body.totals.incomplete, 1);
    await axe('Partial batch and failed website');
    failSecond = false;
    await panel.getByRole('button', { name: 'Thử lại website chưa xong', exact: true }).click();
    await panel.locator('.batch-status.running').waitFor();
    const second = (await json(route)).body[0];
    const completed = await waitBatch(`${route}/${second.id}`);
    assert.equal(completed.status, 'completed');
    assert.deepEqual(calls, [...urls, urls[1]]);
    assert.equal(completed.items[0].reportId, done.items[0].reportId);
    assert.equal(completed.items[2].reportId, done.items[2].reportId);
    const report = await store.readReport(completed.items[0].reportId);
    await json(
      `/api/reports/${report.id}/checks/${report.checks[0].id}`,
      { assignee: 'Linh', dueDate: '2026-11-15', workflow: 'doing' },
      'PATCH',
    );
    await panel.locator('.batch-status.completed').waitFor({ timeout: 15_000 });
    await axe('Completed batch and priority results');
    await noOverflow();
    await screenshot('batch-desktop.png');
    for (const [format, label] of [
      ['pdf', 'PDF tổng hợp'],
      ['html', 'HTML'],
      ['csv', 'CSV'],
      ['json', 'JSON'],
    ]) {
      const download = page.waitForEvent('download');
      await panel.getByRole('button', { name: label, exact: true }).click();
      await (await download).saveAs(path.join(artifacts, `batch-report.${format}`));
    }
    const exported = JSON.parse(
      await fs.readFile(path.join(artifacts, 'batch-report.json'), 'utf8'),
    );
    assert.equal(exported.branding.agencyName, 'Mộc Digital');
    assert.equal(exported.totals.available, 3);
    assert.ok(exported.tasks.some((task) => task.check.assignee === 'Linh'));
    const csv = csvRows(await fs.readFile(path.join(artifacts, 'batch-report.csv'), 'utf8'));
    assert.ok(csv.every((row) => row.length === 19));
    const html = await fs.readFile(path.join(artifacts, 'batch-report.html'), 'utf8');
    assert.ok(html.includes('Chăm sóc Mộc Studio') && html.includes('Linh'));
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow();
    await axe('Mobile batch results and exports');
    await screenshot('batch-mobile.png');
    cancelMode = true;
    await panel.getByRole('button', { name: 'Kiểm tra toàn bộ dự án', exact: true }).click();
    const third = (await json(route)).body[0];
    await waitBatch(
      `${route}/${third.id}`,
      (b) => b.items[1].status === 'running' && Boolean(b.items[1].jobId),
    );
    await page.reload({ waitUntil: 'networkidle' });
    await openProject();
    await panel.locator('.batch-status.running').waitFor();
    assert.equal((await json(route)).body[0].id, third.id, 'Reload reconnects to same queue');
    await panel.getByRole('button', { name: 'Hủy hàng đợi', exact: true }).click();
    const cancelled = await waitBatch(`${route}/${third.id}`);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.items[0].status, 'completed');
    assert.equal(cancelled.items[2].status, 'cancelled');
    assert.deepEqual(calls.slice(4), urls.slice(0, 2));
    await panel.locator('.batch-status.cancelled').waitFor({ timeout: 15_000 });
    await axe('Mobile cancelled queue after reload');
    await noOverflow();
    await screenshot('batch-cancelled-mobile.png');
    const incomplete = (await json(`${route}/${third.id}/export?format=json`)).body;
    assert.equal(incomplete.totals.incomplete, 2);
    assert.ok(incomplete.websites.filter((s) => !s.reportId).every((s) => s.score === null));
    await page.getByLabel('Lần kiểm tra toàn bộ dự án').selectOption(completed.id);
    await panel.locator('.batch-status.completed').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: UI queue settings/progress, serial execution, failed website continues, selective retry, current report membership and task metadata.',
    );
    console.log(
      'PASS: branded PDF/HTML/CSV/JSON, desktop/mobile results, axe, cancellation preserves completed reports, reload reconnects and no false scores for missing results.',
    );
  }
  console.log(`BATCH CHECKS PASSED (${real ? 'real Lighthouse' : 'synthetic audit runner'}).`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: path.join(artifacts, 'batch-failure.png'), fullPage: true })
      .catch(() => {});
    console.error(
      await page
        .locator('.batch-panel')
        .innerText()
        .catch(() => ''),
    );
  }
  console.error(JSON.stringify(await store.readBatches()));
  throw error;
} finally {
  await instance.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-batch-verify-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
}
