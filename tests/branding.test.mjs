import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { brandingReport, csvRows } from './fixtures/branding-report.mjs';
import { reportHtml, exportCsv } from '../server/export.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-branding-test-'));
process.env.AUDIT_DATA_DIR = temporary;
const store = await import('../server/store.mjs');
const { defaultBranding, validateBrandingInput, getBranding, updateBranding } =
  await import('../server/branding.mjs');
const { createApp } = await import('../server/index.mjs');
const logo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAxoAAAAASUVORK5CYII=';
beforeEach(async () => {
  await store.withBrandingLock(() => fs.rm(store.brandingFile, { force: true }));
});
after(async () => {
  const resolved = path.resolve(temporary);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('website-audit-branding-test-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
});

test('branding validates text and color, trims fields and only accepts editable properties', () => {
  assert.deepEqual(
    validateBrandingInput({
      ...defaultBranding,
      agencyName: ' Agency ',
      tagline: ' Tagline ',
      footer: ' Footer ',
      accentColor: '#ABCDEF',
      extra: true,
    }),
    {
      ...defaultBranding,
      agencyName: 'Agency',
      tagline: 'Tagline',
      footer: 'Footer',
      accentColor: '#abcdef',
    },
  );
  assert.deepEqual(validateBrandingInput({ agencyName: ' A ', unknown: true }, { partial: true }), {
    agencyName: 'A',
  });
  for (const value of [
    null,
    [],
    'agency',
    { agencyName: '' },
    { agencyName: 'x'.repeat(81) },
    { agencyName: 3 },
    { tagline: 'x'.repeat(161) },
    { footer: 'x'.repeat(181) },
    { accentColor: '#fff' },
    { accentColor: '#000000;display:none' },
    { logoDataUrl: 8 },
  ])
    assert.throws(() => validateBrandingInput(value, { partial: true }));
});

test('logos require supported image headers, correct base64 and bounded file and pixel sizes', () => {
  assert.equal(validateBrandingInput({ logoDataUrl: logo }, { partial: true }).logoDataUrl, logo);
  assert.equal(validateBrandingInput({ logoDataUrl: '' }, { partial: true }).logoDataUrl, null);
  for (const value of [
    'https://example.com/logo.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,ZmFrZQ==',
    logo.replace('image/png', 'image/jpeg'),
    `${logo}====`,
    `data:image/png;base64,${Buffer.alloc(301 * 1024).toString('base64')}`,
  ])
    assert.throws(() => validateBrandingInput({ logoDataUrl: value }, { partial: true }));
  const oversized = Buffer.from(logo.split(',')[1], 'base64');
  oversized.writeUInt32BE(5000, 16);
  assert.throws(
    () =>
      validateBrandingInput(
        { logoDataUrl: `data:image/png;base64,${oversized.toString('base64')}` },
        { partial: true },
      ),
    /4096/,
  );
  oversized.writeUInt32BE(0, 16);
  assert.throws(
    () =>
      validateBrandingInput(
        { logoDataUrl: `data:image/png;base64,${oversized.toString('base64')}` },
        { partial: true },
      ),
    /4096/,
  );
});

test('branding defaults and simultaneous partial updates survive reload without lost writes', async () => {
  assert.deepEqual(await getBranding(), defaultBranding);
  await Promise.all([
    updateBranding({ agencyName: 'Mộc Digital' }),
    updateBranding({ tagline: 'Website tốt hơn mỗi ngày' }),
    updateBranding({ accentColor: '#522c85' }),
    updateBranding({ logoDataUrl: logo }),
  ]);
  const current = await getBranding();
  assert.equal(current.agencyName, 'Mộc Digital');
  assert.equal(current.tagline, 'Website tốt hơn mỗi ngày');
  assert.equal(current.accentColor, '#522c85');
  assert.equal(current.logoDataUrl, logo);
  assert.deepEqual(JSON.parse(await fs.readFile(store.brandingFile, 'utf8')), current);
  assert.ok((await fs.readdir(temporary)).every((file) => !file.endsWith('.tmp')));
});

test(
  'atomic configuration replacement retries a transient Windows lock and preserves the prior file',
  { skip: process.platform !== 'win32' },
  async (t) => {
    await updateBranding({ agencyName: 'Đang dùng' });
    const rename = fs.rename;
    let attempts = 0;
    t.mock.method(fs, 'rename', async (source, destination) => {
      if (destination === store.brandingFile && attempts++ === 0) {
        assert.equal(JSON.parse(await fs.readFile(destination, 'utf8')).agencyName, 'Đang dùng');
        throw Object.assign(new Error('File is temporarily busy'), { code: 'EPERM' });
      }
      return rename(source, destination);
    });
    await updateBranding({ agencyName: 'Đã cập nhật' });
    assert.equal(attempts, 2);
    assert.equal((await getBranding()).agencyName, 'Đã cập nhật');
  },
);

test('invalid updates and corrupt saved branding never overwrite existing configuration', async () => {
  await updateBranding({ agencyName: 'Đã lưu' });
  const saved = await fs.readFile(store.brandingFile, 'utf8');
  await assert.rejects(() => updateBranding({ accentColor: 'red' }));
  assert.equal(await fs.readFile(store.brandingFile, 'utf8'), saved);
  for (const corrupt of ['{broken', 'null', '[]', '{"accentColor":"red"}']) {
    await fs.writeFile(store.brandingFile, corrupt);
    await assert.rejects(() => updateBranding({ agencyName: 'Không được ghi' }));
    assert.equal(await fs.readFile(store.brandingFile, 'utf8'), corrupt);
  }
});

test('HTML brands reports, escapes custom text and rejects CSS or remote image injection', () => {
  const report = brandingReport();
  const original = JSON.stringify(report);
  const brand = {
    ...defaultBranding,
    agencyName: '<img src=x onerror=alert(1)> & Agency',
    tagline: '<script>bad</script>',
    footer: 'Liên hệ <contact@example.com>',
    accentColor: '#522c85',
    logoDataUrl: logo,
  };
  const html = reportHtml(report, brand);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; Agency'));
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('Liên hệ &lt;contact@example.com&gt;'));
  assert.ok(html.includes(`src="${logo}"`));
  assert.ok(html.includes('--accent:#522c85'));
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
  assert.ok(html.includes('img-src data:'));
  const rejected = reportHtml(report, {
    ...brand,
    accentColor: '#fff;display:none',
    logoDataUrl: 'https://evil.example/logo.png',
  });
  assert.ok(!rejected.includes('display:none') && !rejected.includes('evil.example'));
  assert.equal(JSON.stringify(report), original);
});

