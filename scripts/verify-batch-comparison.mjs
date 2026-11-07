import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { brandingReport, csvRows } from '../tests/fixtures/branding-report.mjs';
import { startFixture } from './fixture.mjs';

const real = process.argv.includes('--real');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-comparison-verify-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const { createApp } = await import('../server/index.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const { defaultBranding } = await import('../server/branding.mjs');
const store = await import('../server/store.mjs');
const workspace = await import('../server/workspace.mjs');
const { fixture, url: fixtureUrl, setVariant } = await startFixture();
const urls = ['/', '/about', '/reuse', '/failed', '/removed', '/added'].map(
  (suffix) => fixtureUrl + suffix,
);
const client = await workspace.createClient({ name: 'Mộc Studio' });
const project = await workspace.saveProject(null, {
  clientId: client.id,
  name: real ? 'Đối chiếu Lighthouse thật' : 'Chăm sóc website Mộc',
  websites: real ? [urls[0]] : urls,
});
const dates = ['2026-08-03T03:00:00.000Z', '2026-09-07T03:00:00.000Z', '2026-10-19T03:00:00.000Z'];
let before, after;
async function makeReport(url, index, score) {
  const report = {
    ...brandingReport(),
    id: randomUUID(),
    requestedUrl: url,
    url,
    createdAt: dates[index],
    score,
  };
  report.pages = report.pages.map((page) => ({ ...page, url }));
  report.checks.forEach((check) => {
    check.urls = [url];
    check.evidence = [`Bằng chứng ${check.id}`, url];
  });
  if (index === 1) report.checks[1].status = 'pass';
  if (index === 2) report.checks[0].status = 'pass';
  await store.saveReport(report);
  await workspace.assignResource('reports', report.id, project.id);
  return report;
}
function makeBatch(index, reports, extra = {}) {
  const at = new Date(new Date(dates[index]).getTime() + 60_000).toISOString();
  return {
    id: randomUUID(),
    projectId: project.id,
    projectName: project.name,
    createdAt: at,
    finishedAt: at,
    status: 'completed',
    device: 'mobile',
    maxPages: 5,
    retryOf: null,
    error: null,
    cancelRequested: false,
    items: reports.map((report) =>
      report.checks
        ? { url: report.url, status: 'completed', reportId: report.id, error: null, progress: 100 }
        : report,
    ),
    ...extra,
  };
}
if (!real) {
  const first = makeBatch(
    0,
    await Promise.all(urls.slice(0, 5).map((url) => makeReport(url, 0, 50))),
  );
  const previous = await Promise.all(urls.slice(0, 5).map((url) => makeReport(url, 1, 60)));
  before = makeBatch(1, previous);
  after = makeBatch(
    2,
    [
      await makeReport(urls[0], 2, 75),
      await makeReport(urls[1], 2, 52),
      previous[2],
      {
        url: urls[3],
        status: 'failed',
        reportId: null,
        error: 'Website tạm thời không phản hồi.',
        progress: 100,
      },
      await makeReport(urls[5], 2, 85),
    ],
    { status: 'partial' },
  );
  await store.saveBatches([after, before, first]);
}
const instance = createApp({ startupDelayMs: 60_000 });
await instance.batches.ready;
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
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
};
async function waitBatch(id) {
  const until = Date.now() + 300_000;
  while (Date.now() < until) {
    const batch = await json(`/api/projects/${project.id}/batches/${id}`);
    if (batch.status !== 'running') return batch;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Batch timed out.');
}
const browser = await launchBrowser();
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function openProject(name = project.name) {
    if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('button', { name: 'Khách hàng & dự án', exact: true }).click();
    const back = page.getByRole('button', { name: 'Danh sách dự án', exact: true });
    if (await back.isVisible()) await back.click();
    await page.getByRole('button', { name: `Mở dự án ${name}`, exact: true }).click();
    await page.getByRole('heading', { name: `${name}.`, exact: true }).waitFor();
  }
  async function axe(label, targetPage = page) {
    const result = await new AxeBuilder({ page: targetPage })
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
  await page.goto(base, { waitUntil: 'networkidle' });
  await openProject();
  const panel = page.getByRole('region', { name: 'So sánh các lần kiểm tra dự án', exact: true });
  if (real) {
    const queue = page.getByRole('region', { name: 'Kiểm tra toàn bộ dự án', exact: true });
    await page.getByLabel('Thiết bị kiểm tra dự án').selectOption('mobile');
    await page.getByLabel('Số trang mỗi website trong dự án').selectOption('5');
    await queue.getByRole('button', { name: 'Kiểm tra toàn bộ dự án', exact: true }).click();
    await queue.locator('.batch-status.running').waitFor();
    const first = (await json(`/api/projects/${project.id}/batches`))[0];
    before = await waitBatch(first.id);
    assert.equal(before.status, 'completed');
    setVariant('fixed');
    await queue
      .getByRole('button', { name: 'Kiểm tra toàn bộ dự án', exact: true })
      .waitFor({ state: 'visible' });
    await queue
      .getByRole('button', { name: 'Kiểm tra toàn bộ dự án', exact: true })
      .click({ timeout: 15_000 });
    await queue.locator('.batch-status.running').waitFor();
    const second = (await json(`/api/projects/${project.id}/batches`)).find(
      (batch) => batch.id !== before.id,
    );
    after = await waitBatch(second.id);
    assert.equal(after.status, 'completed');
    for (const batch of [before, after]) {
      const report = await store.readReport(batch.items[0].reportId);
      assert.ok(report.lighthouse.available, report.lighthouse.error);
      assert.equal(report.categories.performance.source, 'Lighthouse');
    }
    await panel.locator('.comparison-site').waitFor({ timeout: 20_000 });
    const result = await json(
      `/api/projects/${project.id}/batch-comparison?before=${before.id}&after=${after.id}`,
    );
    assert.ok(result.totals.resolvedIssues > 0);
    assert.ok(result.totals.newIssues > 0);
    assert.ok(
      result.websites[0].changes.resolved.some(
        (change) => change.rule === 'description' && change.url.endsWith('/about'),
      ),
    );
    assert.ok(
      result.websites[0].changes.new.some(
        (change) => change.rule === 'h1' && change.url.endsWith('/about'),
      ),
    );
    await axe('Real Lighthouse project comparison');
    await noOverflow();
    await page.screenshot({ path: path.join(artifacts, 'comparison-real.png'), fullPage: true });
    await fs.writeFile(
      path.join(artifacts, 'comparison-real.json'),
      JSON.stringify(result, null, 2),
    );
    console.log(
      'PASS: two real project audits with Lighthouse Mobile, confirmed description fix and new H1 issue on the same URL, conservative score comparison, accessible UI.',
    );
  } else {
    const logo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#28664f';
      ctx.fillRect(0, 0, 240, 100);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 45px Arial';
      ctx.fillText('MỘC', 24, 68);
      return canvas.toDataURL('image/png');
    });
    await json(
      `/api/clients/${client.id}`,
      {
        branding: {
          ...defaultBranding,
          agencyName: 'Mộc Digital',
          tagline: 'Theo dõi chất lượng website',
          footer: 'Mộc Digital · hello@moc.example',
          logoDataUrl: logo,
        },
      },
      'PATCH',
    );
    await panel.locator('.comparison-site').first().waitFor();
    assert.equal(await panel.locator('.comparison-site').count(), 6);
    assert.equal(await panel.locator('.comparison-site.improved').count(), 1);
    assert.equal(await panel.locator('.comparison-site.regressed').count(), 1);
    assert.equal(await panel.locator('.comparison-site.unverified').count(), 2);
    await panel.getByLabel('Lần kiểm tra trước').selectOption(after.id);
    await panel
      .getByRole('alert')
      .filter({ hasText: 'Chọn hai lần kiểm tra khác nhau.' })
      .waitFor();
    await panel.getByLabel('Lần kiểm tra sau').selectOption(before.id);
    await panel.getByRole('alert').filter({ hasText: 'Chọn lần trước cũ hơn lần sau.' }).waitFor();
    await panel.getByLabel('Lần kiểm tra trước').selectOption(before.id);
    await panel.getByLabel('Lần kiểm tra sau').selectOption(after.id);
    await panel.locator('.comparison-site.improved').waitFor();
    await panel.locator('.comparison-site.improved summary').click();
    assert.equal(await panel.locator('.comparison-site.improved li').count(), 8);
    await panel.getByLabel('Khoảng thời gian xu hướng').selectOption('monthly');
    await panel.getByLabel('Website xem xu hướng').selectOption(urls[2]);
    await panel.locator('.trend-data summary').click();
    assert.equal(await panel.locator('.trend-data tbody tr').count(), 12);
    assert.equal(
      await panel.locator('.trend-data tbody tr').last().locator('td').first().innerText(),
      '—',
    );
    await panel.getByLabel('Website xem xu hướng').selectOption(urls[0]);
    await axe('Comparison desktop, all findings and calendar table');
    await noOverflow();
    await page.screenshot({ path: path.join(artifacts, 'comparison-desktop.png'), fullPage: true });
    await panel.screenshot({ path: path.join(artifacts, 'comparison-panel.png') });
    for (const [format, label] of [
      ['pdf', 'PDF so sánh'],
      ['html', 'HTML'],
      ['csv', 'CSV'],
      ['json', 'JSON'],
    ]) {
      const started = Date.now();
      const downloaded = page.waitForEvent('download', {
        timeout: format === 'pdf' ? 60_000 : 30_000,
      });
      await panel.getByRole('button', { name: label, exact: true }).click();
      await (await downloaded).saveAs(path.join(artifacts, `comparison-report.${format}`));
      console.log(`PASS: ${format.toUpperCase()} comparison export (${Date.now() - started} ms).`);
    }
    const exported = JSON.parse(
      await fs.readFile(path.join(artifacts, 'comparison-report.json'), 'utf8'),
    );
    assert.equal(exported.branding.agencyName, 'Mộc Digital');
    assert.equal(exported.before.id, before.id);
    assert.deepEqual(exported.selectedTrend, { interval: 'monthly', url: urls[0] });
    assert.equal(exported.totals.added, 1);
    assert.equal(exported.totals.removed, 1);
    assert.ok(exported.totals.unverifiedIssues > 0);
    const csv = csvRows(await fs.readFile(path.join(artifacts, 'comparison-report.csv'), 'utf8'));
    assert.ok(csv.every((row) => row.length === 22));
    assert.equal(csv.filter((row) => row[0] === 'Xu hướng').length, 6 * 24);
    const expectedFindings = exported.websites.reduce(
      (count, site) => count + Object.values(site.changes).flat().length,
      0,
    );
    const html = await fs.readFile(path.join(artifacts, 'comparison-report.html'), 'utf8');
    assert.equal((html.match(/class="finding"/g) || []).length, expectedFindings);
    assert.ok(html.includes('Xu hướng điểm theo tháng') && html.includes('Mộc Digital'));
    const staticPage = await context.newPage();
    const requested = [];
    staticPage.on('request', (request) => requested.push(request.url()));
    await staticPage.goto(pathToFileURL(path.join(artifacts, 'comparison-report.html')).href);
    await staticPage
      .getByRole('heading', { name: 'So sánh các lần kiểm tra dự án', exact: true })
      .waitFor();
    assert.ok(requested.every((url) => url.startsWith('file:') || url.startsWith('data:')));
    await axe('Standalone branded HTML comparison', staticPage);
    await staticPage.close();
    await page.setViewportSize({ width: 390, height: 844 });
    await axe('Mobile comparison with expanded findings and table');
    await noOverflow();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'comparison-mobile.png'), fullPage: true });
    const latestA = after.items.find((item) => item.url === urls[0]);
    await workspace.assignResource('reports', latestA.reportId, null);
    await panel
      .locator('.comparison-site.improved')
      .waitFor({ state: 'detached', timeout: 20_000 });
    assert.equal(await panel.locator('.comparison-site.unverified').count(), 3);
    await page.reload({ waitUntil: 'networkidle' });
    await openProject();
    await panel.locator('.comparison-site.unverified').first().waitFor();
    assert.equal(await panel.locator('.comparison-site.unverified').count(), 3);
    const other = await json(
      '/api/projects',
      { clientId: client.id, name: 'Dự án chưa có lịch sử', websites: [urls[0]] },
      'POST',
    );
    await page.reload({ waitUntil: 'networkidle' });
    await openProject(other.name);
    await panel
      .getByText('Cần ít nhất hai lần kiểm tra đã kết thúc để so sánh.', { exact: false })
      .waitFor();
    assert.equal(await panel.locator('.comparison-site').count(), 0);
    await openProject();
    await panel.locator('.comparison-site.regressed').waitFor();
    await panel
      .locator('.comparison-site.regressed')
      .getByRole('button', { name: 'Mở lần sau', exact: false })
      .click();
    await page.locator('.report-heading').waitFor();
    await noOverflow();
    console.log(
      'PASS: date-order validation, per-website changes without truncation, weekly/monthly charts and table, reused/failed/removed/added websites, automatic membership refresh, reload and project switching.',
    );
    console.log(
      'PASS: branded PDF/HTML/CSV/JSON, selected chart export, full findings and calendar data, standalone HTML, axe desktop/mobile, no overflow and original report navigation.',
    );
  }
  assert.deepEqual(errors, []);
  console.log(`COMPARISON CHECKS PASSED (${real ? 'real Lighthouse' : 'synthetic history'}).`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({
        path: path.join(artifacts, `comparison${real ? '-real' : ''}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
    console.error(
      await page
        .locator('.batch-comparison-panel')
        .innerText()
        .catch(() => ''),
    );
  }
  throw error;
} finally {
  await instance.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(temporary).startsWith('website-audit-comparison-verify-'));
  await fs.rm(temporary, { recursive: true, force: true });
}
