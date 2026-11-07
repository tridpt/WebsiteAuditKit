import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPage,
  parseRobots,
  isAllowedByRobots,
  scoreChecks,
  buildChecks,
} from '../server/analyzer.mjs';
import { escapeHtml, exportCsv, reportHtml } from '../server/export.mjs';

test('SEO extraction resolves base URLs and excludes unsafe or state-changing links', () => {
  const page = extractPage({
    url: 'https://example.com/start',
    status: 200,
    body: Buffer.from(
      '<html lang="vi"><head><title>Tiêu đề trang</title><base href="/docs/"><meta name="Description" content="Mô tả"><meta name="robots" content="noindex"></head><body><h1>Xin chào</h1><img src="a.png"><img src="b.png" alt=""><a href="guide#intro">Guide</a><a href="guide#second">Guide 2</a><a href="javascript:alert(1)">JS</a><a href="/logout">Out</a></body></html>',
    ),
    headers: {},
    bytes: 1000,
    ttfb: 120,
    duration: 150,
  });
  assert.equal(page.title, 'Tiêu đề trang');
  assert.equal(page.description, 'Mô tả');
  assert.equal(page.noindex, true);
  assert.equal(page.missingAlt, 1);
  assert.equal(page.h1.length, 1);
  assert.equal(page.links.length, 1);
  assert.equal(page.links[0].url, 'https://example.com/docs/guide');
});

test('robots uses longest rule and the agent-specific group with wildcard/end anchors', () => {
  const robots = parseRobots(
    'User-agent: *\nDisallow: /private/\nAllow: /private/public\nDisallow: /*.pdf$\nSitemap: https://example.com/custom.xml',
    'https://example.com/robots.txt',
  );
  assert.equal(isAllowedByRobots('https://example.com/private/a', robots.rules), false);
  assert.equal(isAllowedByRobots('https://example.com/private/public', robots.rules), true);
  assert.equal(isAllowedByRobots('https://example.com/a.pdf', robots.rules), false);
  assert.equal(isAllowedByRobots('https://example.com/a.pdf/more', robots.rules), true);
  assert.deepEqual(robots.sitemaps, ['https://example.com/custom.xml']);
  const specific = parseRobots(
    'User-agent: *\nDisallow: /\nUser-agent: WebsiteAuditKit\nAllow: /',
    'https://example.com/robots.txt',
  );
  assert.equal(isAllowedByRobots('https://example.com/anything', specific.rules), true);
});

test('weighted score excludes informational checks and unmeasured categories', () => {
  const checks = [
    { category: 'seo', weight: 10, status: 'pass' },
    { category: 'seo', weight: 10, status: 'warn' },
    { category: 'seo', weight: 999, status: 'info' },
    { category: 'links', weight: 10, status: 'fail' },
  ];
  const result = scoreChecks(checks);
  assert.equal(result.categories.seo.score, 75);
  assert.equal(result.categories.links.score, 0);
  assert.equal(result.categories.mobile.score, null);
  assert.equal(result.score, 38);
  const page = extractPage({
    url: 'https://example.com/',
    status: 200,
    body: Buffer.from(
      '<html><head><title>A normal website title</title></head><body><h1>Welcome</h1></body></html>',
    ),
    headers: {},
    bytes: 100,
    ttfb: 50,
    duration: 100,
  });
  const emptyLinks = buildChecks({
    pages: [page],
    links: [],
    browser: { available: false },
    robots: { available: false, status: 404, url: 'https://example.com/robots.txt' },
    sitemap: { available: false, status: 404, url: 'https://example.com/sitemap.xml' },
    discoveredLinks: 0,
    skippedLinks: 0,
  });
  assert.equal(
    scoreChecks(emptyLinks).categories.links.score,
    null,
    'No checked links must not result in a perfect score',
  );
});

test('exports escape untrusted HTML and neutralize CSV formula injection', () => {
  assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  const report = {
    title: '<script>alert(1)</script>',
    url: 'https://example.com',
    id: 'test',
    createdAt: '2026-10-23T03:00:00Z',
    device: 'mobile',
    score: 50,
    categories: {},
    checks: [
      {
        title: '=HYPERLINK("evil")',
        description: '<img src=x onerror=alert(1)>',
        recommendation: '+malicious',
        evidence: ['<script>bad</script>'],
        urls: ['https://example.com'],
        severity: 'high',
        category: 'seo',
        status: 'fail',
        effort: '15 phút',
        done: false,
      },
    ],
    scope: {
      scannedPages: 1,
      requestedPages: 1,
      checkedLinks: 0,
      discoveredLinks: 0,
      skippedLinks: 0,
      mobilePages: 1,
    },
    methodology: 'Test',
    warnings: [],
  };
  const csv = exportCsv(report);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+malicious/);
  const html = reportHtml(report);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});
