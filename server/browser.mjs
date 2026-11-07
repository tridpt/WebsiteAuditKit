import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { AuditError, throwIfAborted } from './network.mjs';

export async function launchBrowser() {
  const options = {
    headless: true,
    args: [
      '--disable-background-networking',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  };
  if (process.env.BROWSER_EXECUTABLE)
    return chromium.launch({ ...options, executablePath: process.env.BROWSER_EXECUTABLE });
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      return await chromium.launch({ ...options, ...(channel ? { channel } : {}) });
    } catch {
      /* Try the next installed browser. */
    }
  }
  throw new AuditError(
    'Không tìm thấy trình duyệt. Cài Microsoft Edge/Chrome hoặc chạy npx playwright install chromium.',
    'BROWSER_UNAVAILABLE',
  );
}

export async function inspectBrowser({ url, network, device, dir, signal, onProgress }) {
  const browser = await launchBrowser();
  const abort = () => {
    browser.close().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  const result = {
    available: true,
    mobile: null,
    desktop: null,
    performance: null,
    links: [],
    blockedResources: 0,
    failedResources: 0,
    resourceCount: 0,
    totalBytes: 0,
    warning: null,
  };
  try {
    const makeContext = async (selectedDevice) => {
      const context = await browser.newContext({
        viewport: {
          width: selectedDevice === 'mobile' ? 390 : 1440,
          height: selectedDevice === 'mobile' ? 844 : 900,
        },
        isMobile: selectedDevice === 'mobile',
        hasTouch: selectedDevice === 'mobile',
        serviceWorkers: 'block',
        userAgent:
          selectedDevice === 'mobile'
            ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
            : undefined,
        acceptDownloads: false,
        javaScriptEnabled: true,
        locale: 'vi-VN',
      });
      await context.routeWebSocket('**/*', (socket) => socket.close());
      await context.route('**/*', async (route) => {
        const request = route.request();
        if (signal?.aborted) return route.abort().catch(() => {});
        if (!['GET', 'HEAD'].includes(request.method()) || result.resourceCount >= 140) {
          result.blockedResources++;
          return route.abort().catch(() => {});
        }
        result.resourceCount++;
        try {
          const response = await network.fetch(request.url(), {
            method: request.method(),
            timeout: 8000,
            maxBytes: 4 * 1024 * 1024,
          });
          result.totalBytes += response.bytes;
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
          await route.fulfill({ status: response.status, headers, body: response.body });
        } catch (error) {
          if (error.code === 'BLOCKED_URL') result.blockedResources++;
          else result.failedResources++;
          await route.abort().catch(() => {});
        }
      });
      await context.addInitScript(() => {
        window.__auditMetrics = { lcp: null, cls: 0 };
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) window.__auditMetrics.lcp = e.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {}
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries())
              if (!e.hadRecentInput) window.__auditMetrics.cls += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
      });
      return context;
    };
    const context = await makeContext(device);
    const page = await context.newPage();
    const navigation = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!navigation || navigation.status() >= 400)
      throw new AuditError('Trình duyệt không tải được trang đích.', 'RENDER_FAILED');
    await page.waitForTimeout(1800);
    throwIfAborted(signal);
    result.performance = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        fcp: fcp ? Math.round(fcp.startTime) : null,
        lcp: window.__auditMetrics.lcp === null ? null : Math.round(window.__auditMetrics.lcp),
        cls: Math.round(window.__auditMetrics.cls * 1000) / 1000,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      };
    });
    result.performance.device = device;
    result.links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].slice(0, 250).map((el) => ({
        url: el.href,
        text: (el.innerText || '').trim().slice(0, 120),
        source: location.href,
      })),
    );
    const mobilePage = device === 'mobile' ? page : await (await makeContext('mobile')).newPage();
    if (device !== 'mobile') {
      await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await mobilePage.waitForTimeout(1000);
    }
    onProgress?.(55, 'Kiểm tra bố cục trên màn hình mobile…');
    result.mobile = await mobilePage.evaluate((viewportWidth) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const label = (el) =>
        (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 100);
      const elements = [...document.body.querySelectorAll('*')].slice(0, 5000);
      const smallText = elements.filter(
        (el) =>
          visible(el) &&
          [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) &&
          parseFloat(getComputedStyle(el).fontSize) < 12,
      );
      const targets = [
        ...document.querySelectorAll(
          'button, a[href], input:not([type="hidden"]), select, [role="button"]',
        ),
      ].filter(visible);
      const smallTargets = targets.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      });
      const overflowing = elements
        .filter((el) => {
          if (!visible(el) || getComputedStyle(el).position === 'fixed') return false;
          const r = el.getBoundingClientRect();
          return r.right > viewportWidth + 4 && r.left < viewportWidth && r.width > 0;
        })
        .slice(0, 8)
        .map(label);
      return {
        width: viewportWidth,
        layoutViewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
        overflow: document.documentElement.scrollWidth > viewportWidth + 4,
        overflowing,
        smallTextCount: smallText.length,
        smallTextExamples: smallText.slice(0, 5).map(label),
        smallTargetCount: smallTargets.length,
        targetCount: targets.length,
        smallTargetExamples: smallTargets.slice(0, 5).map(label),
      };
    }, 390);
    await mobilePage
      .screenshot({
        path: `${dir}/mobile.png`,
        fullPage: false,
        timeout: 8000,
        animations: 'disabled',
      })
      .catch(() => {});
    const desktopPage =
      device === 'desktop' ? page : await (await makeContext('desktop')).newPage();
    if (device === 'mobile') {
      await desktopPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await desktopPage.waitForTimeout(700);
    }
    result.desktop = { width: 1440, height: 900 };
    await desktopPage
      .screenshot({
        path: `${dir}/desktop.png`,
        fullPage: false,
        timeout: 8000,
        animations: 'disabled',
      })
      .catch(() => {});
    for (const name of ['mobile', 'desktop']) {
      try {
        await fs.access(`${dir}/${name}.png`);
        result[name].screenshot = `${name}.png`;
      } catch {}
    }
    if (result.blockedResources || result.failedResources)
      result.warning = `${result.blockedResources} yêu cầu bị giới hạn và ${result.failedResources} tài nguyên không tải được. API POST, WebSocket, tài nguyên nội bộ và nội dung cần đăng nhập không được tải; ảnh chụp có thể khác website đầy đủ.`;
    return result;
  } catch (error) {
    throwIfAborted(signal);
    if (result.mobile || result.performance)
      return { ...result, warning: `Kiểm tra trình duyệt chưa hoàn tất: ${error.message}` };
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser.close().catch(() => {});
  }
}

export async function createPdf(html, { agencyName = 'Website Audit Kit' } = {}) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 10000 });
    const escapedAgency = String(agencyName).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:9px;width:100%;display:flex;align-items:center;justify-content:center;gap:5px;color:#555;padding:0 20px"><span style="max-width:75%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapedAgency}</span><span style="white-space:nowrap;flex-shrink:0">· <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
}
