import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReports } from '../server/comparison.mjs';

const origin = 'https://example.com';
const page = (pathname = '/', title = 'A useful page title') => ({ url: origin + pathname, title });
const check = (id = 'title', status = 'pass', affected = [], extra = {}) => ({
  id,
  status,
  urls: affected.map((pathname) => origin + pathname),
  category: 'seo',
  title: id,
  severity: 'high',
  evidence: affected.map((pathname) => origin + pathname + ' — issue'),
  weight: 5,
  done: false,
  ...extra,
});
const report = (options = {}) => ({
  id: 'before',
  createdAt: '2026-10-22T00:00:00Z',
  title: 'example.com',
  url: origin + '/',
  device: 'mobile',
  pages: [page()],
  links: [],
  checks: [check()],
  score: 80,
  categories: Object.fromEntries(
    ['performance', 'seo', 'links', 'mobile'].map((id) => [id, { score: 80 }]),
  ),
  scope: { scannedPages: 1, checkedLinks: 0 },
  ...options,
});
function compare(before = {}, after = {}) {
  return compareReports(
    report(before),
    report({ id: 'after', createdAt: '2026-10-23T00:00:00Z', ...after }),
  );
}
const rule = (result, bucket, id = 'title') => result.changes[bucket].filter((r) => r.rule === id);

test('comparison tracks new, persistent and resolved findings per rule AND URL', () => {
  const pages = [page('/a'), page('/b'), page('/c')];
  const result = compare(
    { pages, checks: [check('title', 'fail', ['/a', '/b'])] },
    { pages, checks: [check('title', 'fail', ['/b', '/c'])] },
  );
  assert.equal(rule(result, 'resolved')[0].url, origin + '/a');
  assert.equal(rule(result, 'persistent')[0].url, origin + '/b');
  assert.equal(rule(result, 'new')[0].url, origin + '/c');
});

test('equal page counts with different URLs cannot prove a fix or regression', () => {
  const result = compare(
    { pages: [page('/a')], checks: [check('title', 'fail', ['/a'])] },
    { pages: [page('/b')], checks: [check('title', 'fail', ['/b'])] },
  );
  assert.equal(result.counts.resolved, 0);
  assert.equal(result.counts.new, 0);
  assert.equal(result.counts.unverified, 2);
  assert.equal(result.coverage.commonPages, 0);
  assert.ok(result.warnings.some((w) => w.includes('Danh sách trang')));
  assert.equal(result.scoreChanges.find((s) => s.id === 'seo').delta, null);
});

test('task completion never clears a finding without a successful rescan', () => {
  const result = compare(
    { checks: [check('title', 'fail', ['/'])] },
    { checks: [check('title', 'fail', ['/'], { done: true })] },
  );
  assert.equal(result.counts.persistent, 1);
  assert.equal(result.counts.resolved, 0);
});

test('404 turning into 403/429/timeouts remains unverified, not resolved', () => {
  const link = { url: origin + '/missing', source: origin + '/', status: 404, state: 'broken' };
  for (const status of [403, 429, null]) {
    const result = compare({ links: [link] }, { links: [{ ...link, state: 'unknown', status }] });
    assert.equal(rule(result, 'unverified', 'link-health').length, 1);
    assert.equal(result.counts.resolved, 0);
  }
});

test('a broken target is resolved only after that target is checked successfully', () => {
  const link = { url: origin + '/missing', source: origin + '/', status: 404, state: 'broken' };
  assert.equal(
    rule(
      compare({ links: [link] }, { links: [{ ...link, status: 200, state: 'ok' }] }),
      'resolved',
      'link-health',
    ).length,
    1,
  );
  assert.equal(
    rule(compare({ links: [link] }, { links: [] }), 'unverified', 'link-health').length,
    1,
  );
});

