import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import puppeteer from 'puppeteer-core';
import lighthouse, { desktopConfig } from 'lighthouse';
import { chromium } from 'playwright';
import { SafeNetwork, AuditError, throwIfAborted } from './network.mjs';

const metricIds = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbt: 'total-blocking-time',
  speedIndex: 'speed-index',
};
export const lighthouseMethod = 'lighthouse-safe-bridge-v1';

export function summarizeLighthouse(lhr, counters = {}) {
  const settings = lhr.configSettings;
  const refs = new Set(
    lhr.categories.performance.auditRefs
      .filter((ref) => ref.group !== 'hidden')
      .map((ref) => ref.id),
  );
  const audits = Object.values(lhr.audits)
    .filter((a) => refs.has(a.id))
    .map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      score: a.score,
      scoreDisplayMode: a.scoreDisplayMode,
      displayValue: a.displayValue || '',
      numericValue: a.numericValue ?? null,
      error: a.errorMessage || null,
      savingsMs:
        a.details?.overallSavingsMs ?? Math.max(0, ...Object.values(a.metricSavings || {})),
      savingsBytes: a.details?.overallSavingsBytes ?? 0,
      opportunity: a.details?.type === 'opportunity' || Boolean(a.metricSavings),
      resources: (Array.isArray(a.details?.items) ? a.details.items : [])
        .slice(0, 8)
        .map((item) => ({
          url: typeof item.url === 'string' ? item.url : null,
          wastedMs: item.wastedMs ?? null,
          wastedBytes: item.wastedBytes ?? null,
        }))
        .filter((item) => item.url),
    }));
  return {
    available: true,
    source: 'Lighthouse',
    version: lhr.lighthouseVersion,
    method: lighthouseMethod,
    fetchedAt: lhr.fetchTime,
    requestedUrl: lhr.requestedUrl,
    finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl,
    score: Math.round(lhr.categories.performance.score * 100),
    device: settings.formFactor,
    userAgent: lhr.environment?.hostUserAgent || '',
    settings: {
      throttlingMethod: settings.throttlingMethod,
      throttling: settings.throttling,
      skipAudits: settings.skipAudits,
      screenEmulation: settings.screenEmulation,
      emulatedUserAgent: settings.emulatedUserAgent,
    },
    metrics: Object.fromEntries(
      Object.entries(metricIds).map(([key, id]) => [key, lhr.audits[id]?.numericValue ?? null]),
    ),
    audits,
    opportunities: audits
      .filter(
        (a) =>
          a.opportunity &&
          a.score !== null &&
          a.score < 1 &&
          (a.savingsMs > 0 || a.savingsBytes > 0),
      )
      .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes),
    warnings: lhr.runWarnings || [],
    ...counters,
  };
}

async function executablePath() {
  const candidates = process.env.BROWSER_EXECUTABLE
    ? [process.env.BROWSER_EXECUTABLE]
    : [
        path.join(
          process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)',
          'Microsoft/Edge/Application/msedge.exe',
        ),
        path.join(
          process.env.PROGRAMFILES || 'C:/Program Files',
          'Google/Chrome/Application/chrome.exe',
        ),
        path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        chromium.executablePath(),
      ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* Try the next browser. */
    }
  }
  throw new AuditError('Cần Edge, Chrome hoặc Chromium để chạy Lighthouse.', 'BROWSER_UNAVAILABLE');
}