test('CSV keeps rectangular issue rows and neutralizes formulas in custom metadata', () => {
  const report = brandingReport();
  const rows = csvRows(
    exportCsv(report, {
      ...defaultBranding,
      agencyName: '=CMD()',
      tagline: '+SUM(1,2)',
      footer: 'Contact, "Mộc"\nDòng 2',
    }),
  );
  assert.equal(rows.length, report.checks.length + 1);
  assert.ok(rows.every((row) => row.length === 16));
  assert.deepEqual(rows[0].slice(8, 11), ['Đơn vị xuất báo cáo', 'Khẩu hiệu', 'Chân trang']);
  assert.equal(rows[1][8], "'=CMD()");
  assert.equal(rows[1][9], "'+SUM(1,2)");
  assert.equal(rows[1][10], 'Contact, "Mộc"\nDòng 2');
});

test('branding API persists locally, guards origins and limits bodies while exports retain the original audit', async () => {
  const instance = createApp({ startupDelayMs: 60_000 });
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (body, headers = {}) =>
    fetch(`${base}/api/branding`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.deepEqual(await (await fetch(`${base}/api/branding`)).json(), defaultBranding);
    assert.equal(
      (await request({ agencyName: 'Intruder' }, { Origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal(
      (await request({ agencyName: 'Intruder' }, { 'sec-fetch-site': 'cross-site' })).status,
      403,
    );
    assert.equal(
      (await request({ ...defaultBranding, agencyName: 'Mộc Agency', logoDataUrl: logo })).status,
      200,
    );
    assert.equal((await request({ accentColor: 'red' })).status, 400);
    assert.equal((await request({ logoDataUrl: 'x'.repeat(500 * 1024) })).status, 413);
    assert.equal((await getBranding()).agencyName, 'Mộc Agency');
    const report = brandingReport();
    await store.saveReport(report);
    const exported = await (
      await fetch(`${base}/api/reports/${report.id}/export?format=json`)
    ).json();
    const { branding, ...audit } = exported;
    assert.equal(branding.agencyName, 'Mộc Agency');
    assert.deepEqual(audit, report);
    assert.deepEqual(await store.readReport(report.id), report);
    const html = await (await fetch(`${base}/api/reports/${report.id}/export?format=html`)).text();
    assert.ok(html.includes('Mộc Agency') && html.includes(logo));
    assert.ok(
      (await (await fetch(`${base}/api/reports/${report.id}/export?format=csv`)).text()).includes(
        'Mộc Agency',
      ),
    );
  } finally {
    instance.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
