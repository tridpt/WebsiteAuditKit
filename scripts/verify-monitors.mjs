import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import AxeBuilder from '@axe-core/playwright';
import { startFixture } from './fixture.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-monitor-verify-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const { createApp } = await import('../server/index.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const { app, jobs, close } = createApp();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
process.env.PORT = String(server.address().port);
const base = `http://127.0.0.1:${server.address().port}`;
const { fixture, url, setVariant } = await startFixture();
const browser = await launchBrowser();
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const errors = [];
async function json(route, options = {}) {
  const response = await fetch(base + route, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  return { status: response.status, body: await response.json() };
}
async function waitJob(id, expected = 'completed') {
  for (let attempt = 0; attempt < 600; attempt++) {
    const { body } = await json(`/api/jobs/${id}`);
    if (body.status !== 'running') {
      assert.equal(body.status, expected, JSON.stringify(body));
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Monitoring job did not finish in 150 seconds.');
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  async function navigate() {
    if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('button', { name: /^Theo dõi/ }).click();
    await page.getByRole('heading', { name: 'Theo dõi website.' }).waitFor();
  }
  async function axe(label) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          message: node.failureSummary,
        })),
      })),
      [],
      label,
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
  await navigate();
  await page.getByText('Chưa có website nào được theo dõi', { exact: true }).waitFor();
  await axe('Empty monitoring view');
  await page.getByLabel('Tên dự án theo dõi').fill('Website khách hàng A');
  await page.getByLabel('URL website theo dõi').fill('http://169.254.169.254');
  await page.getByRole('button', { name: 'Lưu theo dõi', exact: true }).click();
  await page.locator('.monitor-create-panel [role="alert"]').waitFor();
  assert.equal((await json('/api/monitors')).body.length, 0);
  await page.getByLabel('URL website theo dõi').fill(url);
  await page.getByRole('button', { name: 'Lưu theo dõi', exact: true }).click();
  let card = page.getByRole('article', { name: 'Theo dõi Website khách hàng A', exact: true });
  await card.waitFor();
  let monitor = (await json('/api/monitors')).body[0];
  const id = monitor.id;
  assert.equal(monitor.interval, 'daily');
  assert.ok(new Date(monitor.nextRunAt) > new Date());
  const firstJob = page.waitForResponse(
    (response) => response.url().endsWith(`/api/monitors/${id}/run`) && response.status() === 202,
  );
  await card.getByRole('button', { name: 'Chạy ngay Website khách hàng A', exact: true }).click();
  const first = await (await firstJob).json();
  await waitJob(first.id);
  await page.waitForFunction(
    (reportId) => localStorage.getItem('auditkit.lastReport') === reportId,
    first.id,
  );
  const report = (await json(`/api/reports/${first.id}`)).body;
  assert.equal(report.monitorId, id);
  assert.ok(report.lighthouse.available, report.lighthouse.error);
  await navigate();
  await card.getByText('Đã lưu mốc đầu tiên. Các lần sau sẽ đối chiếu thay đổi.').waitFor();
  await card.getByRole('button', { name: 'Tạm dừng Website khách hàng A', exact: true }).click();
  await card.getByRole('button', { name: 'Bật lại Website khách hàng A', exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await navigate();
  await card.getByText('Lịch đang tạm dừng', { exact: true }).waitFor();
  await card
    .getByRole('button', { name: 'Sửa theo dõi Website khách hàng A', exact: true })
    .click();
  await page.getByLabel('Tên dự án chỉnh sửa').fill('Dự án chăm sóc website');
  await page.getByLabel('Chu kỳ chỉnh sửa').selectOption('weekly');
  await axe('Monitoring settings editor');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  card = page.getByRole('article', { name: 'Theo dõi Dự án chăm sóc website', exact: true });
  await card.getByText('Mỗi tuần · Mobile · Tối đa 5 trang', { exact: true }).waitFor();
  monitor = (await json('/api/monitors')).body[0];
  assert.equal(monitor.active, false);
  assert.equal(monitor.interval, 'weekly');
  console.log(
    'PASS: monitor validation, creation, real Lighthouse baseline, pause, reload persistence and settings.',
  );
  setVariant('fixed');
  const nextJob = page.waitForResponse(
    (response) => response.url().endsWith(`/api/monitors/${id}/run`) && response.status() === 202,
  );
  await card.getByRole('button', { name: 'Chạy ngay Dự án chăm sóc website', exact: true }).click();
  const second = await (await nextJob).json();
  await waitJob(second.id);
  await page.waitForFunction(
    (reportId) => localStorage.getItem('auditkit.lastReport') === reportId,
    second.id,
  );
  await navigate();
  await card
    .getByText(/lỗi SEO mới/)
    .first()
    .waitFor();
  monitor = (await json('/api/monitors')).body[0];
  assert.equal(monitor.runs.length, 2);
  assert.ok(monitor.alert.seoIssues > 0);
  assert.ok(monitor.alert.resolvedIssues > 0);
  assert.equal(monitor.unreadAlerts, 1);
  assert.equal(monitor.previousReportId, first.id);
  await card.getByText('Chi tiết 2 lần kiểm tra', { exact: true }).click();
  await card.getByText('Cảnh báo đã lưu', { exact: false }).first().click();
  await axe('Monitoring chart, history table and alerts');
  await screenshot('verified-monitoring-desktop.png');
  await card.getByRole('button', { name: 'Xem thay đổi', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Lỗi mới/ })
    .waitFor();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await card.getByRole('button', { name: 'Đánh dấu tất cả đã đọc', exact: true }).click();
  await card.getByText('1 chưa đọc', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal((await json('/api/monitors')).body[0].unreadAlerts, 0);
  await page.reload({ waitUntil: 'networkidle' });
  await navigate();
  assert.equal((await json('/api/monitors')).body[0].unreadAlerts, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await card.getByText('Chi tiết 2 lần kiểm tra', { exact: true }).click();
  await card.getByText('Cảnh báo đã lưu', { exact: false }).first().click();
  await axe('Monitoring mobile 390px');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await screenshot('verified-monitoring-mobile.png');
  await card
    .getByRole('button', { name: 'Sửa theo dõi Dự án chăm sóc website', exact: true })
    .click();
  await axe('Mobile monitoring settings');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await screenshot('verified-monitoring-mobile-edit.png');
  await card.getByRole('button', { name: 'Đóng', exact: true }).click();
  console.log(
    'PASS: real rescan produces SEO alerts, score history, comparison, read persistence, axe and 390px layout.',
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  // The slow fixture allows cancellation before browser/Lighthouse work begins.
  await card
    .getByRole('button', { name: 'Sửa theo dõi Dự án chăm sóc website', exact: true })
    .click();
  await page.getByLabel('URL website chỉnh sửa').fill(`${url}/slow`);
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const cancelJob = page.waitForResponse(
    (response) => response.url().endsWith(`/api/monitors/${id}/run`) && response.status() === 202,
  );
  await card.getByRole('button', { name: 'Chạy ngay Dự án chăm sóc website', exact: true }).click();
  const cancelled = await (await cancelJob).json();
  await navigate();
  await card.getByRole('progressbar').waitFor();
  await axe('Running monitoring job');
  await card.getByRole('button', { name: 'Hủy', exact: true }).click();
  await waitJob(cancelled.id, 'cancelled');
  await card.getByText('Đã hủy lần kiểm tra.', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal((await json('/api/monitors')).body[0].unreadAlerts, 0);
  assert.equal((await json('/api/reports')).body.length, 2);
  await card
    .getByRole('button', { name: 'Xóa theo dõi Dự án chăm sóc website', exact: true })
    .click();
  await axe('Delete monitor dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa theo dõi', exact: true }).click();
  await page.getByText('Chưa có website nào được theo dõi', { exact: true }).waitFor();
  assert.equal((await json('/api/monitors')).body.length, 0);
  assert.equal(
    (await json('/api/reports')).body.length,
    2,
    'monitor deletion preserves real reports',
  );
  assert.deepEqual(errors, []);
  console.log('PASS: in-card running progress, cancellation, deletion and retained reports.');
  console.log(`ALL MONITORING END-TO-END CHECKS PASSED. Artifacts: ${artifacts}`);
} finally {
  close();
  for (const job of jobs.values())
    if (job.status === 'running') job.controller.abort(new Error('Test cleanup'));
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-monitor-verify-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
}