export async function inspectLighthouse({ url, device, signal, allowLoopback, timeout = 75000 }) {
  throwIfAborted(signal);
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(`Lighthouse vượt quá thời gian đo ${Math.round(timeout / 1000)} giây.`),
      ),
    timeout,
  );
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const network = new SafeNetwork({
    signal: combinedSignal,
    allowLoopback,
    maxRequests: 160,
    maxBytes: 30 * 1024 * 1024,
  });
  // Fail closed: traffic not intercepted by the page (workers, popups, sockets) cannot
  // leave Chromium. Only the Node SafeNetwork bridge may reach the audited website.
  const denyProxy = http.createServer((_req, res) => {
    res.writeHead(403);
    res.end();
  });
  denyProxy.on('connect', (_req, socket) => socket.destroy());
  denyProxy.on('upgrade', (_req, socket) => socket.destroy());
  let browser;
  let blockedResources = 0;
  let failedResources = 0;
  const abort = () => {
    void browser?.close().catch(() => {});
  };
  try {
    denyProxy.listen(0, '127.0.0.1');
    await once(denyProxy, 'listening');
    browser = await puppeteer.launch({
      executablePath: await executablePath(),
      headless: true,
      pipe: true,
      args: [
        '--disable-background-networking',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        `--proxy-server=http://127.0.0.1:${denyProxy.address().port}`,
        '--proxy-bypass-list=<-loopback>',
      ],
    });
    combinedSignal.addEventListener('abort', abort, { once: true });
    throwIfAborted(combinedSignal);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(() => {
      const blocked = () => {
        throw new DOMException('Unavailable in this audit session', 'SecurityError');
      };
      // The denying proxy is the network boundary; these stubs also keep blocked
      // workers/sockets from hanging Lighthouse's page instrumentation.
      window.Worker = blocked;
      window.SharedWorker = blocked;
      window.WebSocket = blocked;
      window.open = () => null;
      if (navigator.serviceWorker)
        navigator.serviceWorker.register = () =>
          Promise.reject(new DOMException('Service workers are disabled', 'SecurityError'));
    });
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      if (request.isInterceptResolutionHandled()) return;
      try {
        if (
          combinedSignal.aborted ||
          !['GET', 'HEAD'].includes(request.method()) ||
          !/^https?:/i.test(request.url())
        ) {
          blockedResources++;
          return await request.abort('blockedbyclient');
        }
        const response = await network.fetch(request.url(), {
          method: request.method(),
          timeout: 8000,
          maxBytes: 4 * 1024 * 1024,
          userAgent: request.headers()['user-agent'],
          accept: request.headers().accept || '*/*',
        });
        const headers = Object.fromEntries(
          Object.entries(response.headers)
            .filter(
              ([name]) =>
                ![
                  'set-cookie',
                  'content-length',
                  'transfer-encoding',
                  'connection',
                  'content-encoding',
                  'location',
                ].includes(name),
            )
            .map(([name, value]) => [
              name,
              Array.isArray(value) ? value.join(', ') : String(value),
            ]),
        );
        if (!request.isInterceptResolutionHandled())
          await request.respond({ status: response.status, headers, body: response.body });
      } catch (error) {
        if (error.code === 'BLOCKED_URL') blockedResources++;
        else failedResources++;
        if (!request.isInterceptResolutionHandled()) await request.abort('failed').catch(() => {});
      }
    });
    const result = await lighthouse(
      url,
      {
        logLevel: 'error',
        onlyCategories: ['performance'],
        locale: 'vi',
        enableErrorReporting: false,
        maxWaitForFcp: 20000,
        maxWaitForLoad: 30000,
        skipAudits: ['uses-text-compression'],
      },
      device === 'desktop' ? desktopConfig : undefined,
      page,
    );
    throwIfAborted(combinedSignal);
    if (result.lhr.runtimeError || result.lhr.categories.performance.score == null)
      throw new Error(result.lhr.runtimeError?.message || 'Lighthouse không có điểm hiệu năng.');
    return summarizeLighthouse(result.lhr, {
      blockedResources,
      failedResources,
      requests: network.requests,
      bytes: network.bytes,
    });
  } catch (error) {
    throwIfAborted(signal);
    return {
      available: false,
      source: 'Lighthouse',
      method: lighthouseMethod,
      error: controller.signal.aborted ? controller.signal.reason.message : error.message,
      requests: network.requests,
      bytes: network.bytes,
      blockedResources,
      failedResources,
    };
  } finally {
    clearTimeout(timer);
    combinedSignal.removeEventListener('abort', abort);
    await browser?.close().catch(() => {});
    await network.close();
    denyProxy.closeAllConnections();
    await new Promise((resolve) => denyProxy.close(resolve));
  }
}
