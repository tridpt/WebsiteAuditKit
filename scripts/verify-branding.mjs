import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import AxeBuilder from '@axe-core/playwright';
import { brandingReport, csvRows } from '../tests/fixtures/branding-report.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-branding-verify-'));
process.env.AUDIT_DATA_DIR = temporary;
const { createApp } = await import('../server/index.mjs');
const { saveReport, readReport } = await import('../server/store.mjs');
const { defaultBranding } = await import('../server/branding.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const instance = createApp({ startupDelayMs: 60_000 });
const server = instance.app.listen(0, '127.0.0.1');
await once(server, 'listening');
process.env.PORT = String(server.address().port);
const base = `http://127.0.0.1:${server.address().port}`;
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const report = brandingReport();
await saveReport(report);
const browser = await launchBrowser();
const errors = [];
const json = async (route, body) => {
  const response = await fetch(
    base + route,
    body
      ? {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {},
  );
  return { status: response.status, body: await response.json() };
};
try {
  await json('/api/branding', { agencyName: 'Agency ban đầu' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript((id) => localStorage.setItem('auditkit.lastReport', id), report.id);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  let delayed = false;
  await page.route('**/api/branding', async (route) => {
    if (!delayed && route.request().method() === 'GET') {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    await route.continue();
  });
  async function axe(label) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      results.violations.map((violation) => ({
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
  async function noOverflow(label) {
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          [...document.querySelectorAll('dialog[open]')].every(
            (dialog) => dialog.scrollWidth <= dialog.clientWidth + 1,
          ),
      ),
      label,
    );
  }
  async function openSettings() {
    await page.getByRole('button', { name: 'Cài đặt báo cáo thương hiệu', exact: true }).click();
    await page.getByLabel('Tên agency', { exact: true }).waitFor();
  }
  async function saveSettings() {
    await page.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await openSettings();
  assert.equal(await page.getByLabel('Tên agency', { exact: true }).inputValue(), 'Agency ban đầu');
  await axe('Initial branding settings after delayed configuration fetch');
  const logoInput = page.getByLabel('Tải logo agency');
  await logoInput.setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a real image'),
  });
  await page.getByRole('alert').filter({ hasText: 'Không đọc được ảnh logo' }).waitFor();
  await logoInput.setInputFiles({
    name: 'too-big.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(301 * 1024),
  });
  await page.getByRole('alert').filter({ hasText: '300 KB' }).waitFor();
  await axe('Branding upload validation');
  const logos = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#522c85';
    ctx.fillRect(0, 0, 360, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px Arial';
    ctx.fillText('MỘC', 25, 79);
    return ['image/png', 'image/jpeg', 'image/webp'].map((type) => canvas.toDataURL(type));
  });
  for (const logoDataUrl of logos) {
    assert.equal(
      (await json('/api/branding', { logoDataUrl })).status,
      200,
      logoDataUrl.slice(0, 25),
    );
  }
  const bigLogo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(160, 120);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = (i * 13) % 251;
      pixels.data[i + 1] = (i * 23) % 239;
      pixels.data[i + 2] = (i * 47) % 233;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png');
  });
  assert.ok(bigLogo.length > 16 * 1024 && bigLogo.length < 400 * 1024);
  assert.equal(
    (await json('/api/branding', { logoDataUrl: bigLogo })).status,
    200,
    'Logo larger than the ordinary API body limit is accepted',
  );
  const logo = logos[0];
  await page.getByLabel('Tên agency', { exact: true }).fill('Mộc Digital & Partners');
  await page.getByLabel('Khẩu hiệu báo cáo').fill('Website tốt hơn, khách hàng hài lòng hơn.');
  await page
    .getByLabel('Dòng chân trang báo cáo')
    .fill('Mộc Digital · hello@moc.example · Báo cáo dành cho khách hàng');
  await page.getByLabel('Màu nhận diện báo cáo').fill('#522c85');
  await logoInput.setInputFiles({
    name: 'moc-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(logo.split(',')[1], 'base64'),
  });
  await page.getByAltText('Xem trước logo').waitFor();
  await page
    .getByRole('button', { name: 'Lưu cấu hình', exact: true })
    .waitFor({ state: 'visible' });
  await axe('Custom branding and logo preview');
  await noOverflow('Desktop branding dialog');
  await page.screenshot({
    path: path.join(artifacts, 'branding-settings-desktop.png'),
    fullPage: true,
  });
  await saveSettings();
  const brand = (await json('/api/branding')).body;
  assert.equal(brand.agencyName, 'Mộc Digital & Partners');
  assert.equal(brand.logoDataUrl, logo);
  await page.reload({ waitUntil: 'networkidle' });
  await openSettings();
  assert.equal(await page.getByLabel('Tên agency', { exact: true }).inputValue(), brand.agencyName);
  assert.equal(await page.getByAltText('Xem trước logo').getAttribute('src'), logo);
  await page.getByRole('button', { name: 'Dùng mặc định', exact: true }).click();
  assert.equal(
    await page.getByLabel('Tên agency', { exact: true }).inputValue(),
    defaultBranding.agencyName,
  );
  assert.equal(
    (await json('/api/branding')).body.agencyName,
    brand.agencyName,
    'Reset is a draft until saved',
  );
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Xuất báo cáo', exact: true }).click();
  await page
    .locator('.export-branding-note')
    .getByText(brand.agencyName, { exact: true })
    .waitFor();
  await axe('Export menu with branded report');
  await page
    .locator('.export-branding-note')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await page.getByLabel('Tên agency', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  for (const [format, label] of [
    ['pdf', 'PDF Gửi cho khách hàng'],
    ['html', 'HTML Báo cáo mở bằng trình duyệt'],
    ['csv', 'CSV Danh sách việc cần sửa'],
    ['json', 'JSON Dữ liệu và bằng chứng đầy đủ'],
  ]) {
    await page.getByRole('button', { name: 'Xuất báo cáo', exact: true }).click();
    const pending = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: label, exact: true }).click();
    const download = await pending;
    await download.saveAs(path.join(artifacts, `branding-report.${format}`));
  }
  const pdf = await fs.readFile(path.join(artifacts, 'branding-report.pdf'));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const exported = JSON.parse(
    await fs.readFile(path.join(artifacts, 'branding-report.json'), 'utf8'),
  );
  assert.deepEqual(exported.branding, brand);
  delete exported.branding;
  assert.deepEqual(exported, report);
  assert.deepEqual(await readReport(report.id), report, 'Exports never rewrite stored audit data');
  const csv = csvRows(await fs.readFile(path.join(artifacts, 'branding-report.csv'), 'utf8'));
  assert.ok(csv.every((row) => row.length === 16));
  assert.ok(csv.slice(1).every((row) => row[8] === brand.agencyName && row[10] === brand.footer));
  const html = await fs.readFile(path.join(artifacts, 'branding-report.html'), 'utf8');
  assert.ok(
    html.includes('Mộc Digital &amp; Partners') &&
      html.includes(logo) &&
      html.includes('--accent:#522c85'),
  );
  const htmlPage = await context.newPage();
  const outgoing = [];
  htmlPage.on('request', (request) => {
    if (/^https?:/.test(request.url())) outgoing.push(request.url());
  });
  await htmlPage.setContent(html);
  assert.ok(
    await htmlPage.locator('.brand-logo').evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await htmlPage.setViewportSize({ width: 390, height: 844 });
  assert.ok(await htmlPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(outgoing, [], 'The HTML export has no remote assets');
  const hostile = {
    ...brand,
    agencyName: '<script>alert(1)</script>',
    tagline: 'A'.repeat(160),
    footer: 'F'.repeat(180),
    accentColor: '#ffffff',
  };
  await json('/api/branding', hostile);
  const hostileHtml = await (
    await fetch(`${base}/api/reports/${report.id}/export?format=html`)
  ).text();
  await htmlPage.setContent(hostileHtml);
  assert.equal(await htmlPage.locator('.brand').textContent(), hostile.agencyName);
  assert.ok(await htmlPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const htmlAxe = await new AxeBuilder({ page: htmlPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    htmlAxe.violations.map((v) => v.id),
    [],
    'Export remains accessible with white accent and long branding',
  );
  await json('/api/branding', brand);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings();
  await axe('Mobile branding settings');
  await noOverflow('Mobile branding dialog');
  await page.screenshot({
    path: path.join(artifacts, 'branding-settings-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Xóa logo', exact: true }).click();
  await saveSettings();
  assert.equal((await json('/api/branding')).body.logoDataUrl, null);
  await openSettings();
  await page.getByRole('button', { name: 'Dùng mặc định', exact: true }).click();
  await saveSettings();
  assert.deepEqual((await json('/api/branding')).body, defaultBranding);
  await page.reload({ waitUntil: 'networkidle' });
  await openSettings();
  assert.equal(
    await page.getByLabel('Tên agency', { exact: true }).inputValue(),
    defaultBranding.agencyName,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: branding loading, invalid uploads, PNG/JPEG/WebP, large logo, preview, save/reload, draft reset, logo removal, mobile and axe checks.',
  );
  console.log(
    'PASS: branded PDF/HTML/CSV/JSON downloads, immutable audit data, escaped text, light colors and offline HTML.',
  );
  console.log(`BRANDING CHECKS PASSED. Artifacts: ${artifacts}`);
} finally {
  instance.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-branding-verify-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
}
