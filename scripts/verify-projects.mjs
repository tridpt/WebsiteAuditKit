import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import AxeBuilder from '@axe-core/playwright';
import { brandingReport, csvRows } from '../tests/fixtures/branding-report.mjs';
import { startFixture } from './fixture.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-project-verify-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const { createApp } = await import('../server/index.mjs');
const store = await import('../server/store.mjs');
const { failMonitorRun } = await import('../server/monitor.mjs');
const { launchBrowser } = await import('../server/browser.mjs');
const { fixture, url: fixtureUrl } = await startFixture();
const url = `${fixtureUrl}/`;
const runner = async ({ id, url: inputUrl, device, onProgress }) => {
  onProgress(60, 'Đang tạo dữ liệu kiểm thử dự án…');
  await new Promise((resolve) => setTimeout(resolve, 350));
  return {
    ...brandingReport(),
    id,
    url: inputUrl,
    requestedUrl: inputUrl,
    createdAt: new Date().toISOString(),
    device,
  };
};
const instance = createApp({ auditRunner: runner, startupDelayMs: 60_000 });
const server = instance.app.listen(0, '127.0.0.1');
await once(server, 'listening');
process.env.PORT = String(server.address().port);
const base = `http://127.0.0.1:${server.address().port}`;
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const previous = {
  ...brandingReport(),
  title: 'Báo cáo hiện có',
  url,
  requestedUrl: url,
  createdAt: '2026-10-01T03:30:00.000Z',
};
const other = {
  ...brandingReport(),
  title: 'Báo cáo khách hàng B',
  url: `${url}other`,
  requestedUrl: `${url}other`,
};
await Promise.all([store.saveReport(previous), store.saveReport(other)]);
const browser = await launchBrowser();
const errors = [];
let diagnosticPage;
const json = async (route, body, method = 'GET') => {
  const response = await fetch(base + route, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};
const state = async () => (await json('/api/workspace')).body;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  diagnosticPage = page;
  page.on('pageerror', (error) => errors.push(error.message));
  async function navigate() {
    if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('button', { name: 'Khách hàng & dự án', exact: true }).click();
    await page.getByRole('heading', { name: 'Khách hàng & dự án.' }).waitFor();
  }
  async function openProject(name = 'Chăm sóc Mộc Studio') {
    await navigate();
    await page.getByRole('button', { name: `Mở dự án ${name}`, exact: true }).click();
    await page.getByRole('heading', { name: `${name}.`, exact: true }).waitFor();
  }
  async function axe(label) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, message: n.failureSummary })),
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
  async function screenshot(name) {
    await page.screenshot({
      path: path.join(artifacts, name),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.goto(base, { waitUntil: 'networkidle' });
  await navigate();
  await axe('Empty customers view');
  await page.getByRole('button', { name: 'Tạo khách hàng đầu tiên', exact: true }).click();
  await page.getByLabel('Tên khách hàng', { exact: true }).fill('Mộc Studio');
  await page.getByLabel('Liên hệ khách hàng').fill('Linh · hello@moc.example');
  await page.getByLabel('Ghi chú khách hàng').fill('Chăm sóc website hằng tháng');
  await axe('Client creation form');
  await page.getByRole('button', { name: 'Lưu khách hàng', exact: true }).click();
  const clientCard = page.getByRole('article', { name: 'Khách hàng Mộc Studio', exact: true });
  await clientCard.waitFor();
  let client = (await state()).clients[0];
  await page.getByRole('button', { name: 'Thêm dự án', exact: true }).click();
  await page.getByLabel('Tên dự án khách hàng').fill('Chăm sóc Mộc Studio');
  await page.getByLabel('Website của dự án').fill('http://169.254.169.254/');
  await page.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
  await page.locator('.project-error').waitFor();
  assert.equal((await state()).projects.length, 0);
  await page.getByLabel('Website của dự án').fill(`${url}\n${url}other`);
  await page.getByLabel('Ghi chú dự án').fill('Ưu tiên hiệu năng và SEO.');
  await axe('Project editor');
  await page.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
  await page.getByRole('button', { name: 'Mở dự án Chăm sóc Mộc Studio', exact: true }).waitFor();
  const project = (await state()).projects[0];
  await page
    .getByRole('button', { name: 'Thương hiệu khách hàng Mộc Studio', exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Tên agency', { exact: true }).fill('Mộc Digital');
  await page.getByLabel('Khẩu hiệu báo cáo').fill('Chăm sóc website cho Mộc Studio');
  await page.getByLabel('Dòng chân trang báo cáo').fill('Mộc Digital · hello@moc.example');
  await page.getByLabel('Màu nhận diện báo cáo').fill('#28664f');
  const logo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 100;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#28664f';
    ctx.fillRect(0, 0, 240, 100);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 45px Arial';
    ctx.fillText('MỘC', 24, 68);
    return c.toDataURL('image/png');
  });
  await page.getByLabel('Tải logo agency').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(logo.split(',')[1], 'base64'),
  });
  await page.getByAltText('Xem trước logo').waitFor();
  await axe('Client branding preview');
  await page.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'networkidle' });
  await navigate();
  client = (await state()).clients[0];
  assert.equal(client.branding.agencyName, 'Mộc Digital');
  const second = (await json('/api/clients', { name: 'Khách hàng B' }, 'POST')).body;
  const secondProject = (
    await json(
      '/api/projects',
      { name: 'Website B', clientId: second.id, websites: [`${url}other`] },
      'POST',
    )
  ).body;
  await json(`/api/reports/${other.id}/project`, { projectId: secondProject.id }, 'PATCH');
  await page.reload({ waitUntil: 'networkidle' });
  await navigate();
  await axe('Customers and project cards');
  await screenshot('projects-desktop.png');
  await openProject();
  await page.getByLabel('Báo cáo cần gắn vào dự án').selectOption(previous.id);
  await page.getByRole('button', { name: 'Gắn báo cáo', exact: true }).click();
  await page.getByRole('button', { name: /^Báo cáo hiện có/ }).waitFor();
  assert.equal((await state()).reports[previous.id], project.id);
  console.log(
    'PASS: customer/project creation, private URL rejection, independent branding and report attachment.',
  );
  const auditResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/audits') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Kiểm tra website này', exact: true }).first().click();
  const started = await (await auditResponse).json();
  await page.waitForFunction(
    (id) => localStorage.getItem('auditkit.lastReport') === id,
    started.id,
  );
  assert.equal((await state()).reports[started.id], project.id);
  assert.equal(
    await page.getByLabel('Dự án của báo cáo', { exact: true }).inputValue(),
    project.id,
  );
  await openProject();
  await page.locator('.project-task').first().waitFor();
  assert.equal(
    await page.locator('.project-task').count(),
    8,
    'Only the latest report per URL contributes project tasks',
  );
  const taskTitle = 'Một số vùng bấm hơi nhỏ';
  let task = page.getByRole('form', { name: `Công việc ${taskTitle}`, exact: true });
  await task.getByLabel(`Người phụ trách ${taskTitle}`).fill('Linh');
  await task.getByLabel(`Hạn sửa ${taskTitle}`).fill('2026-10-01');
  await task.getByLabel(`Trạng thái ${taskTitle}`).selectOption('doing');
  const saveTask = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/reports/${started.id}/checks/fixture-1`) &&
      r.request().method() === 'PATCH',
  );
  await task.getByRole('button', { name: `Lưu việc ${taskTitle}` }).click();
  await saveTask;
  await task.getByText('Quá hạn', { exact: true }).waitFor();
  await page.getByLabel('Lọc công việc dự án').selectOption('doing');
  await page.getByLabel('Tìm công việc dự án').fill('Linh');
  assert.equal(await page.locator('.project-task').count(), 1);
  await axe('Project task assignments, due date and status filters');
  await task.getByLabel(`Trạng thái ${taskTitle}`).selectOption('done');
  await task.getByRole('button', { name: `Lưu việc ${taskTitle}` }).click();
  await page.getByText('Không có công việc phù hợp.', { exact: true }).waitFor();
  await page.getByLabel('Lọc công việc dự án').selectOption('all');
  await page.getByLabel('Tìm công việc dự án').fill('');
  await page.reload({ waitUntil: 'networkidle' });
  await openProject();
  task = page.getByRole('form', { name: `Công việc ${taskTitle}`, exact: true });
  await task.waitFor();
  assert.equal(await task.getByLabel(`Người phụ trách ${taskTitle}`).inputValue(), 'Linh');
  assert.equal(await task.getByLabel(`Trạng thái ${taskTitle}`).inputValue(), 'done');
  const report = await store.readReport(started.id);
  assert.equal(report.score, 72);
  assert.equal(report.checks[1].status, 'fail');
  await page.getByRole('button', { name: 'Theo dõi mỗi tuần', exact: true }).first().click();
  await page.getByRole('button', { name: 'Đã thêm theo dõi', exact: true }).first().waitFor();
  const monitorId = Object.keys((await state()).monitors)[0];
  assert.equal(
    (await json('/api/monitors')).body.find((m) => m.id === monitorId).interval,
    'weekly',
  );
  await failMonitorRun(monitorId, new Error('Cảnh báo kiểm thử cho dự án Mộc Studio'));
  await page.reload({ waitUntil: 'networkidle' });
  await openProject();
  await page
    .getByText('Lượt theo dõi không hoàn tất: Cảnh báo kiểm thử cho dự án Mộc Studio', {
      exact: true,
    })
    .waitFor();
  await axe('Project details with grouped monitoring alerts');
  await screenshot('project-details-desktop.png');
  await page.getByRole('button', { name: /^client\.example/ }).click();
  await page.getByRole('button', { name: 'Xuất báo cáo', exact: true }).click();
  await page.locator('.export-branding-note').getByText('Mộc Digital', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'PDF Gửi cho khách hàng', exact: true }).waitFor();
  const pendingPdf = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'PDF Gửi cho khách hàng', exact: true }).click();
  await (await pendingPdf).saveAs(path.join(artifacts, 'project-report.pdf'));
  // Export the edited report to verify ownership and dates as well as the client context.
  for (const format of ['json', 'csv', 'html']) {
    const response = await fetch(`${base}/api/reports/${started.id}/export?format=${format}`);
    assert.equal(response.status, 200);
    await fs.writeFile(
      path.join(artifacts, `project-report.${format}`),
      Buffer.from(await response.arrayBuffer()),
    );
  }
  const exported = JSON.parse(
    await fs.readFile(path.join(artifacts, 'project-report.json'), 'utf8'),
  );
  assert.equal(exported.branding.agencyName, 'Mộc Digital');
  assert.equal(exported.context.project.id, project.id);
  assert.equal(exported.context.client.id, client.id);
  const csv = csvRows(await fs.readFile(path.join(artifacts, 'project-report.csv'), 'utf8'));
  assert.ok(csv.every((row) => row.length === 16));
  const changedRow = csv.find((row) => row[2] === taskTitle);
  assert.equal(changedRow[13], 'Linh');
  assert.equal(changedRow[14], '2026-10-01');
  assert.equal(changedRow[15], 'Đã xong');
  const html = await fs.readFile(path.join(artifacts, 'project-report.html'), 'utf8');
  assert.ok(
    html.includes('Khách hàng: Mộc Studio') &&
      html.includes('Dự án: Chăm sóc Mộc Studio') &&
      html.includes('Linh'),
  );
  const unrelated = (await json(`/api/reports/${other.id}/export?format=json`)).body;
  assert.equal(unrelated.branding.agencyName, 'Website Audit Kit');
  await openProject();
  await page.getByRole('button', { name: 'Sửa thương hiệu khách hàng', exact: true }).click();
  await page.getByRole('button', { name: 'Dùng cấu hình chung', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(
    (await json(`/api/reports/${started.id}/export?format=json`)).body.branding.agencyName,
    'Website Audit Kit',
  );
  await json(`/api/clients/${client.id}`, { branding: client.branding }, 'PATCH');
  await page.reload({ waitUntil: 'networkidle' });
  await navigate();
  await page.getByLabel('Lọc khách hàng').selectOption(client.id);
  assert.equal(await page.locator('.project-card').count(), 1);
  await page.getByLabel('Tìm dự án').fill('không tồn tại');
  assert.equal(await page.locator('.project-card').count(), 0);
  await page.getByLabel('Tìm dự án').fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('Mobile client list');
  await axe('Mobile customers and projects');
  await screenshot('projects-mobile.png');
  await openProject();
  await noOverflow('Mobile project details');
  await axe('Mobile project tasks and schedules');
  await screenshot('project-details-mobile.png');
  await page.getByRole('button', { name: 'Sửa dự án', exact: true }).click();
  await axe('Mobile project editor');
  await page.getByLabel('Khách hàng của dự án').selectOption(second.id);
  await page.getByLabel('Tên dự án khách hàng').fill('Dự án đã chuyển');
  await page.getByRole('button', { name: 'Lưu dự án', exact: true }).click();
  await page.getByRole('heading', { name: 'Dự án đã chuyển.', exact: true }).waitFor();
  assert.equal(
    (await json(`/api/reports/${started.id}/export?format=json`)).body.branding.agencyName,
    'Website Audit Kit',
    'Moving a project changes the export client context',
  );
  await page.getByRole('button', { name: 'Xóa dự án', exact: true }).click();
  await axe('Project deletion confirmation');
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await page.getByRole('heading', { name: 'Khách hàng & dự án.', exact: true }).waitFor();
  assert.ok(await store.readReport(started.id));
  assert.ok((await json('/api/monitors')).body.some((m) => m.id === monitorId));
  assert.equal((await state()).reports[started.id], undefined);
  assert.equal((await state()).monitors[monitorId], undefined);
  await page.getByRole('button', { name: 'Xóa khách hàng Mộc Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await clientCard.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: client/project CRUD, public URL validation, per-client branding, reload, explicit memberships, project audit and latest-report task grouping.',
  );
  console.log(
    'PASS: task owner/deadline/status, grouped monitoring alerts, client-specific PDF/HTML/CSV/JSON, inheritance, project transfer and deletion preserving reports and schedules.',
  );
  console.log(
    'PASS: axe on empty/list/editors/details/branding/tasks/delete states and mobile 390px with no overflow or JavaScript errors.',
  );
  console.log(`PROJECT CHECKS PASSED (synthetic audit runner). Artifacts: ${artifacts}`);
} catch (error) {
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    await diagnosticPage
      .screenshot({ path: path.join(artifacts, 'project-failure.png'), fullPage: true })
      .catch(() => {});
    console.error(
      await diagnosticPage
        .locator('main')
        .innerText()
        .catch(() => 'No page text'),
    );
  }
  const diagnostic = await state();
  console.error(
    JSON.stringify({
      ...diagnostic,
      clients: diagnostic.clients.map((client) => ({
        ...client,
        branding: client.branding ? { ...client.branding, logoDataUrl: '[logo]' } : null,
      })),
    }),
  );
  throw error;
} finally {
  instance.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-project-verify-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
}