test('duplicate titles require all previously paired pages to be remeasured', () => {
  const before = {
    pages: [page('/a', 'Duplicate'), page('/b', 'Duplicate')],
    checks: [check('duplicate-titles', 'warn', ['/a', '/b'])],
  };
  const incomplete = compare(before, {
    pages: [page('/a', 'Unique')],
    checks: [check('duplicate-titles')],
  });
  assert.equal(incomplete.counts.resolved, 0);
  assert.equal(incomplete.counts.unverified, 2);
  const complete = compare(before, {
    pages: [page('/a', 'Unique A'), page('/b', 'Unique B')],
    checks: [check('duplicate-titles')],
  });
  assert.equal(complete.counts.resolved, 2);
});

test('browser performance results require a matching device', () => {
  const result = compare(
    { checks: [check('lcp', 'fail', ['/'], { category: 'performance' })] },
    { device: 'desktop', checks: [check('lcp', 'pass', [], { category: 'performance' })] },
  );
  assert.equal(rule(result, 'unverified', 'lcp').length, 1);
  assert.equal(result.scoreChanges.find((s) => s.id === 'performance').delta, null);
});

test('discovering an existing duplicate on an expanded crawl does not prove regression', () => {
  const result = compare(
    { pages: [page('/a', 'Duplicate')], checks: [check('duplicate-titles')] },
    {
      pages: [page('/a', 'Duplicate'), page('/b', 'Duplicate')],
      checks: [check('duplicate-titles', 'warn', ['/a', '/b'])],
    },
  );
  assert.equal(result.counts.new, 0);
  assert.equal(result.counts.unverified, 2);
});

test('old reports remain readable, but internal scores cannot be compared to Lighthouse', () => {
  const result = compare(
    {},
    {
      lighthouse: {
        available: true,
        version: '12.8.2',
        method: 'lighthouse-safe-bridge-v1',
        device: 'mobile',
        settings: {},
        audits: [],
      },
    },
  );
  assert.equal(result.scoreChanges.find((s) => s.id === 'performance').delta, null);
  assert.equal(result.scoreChanges.find((s) => s.id === 'total').delta, null);
  assert.equal(result.scoreChanges.find((s) => s.id === 'seo').delta, 0);
});

test('matching Lighthouse settings allow score changes; changed throttling does not', () => {
  const lighthouse = {
    available: true,
    version: '12.8.2',
    method: 'lighthouse-safe-bridge-v1',
    device: 'mobile',
    settings: { throttlingMethod: 'simulate' },
    audits: [],
  };
  const matching = compare({ lighthouse }, { lighthouse });
  assert.equal(matching.scoreChanges.find((s) => s.id === 'performance').delta, 0);
  const changed = compare(
    { lighthouse },
    { lighthouse: { ...lighthouse, settings: { throttlingMethod: 'devtools' } } },
  );
  assert.equal(changed.scoreChanges.find((s) => s.id === 'performance').delta, null);
});

test('Lighthouse notApplicable audits can clear a previous opportunity', () => {
  const audit = {
    id: 'unused-css-rules',
    title: 'Unused CSS',
    opportunity: true,
    score: 0,
    scoreDisplayMode: 'numeric',
    displayValue: '100 KB',
    resources: [],
  };
  const lighthouse = {
    available: true,
    version: '12.8.2',
    method: 'lighthouse-safe-bridge-v1',
    device: 'mobile',
    settings: {},
    audits: [audit],
  };
  const result = compare(
    { lighthouse },
    {
      lighthouse: {
        ...lighthouse,
        audits: [{ ...audit, score: null, scoreDisplayMode: 'notApplicable' }],
      },
    },
  );
  assert.equal(rule(result, 'resolved', 'lh-unused-css-rules').length, 1);
});

test('scores cannot be compared after a measurement rule or its weight changes', () => {
  const result = compare({}, { checks: [check('title', 'pass', [], { weight: 15 })] });
  assert.equal(result.scoreChanges.find((s) => s.id === 'seo').delta, null);
  assert.equal(result.scoreChanges.find((s) => s.id === 'total').delta, null);
});

test('chronological order is stable even when reports are selected in reverse', () => {
  const a = report(),
    b = report({ id: 'after', createdAt: '2026-10-23T00:00:00Z' });
  const result = compareReports(b, a);
  assert.equal(result.before.id, a.id);
  assert.equal(result.after.id, b.id);
});
