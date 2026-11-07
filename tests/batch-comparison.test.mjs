import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { brandingReport, csvRows } from './fixtures/branding-report.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'website-audit-comparison-test-'));
process.env.AUDIT_DATA_DIR = temporary;
process.env.AUDIT_ALLOW_LOOPBACK = '1';
const store = await import('../server/store.mjs');
const workspace = await import('../server/workspace.mjs');
const { compareBatchRuns } = await import('../server/batch-comparison.mjs');
const { compareReports } = await import('../server/comparison.mjs');
const { batchComparisonHtml, batchComparisonCsv } = await import('../server/batch-export.mjs');
const urls = ['https://client.example/', 'https://second.example/', 'https://third.example/'];
const times = ['2026-10-01T01:00:00.000Z', '2026-10-20T03:00:00.000Z'];
beforeEach(async () => {
  await store.saveWorkspace({ version: 1, clients: [], projects: [], reports: {}, monitors: {} });
});
after(async () => {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(temporary).startsWith('website-audit-comparison-test-'));
  await fs.rm(temporary, { recursive: true, force: true });
});
async function seed() {
  const client = await workspace.createClient({ name: 'Khách hàng so sánh' });
  return workspace.saveProject(null, {
    clientId: client.id,
    name: 'Dự án so sánh',
    websites: urls,
  });
}
async function report(project, url, at, score = 60, adjust = () => {}) {
  const data = {
    ...brandingReport(),
    id: randomUUID(),
    url,
    requestedUrl: url,
    createdAt: at,
    score,
  };
  data.pages = data.pages.map((page) => ({ ...page, url }));
  data.checks.forEach((check) => {
    check.urls = [url];
  });
  adjust(data);
  await store.saveReport(data);
  await workspace.assignResource('reports', data.id, project.id);
  return data;
}
function batch(project, at, items, extra = {}) {
  return {
    id: randomUUID(),
    projectId: project.id,
    projectName: project.name,
    createdAt: at,
    finishedAt: at,
    device: 'mobile',
    maxPages: 5,
    status: 'completed',
    items: items.map((item) =>
      item?.checks
        ? { url: item.requestedUrl, status: 'completed', reportId: item.id, error: null }
        : item,
    ),
    ...extra,
  };
}

test('failed common URLs and added/removed URLs keep known issues unverified', async () => {
  const project = await seed();
  const old = await report(project, urls[0], times[0]);
  const removed = await report(project, urls[1], times[0]);
  const added = await report(project, urls[2], times[1]);
  const before = batch(project, times[0], [old, removed]);
  const after = batch(
    project,
    times[1],
    [{ url: urls[0], status: 'failed', error: 'Timeout', reportId: null }, added],
    { status: 'partial' },
  );
  const result = await compareBatchRuns(before, after);
  assert.equal(result.totals.common, 1);
  assert.equal(result.totals.unverified, 1);
  assert.equal(result.totals.added, 1);
  assert.equal(result.totals.removed, 1);
  assert.equal(result.totals.resolvedIssues, 0);
  assert.equal(result.totals.newIssues, 0);
  for (const site of result.websites) {
    assert.equal(site.counts.unverified, 8);
    assert.equal(site.scoreDelta, null);
    assert.ok(site.changes.unverified.every((change) => change.reason));
  }
  const failed = result.websites.find((site) => site.url === urls[0]);
  assert.equal(failed.after.error, 'Timeout');
  assert.equal(failed.after.score, null);
});

