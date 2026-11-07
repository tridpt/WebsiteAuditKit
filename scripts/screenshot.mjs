import fs from 'node:fs/promises';
import { launchBrowser } from '../server/browser.mjs';
await fs.mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4318', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true, animations: 'disabled' });
  console.log(
    JSON.stringify({
      errors,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    }),
  );
} finally {
  await browser.close();
}
