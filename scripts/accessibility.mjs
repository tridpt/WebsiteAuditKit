import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { launchBrowser } from '../server/browser.mjs';
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4318', { waitUntil: 'networkidle' });
  async function check(label) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    console.log(
      JSON.stringify(
        {
          label,
          violations: result.violations.map((v) => ({
            id: v.id,
            count: v.nodes.length,
            nodes: v.nodes
              .slice(0, 10)
              .map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        },
        null,
        2,
      ),
    );
    assert.equal(result.violations.length, 0, `Accessibility violations: ${label}`);
  }
  await check('Desktop overview');
  for (const tab of ['Tốc độ', 'Giao diện mobile', 'Liên kết', 'SEO']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await check(tab);
  }
  await page
    .getByRole('button', { name: /Việc cần sửa/ })
    .first()
    .click();
  await check('Tasks');
  await page.getByLabel('Tìm việc cần sửa').fill('ảnh');
  await check('Filtered tasks');
  await page.getByRole('button', { name: 'Lịch sử kiểm tra', exact: true }).click();
  await check('History');
  await page.getByRole('button', { name: 'Hướng dẫn sử dụng' }).click();
  await check('Help dialog');
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('button', { name: 'Tổng quan', exact: true }).click();
  await check('Mobile overview');
} finally {
  await browser.close();
}