test('detached, deleted and foreign-project reports are unavailable in comparison and trends', async () => {
  const project = await seed();
  const old = await report(project, urls[0], times[0]);
  const next = await report(project, urls[0], times[1]);
  const before = batch(project, times[0], [old]),
    after = batch(project, times[1], [next]);
  const other = await workspace.saveProject(null, {
    clientId: project.clientId,
    name: 'Dự án khác',
    websites: urls,
  });
  await workspace.assignResource('reports', next.id, other.id);
  const detached = await compareBatchRuns(before, after);
  assert.equal(detached.websites[0].after.reportId, null);
  assert.equal(detached.websites[0].after.reportMissing, true);
  assert.equal(detached.websites[0].status, 'unverified');
  assert.equal(detached.totals.removed, 0);
  assert.equal(detached.totals.resolvedIssues, 0);
  assert.equal(detached.trends.monthly.series[0].points.at(-1).score, null);
  await workspace.assignResource('reports', next.id, project.id);
  await fs.unlink(path.join(store.reportDir(next.id), 'report.json'));
  const deleted = await compareBatchRuns(before, after);
  assert.equal(deleted.websites[0].after.reportId, null);
  assert.equal(deleted.totals.resolvedIssues, 0);
  const foreignBatch = { ...after, projectId: other.id };
  await assert.rejects(compareBatchRuns(before, foreignBatch), { code: 'INVALID_BATCH' });
  const valid = await report(project, urls[0], times[1], 80);
  const clean = batch(project, times[1], [valid]);
  const foreign = batch(other, '2026-10-10T01:00:00.000Z', [old]);
  const isolated = await compareBatchRuns(before, clean, [before, foreign, clean]);
  assert.ok(isolated.trends.weekly.series[0].points.every((point) => point.batchId !== foreign.id));
});

test('retry reuse and carried older reports never claim fresh progress or fixes', async () => {
  const project = await seed();
  const old = await report(project, urls[0], times[0], 30);
  const fresh = await report(project, urls[0], times[1], 80, (data) =>
    data.checks.forEach((c) => {
      c.status = 'pass';
    }),
  );
  const first = batch(project, times[0], [old]);
  const reused = batch(project, times[1], [old], { retryOf: first.id });
  const result = await compareBatchRuns(first, reused, [first, reused]);
  assert.equal(result.websites[0].status, 'unverified');
  assert.equal(result.websites[0].counts.persistent, 0);
  assert.equal(result.websites[0].counts.unverified, 8);
  assert.equal(result.totals.improved, 0);
  assert.equal(
    result.trends.weekly.series[0].points.filter((p) => p.reportId === old.id).length,
    1,
  );
  assert.equal(result.trends.weekly.series[0].points.at(-1).score, null);
  const newer = batch(project, times[1], [fresh]);
  const carried = batch(project, '2026-10-21T00:00:00.000Z', [old], { retryOf: first.id });
  const reverse = await compareBatchRuns(newer, carried);
  assert.equal(reverse.websites[0].scoreDelta, null);
  assert.equal(reverse.totals.resolvedIssues, 0);
  assert.match(reverse.websites[0].scoreReason, /mốc đo mới hơn/);
});

test('batch comparisons preserve report engine safeguards for source, device, scope and rules', async () => {
  const project = await seed();
  const old = await report(project, urls[0], times[0]);
  const variants = [
    (data) => {
      data.device = 'desktop';
    },
    (data) => {
      data.pages[0].url = urls[1];
    },
    (data) => {
      data.checks[0].weight = 10;
    },
    (data) => {
      data.lighthouse = {
        available: true,
        version: '12.8.2',
        method: 'test',
        device: 'mobile',
        settings: {},
        audits: [],
      };
    },
  ];
  for (const adjust of variants) {
    const next = await report(project, urls[0], times[1], 90, adjust);
    const result = await compareBatchRuns(
      batch(project, times[0], [old]),
      batch(project, times[1], [next]),
    );
    const expected = compareReports(old, next);
    assert.equal(result.websites[0].status, 'unverified');
    assert.equal(result.websites[0].scoreDelta, null);
    assert.deepEqual(result.websites[0].scoreChanges, expected.scoreChanges);
    assert.deepEqual(result.websites[0].counts, expected.counts);
  }
});

