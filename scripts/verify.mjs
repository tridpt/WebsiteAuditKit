import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { startFixture } from './fixture.mjs';
import AxeBuilder from '@axe-core/playwright';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-verify-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const { createApp } = await import('../server/index.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const { app, jobs, close } = createApp();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
process.env.PORT = String(server.address().port);
const base = `http://127.0.0.1:${server.address().port}`;
const { fixture, url, requests, setVariant } = await startFixture();
const browser = await launchBrowser();
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const errors = [];
const json = async (route, options) => {
  const response = await fetch(`${base}${route}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  });
  const body = await response.json();
  return { response, body };
};
async function waitJob(id, expected = 'completed') {
  const started = Date.now();
  while (Date.now() - started < 150000) {
    const { body } = await json(`/api/jobs/${id}`);
    if (body.status !== 'running') {
      assert.equal(body.status, expected, JSON.stringify(body));
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Job did not finish within 150 seconds.');
}
try {
  const customer = (
    await json('/api/clients', { method: 'POST', body: JSON.stringify({ name: 'Khách hàng E2E' }) })
  ).body;
  const project = (
    await json('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        clientId: customer.id,
        name: 'Audit thật trong dự án',
        websites: [url],
      }),
    })
  ).body;
  assert.ok(project.id);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.title(), 'Website Audit Kit — Hiểu website. Cải thiện mỗi ngày.');
  await page.getByRole('button', { name: 'Lịch sử kiểm tra', exact: true }).click();
  await page.getByText('Câu chuyện bắt đầu từ lần kiểm tra đầu tiên').waitFor();
  await page.getByRole('button', { name: 'Kiểm tra website đầu tiên' }).click();
  await page.getByLabel('Website bạn muốn cải thiện').fill(url);
  await page.getByLabel('Dự án cho lần kiểm tra').selectOption(project.id);
  await page.getByRole('button', { name: 'Kiểm tra website', exact: true }).click();
  await page
    .getByText('Báo cáo đã sẵn sàng. Cùng xem website có thể tốt hơn ở đâu.')
    .waitFor({ timeout: 150000 });
  const summaries = (await json('/api/reports')).body;
  assert.equal(summaries.length, 1);
  const id = summaries[0].id;
  const report = (await json(`/api/reports/${id}`)).body;
  assert.equal((await json('/api/workspace')).body.reports[id], project.id);
  assert.ok(report.scope.scannedPages >= 2);
  assert.ok(report.browser.available, report.browser.warning);
  assert.ok(report.lighthouse.available, report.lighthouse.error);
  assert.equal(report.categories.performance.source, 'Lighthouse');
  assert.equal(report.categories.performance.score, report.lighthouse.score);
  assert.equal(report.lighthouse.device, 'mobile');
  assert.ok(report.lighthouse.metrics.lcp > 0);
  assert.ok(
    report.lighthouse.opportunities.some(
      (a) => a.savingsBytes > 0 && a.resources.some((r) => r.url.endsWith('/unused.css')),
    ),
  );
  assert.equal(report.browser.performance.device, 'mobile');
  assert.equal(report.browser.mobile.width, 390);
  assert.ok(report.browser.mobile.screenshot);
  assert.ok(report.browser.desktop.screenshot, JSON.stringify(report.browser));
  assert.ok(report.checks.find((c) => c.id === 'broken-links').status === 'fail');
  assert.ok(report.links.find((l) => l.url.endsWith('/restricted')).state === 'unknown');
  assert.ok(
    report.links.find((l) => l.url.endsWith('/dynamic-link'))?.rendered,
    'links created by JavaScript must be checked',
  );
  assert.ok(
    report.checks.find((c) => c.id === 'description').evidence.some((e) => e.includes('/about')),
  );
  assert.ok(
    !requests.some((r) => r.url === '/private'),
    'robots disallowed path must not be requested',
  );
  console.log(
    'PASS: full audit via UI, mobile/desktop screenshots, real 404, 403 unknown, SEO and robots.',
  );
  await page.screenshot({
    path: path.join(artifacts, 'verified-real-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Xem hướng sửa: Liên kết trả về lỗi HTTP' }).click();
  await page.getByText('Gợi ý cách sửa', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Xem tất cả .* việc cần sửa/ }).click();
  await page
    .getByRole('button', { name: 'Đánh dấu hoàn thành: Liên kết trả về lỗi HTTP', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Đánh dấu chưa hoàn thành: Liên kết trả về lỗi HTTP',
      exact: true,
    })
    .waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .getByRole('button', { name: /Việc cần sửa/ })
    .first()
    .click();
  await page
    .getByRole('button', {
      name: 'Đánh dấu chưa hoàn thành: Liên kết trả về lỗi HTTP',
      exact: true,
    })
    .waitFor();
  console.log('PASS: task completion persists after reload.');
  await page.getByRole('button', { name: 'Về báo cáo', exact: true }).click();
  for (const tab of ['Tốc độ', 'Giao diện mobile', 'Liên kết', 'SEO', 'Tổng quan']) {
    await page.getByRole('tab', { name: tab, exact: tab !== 'Tổng quan' }).click();
    assert.ok(await page.getByRole('tabpanel').isVisible());
    if (tab === 'Tốc độ') {
      await page.getByText('Cơ hội tối ưu từ Lighthouse', { exact: true }).waitFor();
      assert.ok((await page.locator('.opportunity-row').count()) > 0);
      assert.equal(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations.length,
        0,
      );
      await page.screenshot({
        path: path.join(artifacts, 'verified-lighthouse.png'),
        fullPage: true,
      });
    }
  }
  await page.getByRole('button', { name: 'Ảnh mobile', exact: true }).click();
  await page.getByAltText(/Ảnh website .* trên mobile/).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  console.log('PASS: detail tabs and screenshot dialog.');
  await page.getByRole('button', { name: 'Xuất báo cáo' }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  const pdfResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/export?format=pdf'),
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: 'PDF Gửi cho khách hàng' }).click();
  const pdfResponse = await pdfResponsePromise;
  assert.equal(
    pdfResponse.status(),
    200,
    await pdfResponse.text().then(() => `PDF response HTTP ${pdfResponse.status()}`),
  );
  const download = await downloadPromise;
  await download.saveAs(path.join(artifacts, 'verified-report.pdf'));
  const pdf = await fs.readFile(path.join(artifacts, 'verified-report.pdf'));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 10000);
  for (const format of ['json', 'csv', 'html']) {
    const exported = await fetch(`${base}/api/reports/${id}/export?format=${format}`);
    assert.equal(exported.status, 200);
    const text = await exported.text();
    assert.ok(text.length > 100);
    if (format === 'csv') assert.ok(text.includes('Hướng khắc phục'));
    if (format === 'html') assert.ok(text.includes('Hiệu năng Lighthouse'));
  }
  console.log('PASS: PDF downloaded through UI; JSON, HTML, CSV exports.');
  const second = (
    await json('/api/audits', {
      method: 'POST',
      body: JSON.stringify({ url: `${url}/layout`, maxPages: 1, device: 'desktop' }),
    })
  ).body;
  await waitJob(second.id);
  const secondReport = (await json(`/api/reports/${second.id}`)).body;
  assert.equal(secondReport.browser.performance.device, 'desktop');
  assert.ok(secondReport.lighthouse.available, secondReport.lighthouse.error);
  assert.equal(secondReport.lighthouse.device, 'desktop');
  assert.equal(secondReport.browser.mobile.overflow, true);
  assert.equal(secondReport.browser.mobile.width, 390);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Lịch sử kiểm tra/ }).click();
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: /So sánh/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByText(/phạm vi kiểm tra khác nhau/).waitFor();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  console.log(
    'PASS: desktop mode still checks true mobile layout; report comparison warns about scope.',
  );
  setVariant('fixed');
  const third = (
    await json('/api/audits', {
      method: 'POST',
      body: JSON.stringify({ url, maxPages: 5, device: 'mobile' }),
    })
  ).body;
  await waitJob(third.id);
  const diff = (await json(`/api/reports/compare?before=${id}&after=${third.id}`)).body;
  assert.ok(
    diff.changes.resolved.some((f) => f.rule === 'description' && f.url.endsWith('/about')),
  );
  assert.ok(
    diff.changes.resolved.some((f) => f.rule === 'link-health' && f.url.endsWith('/missing')),
  );
  assert.ok(diff.changes.new.some((f) => f.rule === 'h1' && f.url.endsWith('/about')));
  assert.ok(diff.changes.unverified.some((f) => f.url.endsWith('/restricted')));
  assert.equal((await json(`/api/reports/compare?before=${id}&after=${id}`)).response.status, 400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Lịch sử kiểm tra/ }).click();
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(2).check();
  await page.getByRole('button', { name: /So sánh/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Lỗi mới/ }).click();
  await dialog
    .getByText('Lần trước đã đạt; lần mới phát hiện vấn đề trên cùng URL.')
    .first()
    .waitFor();
  await dialog.getByRole('button', { name: /Đã sửa/ }).click();
  await dialog.getByLabel('Tìm lỗi hoặc URL').fill('/about');
  assert.ok((await dialog.locator('.finding-change').count()) > 0);
  await dialog.getByRole('button', { name: /Chưa đủ dữ liệu/ }).click();
  await dialog.getByLabel('Tìm lỗi hoặc URL').fill('/restricted');
  await dialog
    .getByText('Có lần đo chưa xác minh được kết quả; cần kiểm tra lại.')
    .first()
    .waitFor();
  assert.equal(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations.length,
    0,
  );
  await page.screenshot({
    path: path.join(artifacts, 'verified-issue-comparison.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  assert.ok(await dialog.evaluate((el) => el.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({
    path: path.join(artifacts, 'verified-comparison-mobile.png'),
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  console.log(
    'PASS: actual rescan confirms new/fixed/unverified issues per URL, filters, accessibility and mobile comparison.',
  );
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (e) => errors.push(e.message));
  await mobile.goto(base, { waitUntil: 'networkidle' });
  assert.ok(!(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  assert.ok(
    await mobile.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right <= 1),
  );
  await mobile.getByRole('button', { name: 'Mở menu' }).click();
  await mobile.getByRole('button', { name: /Việc cần sửa/ }).click();
  await mobile.getByText('Từng việc nhỏ. Tiến bộ lớn.').waitFor();
  await mobile.screenshot({
    path: path.join(artifacts, 'verified-mobile-tasks.png'),
    fullPage: true,
    animations: 'disabled',
  });
  assert.ok(!(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  console.log('PASS: phone layout, drawer navigation and no page overflow.');
  await page
    .getByRole('button', { name: /^Xóa báo cáo / })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa báo cáo', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await json('/api/reports')).body.length, 2);
  console.log('PASS: deletion removes stored report.');
  const slow = (
    await json('/api/audits', {
      method: 'POST',
      body: JSON.stringify({ url: `${url}/slow`, device: 'mobile', maxPages: 1 }),
    })
  ).body;
  const concurrent = await json('/api/audits', { method: 'POST', body: JSON.stringify({ url }) });
  assert.equal(concurrent.response.status, 409);
  await json(`/api/jobs/${slow.id}`, { method: 'DELETE' });
  await waitJob(slow.id, 'cancelled');
  assert.equal((await json('/api/reports')).body.length, 2);
  const crossSite = await json('/api/audits', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
    body: JSON.stringify({ url }),
  });
  assert.equal(crossSite.response.status, 403);
  assert.equal((await json('/api/reports/not-a-valid-id')).response.status, 404);
  assert.equal(
    (
      await json('/api/audits', {
        method: 'POST',
        body: JSON.stringify({ url: 'http://169.254.169.254' }),
      })
    ).response.status,
    400,
  );
  console.log(
    'PASS: cancellation, one-audit concurrency limit, cross-site and private-network guards.',
  );
  assert.deepEqual(errors, []);
  console.log(`ALL END-TO-END CHECKS PASSED. Artifacts: ${artifacts}`);
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
      path.basename(resolved).startsWith('website-audit-verify-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
}
