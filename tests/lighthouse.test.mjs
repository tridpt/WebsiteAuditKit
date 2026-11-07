import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLighthouse } from '../server/lighthouse.mjs';
import { scoreChecks } from '../server/analyzer.mjs';

test('Lighthouse normalization keeps real scores, settings, metrics and resource savings', () => {
  const lhr = {
    lighthouseVersion: '12.8.2',
    requestedUrl: 'https://example.com/',
    finalDisplayedUrl: 'https://example.com/',
    fetchTime: '2026-10-23T00:00:00Z',
    configSettings: {
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      throttling: { rttMs: 150 },
      screenEmulation: {},
    },
    categories: {
      performance: {
        score: 0.73,
        auditRefs: [
          { id: 'first-contentful-paint' },
          { id: 'unused-css-rules' },
          { id: 'network-requests', group: 'hidden' },
        ],
      },
    },
    audits: {
      'first-contentful-paint': {
        id: 'first-contentful-paint',
        title: 'FCP',
        score: 0.8,
        numericValue: 1200,
      },
      'unused-css-rules': {
        id: 'unused-css-rules',
        title: 'Remove unused CSS',
        score: 0,
        displayValue: 'Potential savings of 100 KB',
        details: {
          type: 'opportunity',
          overallSavingsMs: 350,
          overallSavingsBytes: 102400,
          items: [{ url: 'https://example.com/styles.css', wastedBytes: 102400 }],
        },
      },
      'network-requests': { id: 'network-requests', score: 1, details: { items: { nested: [] } } },
    },
  };
  const result = summarizeLighthouse(lhr);
  assert.equal(result.score, 73);
  assert.equal(result.metrics.fcp, 1200);
  assert.equal(result.metrics.lcp, null);
  assert.equal(result.settings.throttlingMethod, 'simulate');
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].savingsMs, 350);
  assert.equal(result.opportunities[0].resources[0].url, 'https://example.com/styles.css');
  assert.equal(result.audits.length, 2);
  const scored = scoreChecks(
    [
      { category: 'performance', status: 'pass', weight: 5 },
      { category: 'seo', status: 'pass', weight: 5 },
    ],
    result,
  );
  assert.equal(scored.categories.performance.score, 73);
  assert.equal(scored.categories.performance.source, 'Lighthouse');
  assert.equal(scored.score, 87);
});