test('weekly trends use Bangkok Mondays, preserve gaps, select latest measurements and deduplicate retries', async () => {
  const project = await seed();
  const sunday = await report(project, urls[0], '2026-08-30T16:59:59.000Z', 50);
  const monday = await report(project, urls[0], '2026-08-30T17:00:00.000Z', 60);
  const october = await report(project, urls[0], '2026-10-05T01:00:00.000Z', 80);
  const latest = await report(project, urls[0], '2026-10-06T01:00:00.000Z', 81);
  const first = batch(project, sunday.createdAt, [sunday]);
  const second = batch(project, monday.createdAt, [monday]);
  const retry = batch(project, '2026-09-10T01:00:00.000Z', [monday], { retryOf: second.id });
  const third = batch(project, october.createdAt, [october]);
  const last = batch(project, latest.createdAt, [latest]);
  const result = await compareBatchRuns(first, last, [last, third, retry, second, first]);
  const trend = result.trends.weekly;
  assert.equal(trend.periods.length, 12);
  assert.equal(trend.periods.at(-1).key, '2026-10-05');
  const points = Object.fromEntries(trend.series[0].points.map((point) => [point.period, point]));
  assert.equal(points['2026-08-24'].score, 50);
  assert.equal(points['2026-08-31'].score, 60);
  assert.equal(points['2026-08-31'].comparable, true);
  assert.equal(points['2026-09-07'].score, null);
  assert.equal(points['2026-09-07'].batchId, null);
  assert.equal(points['2026-10-05'].score, 81);
  assert.equal(points['2026-10-05'].comparable, false);
});

test('monthly trends use local calendar boundaries and break lines for changed sources', async () => {
  const project = await seed();
  const old = await report(project, urls[0], '2026-09-30T16:59:59.000Z', 50);
  const next = await report(project, urls[0], '2026-09-30T17:00:00.000Z', 70, (data) => {
    data.lighthouse = {
      available: true,
      version: '12.8.2',
      method: 'test',
      device: 'mobile',
      settings: {},
      audits: [],
    };
  });
  const result = await compareBatchRuns(
    batch(project, old.createdAt, [old]),
    batch(project, next.createdAt, [next]),
  );
  const points = result.trends.monthly.series[0].points;
  assert.equal(points.at(-2).period, '2026-09');
  assert.equal(points.at(-2).score, 50);
  assert.equal(points.at(-1).period, '2026-10');
  assert.equal(points.at(-1).score, 70);
  assert.equal(points.at(-1).comparable, false);
  assert.match(points.at(-1).reason, /nguồn/);
});

test('exports include all findings and calendar data with escaped HTML and safe CSV cells', async () => {
  const project = await seed();
  const old = await report(project, urls[0], times[0], 50);
  const next = await report(project, urls[0], times[1], 60, (data) => {
    data.checks[7].title = '=HYPERLINK("unsafe") <img src=x onerror=alert(1)>';
    data.checks[7].evidence = ['<script>unsafe()</script>', 'Dòng 1\nDòng 2'];
  });
  const result = await compareBatchRuns(
    batch(project, times[0], [old]),
    batch(project, times[1], [next]),
  );
  const brand = {
    agencyName: '=Mộc <Studio>',
    footer: '<script>bad()</script>',
    tagline: 'Báo cáo so sánh',
    accentColor: '#28664f',
  };
  const html = batchComparisonHtml(result, brand, { interval: 'monthly', url: urls[0] });
  assert.equal((html.match(/class="finding"/g) || []).length, 8);
  assert.ok(html.includes('Xu hướng điểm theo tháng'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  const csv = csvRows(batchComparisonCsv(result, brand));
  assert.ok(csv.every((row) => row.length === 22));
  assert.equal(csv.filter((row) => row[0] === 'Thay đổi').length, 8);
  assert.equal(csv.filter((row) => row[0] === 'Xu hướng').length, 24);
  assert.equal(csv[1][15], "'=Mộc <Studio>");
  assert.ok(csv.some((row) => row[8].startsWith("'=HYPERLINK")));
  assert.ok(csv.some((row) => row[16] === '2026-10' && row[17] === 'Tháng'));
});
