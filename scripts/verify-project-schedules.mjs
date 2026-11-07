import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import AxeBuilder from '@axe-core/playwright';
import { brandingReport } from '../tests/fixtures/branding-report.mjs';
import { startFixture } from './fixture.mjs';

const real = process.argv.includes('--real');
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), 'website-audit-project-schedule-verify-'),
);
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const { createApp } = await import('../server/index.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const workspace = await import('../server/workspace.mjs');
const store = await import('../server/store.mjs');
const { fixture, url: fixtureUrl, setVariant } = await startFixture();
const urls = [`${fixtureUrl}/`, `${fixtureUrl}/about`].slice(0, real ? 1 : 2);
let clock = new Date(),
  variant = 'baseline',
  instance,
  server,
  base,
  page;
let active = 0,
  peak = 0;
const calls = [];
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const client = await workspace.createClient({ name: 'Mộc Studio' });
const project = await workspace.saveProject(null, {
  clientId: client.id,
  name: real ? 'Dự án lịch Lighthouse thật' : 'Chăm sóc định kỳ Mộc',
  websites: urls,
});
const runner = async (input) => {
  active++;
  peak = Math.max(peak, active);
  calls.push(input.url);
  try {
    input.onProgress(40, 'Đang kiểm tra lịch dự án với dữ liệu giả lập…');
    if (variant === 'cancel' && input.url === urls[1]) {
      await new Promise((resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
        if (input.signal.aborted) reject(input.signal.reason);
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (variant === 'failure' && input.url === urls[1])
      throw new Error('Website tạm thời không phản hồi.');
    const report = {
      ...brandingReport(),
      id: input.id,
      url: input.url,
      requestedUrl: input.url,
      device: input.device,
      createdAt: new Date().toISOString(),
      score: variant === 'regression' ? 65 : 80,
    };
    report.pages[0].url = input.url;
    report.checks.forEach((check) => {
      check.status = 'pass';
      check.urls = [input.url];
      check.done = false;
    });
    if (variant === 'baseline') report.checks[0].status = 'fail';
    if (variant === 'regression') report.checks[3].status = 'fail';
    return report;
  } finally {
    active--;
  }
};
async function boot(port = 0) {
  instance = createApp({
    ...(real ? {} : { auditRunner: runner }),
    monitorPollMs: 250,
    startupDelayMs: 60_000,
    scheduleNow: () => new Date(clock),
  });
  await instance.projectSchedules.ready;
  server = instance.app.listen(port, '127.0.0.1');
  await once(server, 'listening');
  process.env.PORT = String(server.address().port);
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  await instance.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
async function json(route, body, method = 'GET') {
  const response = await fetch(base + route, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
async function waitFor(predicate, message) {
  const until = Date.now() + (real ? 300_000 : 45_000);
  while (Date.now() < until) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}
const route = `/api/projects/${project.id}/schedule`;
async function waitRuns(count) {
  return waitFor(async () => {
    const s = await json(route);
    return !s.currentRunId && s.runs.length === count ? s : null;
  }, 'Scheduled run did not finish.');
}
const browser = await launchBrowser();
try {
  await boot();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function openProject() {
    if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('button', { name: 'Khách hàng & dự án', exact: true }).click();
    const back = page.getByRole('button', { name: 'Danh sách dự án', exact: true });
    if (await back.isVisible()) await back.click();
    await page.getByRole('button', { name: `Mở dự án ${project.name}`, exact: true }).click();
    await page.getByRole('heading', { name: project.name + '.', exact: true }).waitFor();
  }
  async function axe(label) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })),
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
  const panel = page.getByRole('region', { name: 'Lịch kiểm tra toàn bộ dự án', exact: true });
  const queue = page.getByRole('region', { name: 'Kiểm tra toàn bộ dự án', exact: true });
  await page.goto(base, { waitUntil: 'networkidle' });
  await openProject();
  await panel.getByRole('button', { name: 'Tạo lịch dự án', exact: true }).waitFor();
  await axe('Empty project schedule');
  await panel.getByRole('button', { name: 'Tạo lịch dự án', exact: true }).click();
  await panel.getByLabel('Chu kỳ lịch dự án').selectOption('daily');
  await panel.getByLabel('Thiết bị lịch dự án').selectOption('mobile');
  await panel.getByLabel('Số trang lịch dự án').selectOption(real ? '5' : '1');
  await axe('Project schedule form');
  await panel.getByRole('button', { name: 'Lưu lịch dự án', exact: true }).click();
  await panel.getByText('Đã lưu lịch kiểm tra dự án.', { exact: true }).waitFor();
  let schedule = await json(route);
  assert.equal(schedule.interval, 'daily');
  assert.equal(schedule.lastStatus, 'never');
  const nextRunAt = schedule.nextRunAt;
  const port = server.address().port;
  await stop();
  await boot(port);
  await page.reload({ waitUntil: 'networkidle' });
  await openProject();
  assert.equal((await json(route)).nextRunAt, nextRunAt);
  await panel.getByRole('button', { name: 'Chạy lịch ngay', exact: true }).click();
  await panel.getByRole('button', { name: 'Hủy lượt theo lịch', exact: true }).waitFor();
  await axe('Running scheduled batch');
  const baseline = await waitRuns(1);
  assert.equal(baseline.lastStatus, 'baseline');
  const firstBatch = (await json(`/api/projects/${project.id}/batches`))[0];
  assert.equal(firstBatch.trigger, 'schedule-manual');
  await panel
    .locator('.schedule-status')
    .filter({ hasText: 'Đã có mốc đầu tiên' })
    .waitFor({ timeout: 15_000 });
  if (real) setVariant('fixed');
  else variant = 'regression';
  clock = new Date(new Date((await json(route)).nextRunAt).getTime() + 1000);
  const alert = await waitRuns(2);
  assert.equal(alert.lastStatus, 'alert');
  assert.equal(alert.unreadAlerts, 1);
  assert.ok(alert.runs.at(-1).newIssues > 0);
  const secondBatch = (await json(`/api/projects/${project.id}/batches`))[0];
  assert.equal(secondBatch.trigger, 'schedule');
  assert.equal(alert.runs.at(-1).beforeBatchId, firstBatch.id);
  if (real) {
    for (const batch of [firstBatch, secondBatch]) {
      const r = await store.readReport(batch.items[0].reportId);
      assert.ok(r.lighthouse.available, r.lighthouse.error);
    }
    const comparison = await json(
      `/api/projects/${project.id}/batch-comparison?before=${firstBatch.id}&after=${secondBatch.id}`,
    );
    assert.ok(
      comparison.websites[0].changes.new.some(
        (finding) => finding.rule === 'h1' && finding.url.endsWith('/about'),
      ),
    );
    assert.ok(
      comparison.websites[0].changes.resolved.some(
        (finding) => finding.rule === 'description' && finding.url.endsWith('/about'),
      ),
    );
    await fs.writeFile(
      path.join(artifacts, 'project-schedule-real-result.json'),
      JSON.stringify(alert, null, 2),
    );
  } else {
    assert.equal(alert.runs.at(-1).scoreDrops, 2);
    assert.equal(alert.runs.at(-1).newIssues, 2);
  }
  await panel
    .getByRole('button', { name: 'So sánh lần cảnh báo', exact: true })
    .waitFor({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'So sánh lần cảnh báo', exact: true }).click();
  const comparisonPanel = page.getByRole('region', {
    name: 'So sánh các lần kiểm tra dự án',
    exact: true,
  });
  await waitFor(
    async () =>
      (await comparisonPanel.getByLabel('Lần kiểm tra trước').inputValue()) === firstBatch.id &&
      (await comparisonPanel.getByLabel('Lần kiểm tra sau').inputValue()) === secondBatch.id,
    'Alert link did not select comparison pair.',
  );
  await comparisonPanel.locator('.comparison-site').first().waitFor();
  await axe('Project regression alert and comparison');
  await noOverflow();
  await panel.screenshot({
    path: path.join(artifacts, real ? 'project-schedule-real.png' : 'project-schedule-desktop.png'),
  });
  await panel.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await waitFor(
    async () =>
      (await queue.getByLabel('Lần kiểm tra toàn bộ dự án').inputValue()) === secondBatch.id,
    'Alert link did not select batch.',
  );
  const download = page.waitForEvent('download');
  await queue.getByRole('button', { name: 'JSON', exact: true }).click();
  await (
    await download
  ).saveAs(
    path.join(
      artifacts,
      real ? 'project-schedule-real-summary.json' : 'project-schedule-summary.json',
    ),
  );
  await panel.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click();
  await waitFor(async () => (await json(route)).unreadAlerts === 0, 'Read state did not persist.');
  await page.reload({ waitUntil: 'networkidle' });
  await openProject();
  await panel.getByText('0 chưa đọc', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Tạm dừng lịch dự án', exact: true }).click();
  await panel.getByRole('button', { name: 'Bật lịch dự án', exact: true }).waitFor();
  clock = new Date(clock.getTime() + 3 * 86_400_000);
  await instance.runDueWork();
  assert.equal((await json(route)).runs.length, 2);
  await panel.getByRole('button', { name: 'Sửa lịch dự án', exact: true }).click();
  await panel.getByLabel('Chu kỳ lịch dự án').selectOption('weekly');
  await panel.getByRole('button', { name: 'Lưu lịch dự án', exact: true }).click();
  await panel.getByRole('button', { name: 'Bật lịch dự án', exact: true }).click();
  schedule = await json(route);
  assert.equal(schedule.interval, 'weekly');
  assert.equal(schedule.active, true);
  assert.ok(schedule.nextRunAt > clock.toISOString());
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator('.schedule-history summary').click();
  assert.equal(await panel.locator('.schedule-history article').count(), 2);
  await axe('Mobile schedule history, read alerts, edited cadence');
  await noOverflow();
  await panel.screenshot({
    path: path.join(
      artifacts,
      real ? 'project-schedule-real-mobile.png' : 'project-schedule-mobile.png',
    ),
  });
  if (!real) {
    variant = 'failure';
    await panel.getByRole('button', { name: 'Chạy lịch ngay', exact: true }).click();
    const failed = await waitRuns(3);
    assert.equal(failed.lastStatus, 'incomplete');
    assert.equal(failed.baselineBatchId, secondBatch.id);
    assert.equal(failed.unreadAlerts, 1);
    await panel
      .getByText('1 website chưa hoàn tất', { exact: false })
      .first()
      .waitFor({ timeout: 15_000 });
    await axe('Incomplete project audit alert');
    variant = 'cancel';
    await panel.getByRole('button', { name: 'Chạy lịch ngay', exact: true }).click();
    await waitFor(async () => {
      const batches = await json(`/api/projects/${project.id}/batches`);
      return batches[0]?.items[1]?.status === 'running';
    }, 'Second website did not enter running state.');
    await panel.getByRole('button', { name: 'Tạm dừng lịch dự án', exact: true }).click();
    await panel.getByRole('button', { name: 'Hủy lượt theo lịch', exact: true }).click();
    const cancelled = await waitRuns(4);
    assert.equal(cancelled.lastStatus, 'cancelled');
    assert.equal(cancelled.active, false);
    assert.equal(cancelled.unreadAlerts, 1);
    assert.equal(cancelled.baselineBatchId, secondBatch.id);
    await panel.getByText('Lượt gần nhất: Đã hủy', { exact: false }).waitFor({ timeout: 15_000 });
    await axe('Cancelled project schedule, no duplicate alerts');
    assert.equal(peak, 1);
  }
  await panel.getByRole('button', { name: 'Xóa lịch', exact: true }).click();
  await axe('Schedule deletion confirmation');
  await panel.getByRole('button', { name: 'Giữ lịch', exact: true }).click();
  await panel.getByRole('button', { name: 'Xóa lịch', exact: true }).click();
  const historyBefore = await json(`/api/projects/${project.id}/batches`);
  await panel.getByRole('button', { name: 'Xác nhận xóa lịch', exact: true }).click();
  await panel.getByRole('button', { name: 'Tạo lịch dự án', exact: true }).waitFor();
  assert.equal(await json(route), null);
  assert.equal((await json(`/api/projects/${project.id}/batches`)).length, historyBefore.length);
  assert.deepEqual(errors, []);
  await noOverflow();
  console.log(
    `PASS: schedule form, persistence across server restart, run now and automatic due batch, ${real ? 'real Lighthouse confirmed new H1/resolved description' : 'confirmed score regression and new issues'}, unread/read alerts, selected comparison and summary JSON.`,
  );
  console.log(
    'PASS: pause/resume, cadence edit, history, deletion preserves batches/reports, desktop/mobile axe, no JavaScript errors or horizontal overflow.',
  );
  console.log(`PROJECT SCHEDULE CHECKS PASSED (${real ? 'real Lighthouse' : 'synthetic runner'}).`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({
        path: path.join(artifacts, `project-schedule${real ? '-real' : ''}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
    console.error(
      await page
        .locator('.project-schedule-panel')
        .innerText()
        .catch(() => ''),
    );
  }
  throw error;
} finally {
  await browser.close();
  if (instance) await stop();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(temporary).startsWith('website-audit-project-schedule-verify-'));
  await fs.rm(temporary, { recursive: true, force: true });
}
