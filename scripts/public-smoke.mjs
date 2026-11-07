import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runAudit } from '../server/analyzer.mjs';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-public-'));
const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(new Error('Public smoke test timed out.')),
  150000,
);
try {
  const report = await runAudit({
    id: randomUUID(),
    url: process.argv[2] || 'https://example.com',
    device: 'mobile',
    maxPages: 1,
    dir,
    signal: controller.signal,
    allowLoopback: false,
    onProgress: (progress, message) => console.log(`${progress}% ${message}`),
  });
  assert.ok(report.pages.length);
  assert.ok(report.browser.available, report.browser.warning);
  assert.ok(report.browser.performance?.fcp !== null);
  assert.ok(report.lighthouse.available, report.lighthouse.error);
  assert.equal(report.categories.performance.score, report.lighthouse.score);
  console.log(
    JSON.stringify(
      {
        url: report.url,
        score: report.score,
        categories: report.categories,
        browser: {
          available: report.browser.available,
          metrics: report.browser.performance,
          mobile: report.browser.mobile,
        },
        scope: report.scope,
        lighthouse: {
          available: report.lighthouse.available,
          score: report.lighthouse.score,
          version: report.lighthouse.version,
          metrics: report.lighthouse.metrics,
          opportunities: report.lighthouse.opportunities,
        },
        warnings: report.warnings,
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(timeout);
  const resolved = path.resolve(dir);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('audit-public-'),
  );
  await fs.rm(resolved, { recursive: true, force: true });
}
