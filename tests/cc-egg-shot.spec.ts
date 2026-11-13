/** Screenshot next to a wonder block (shows the ? cube, its label and the on-screen action button). */
import { test } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 720 } });
test('egg shot', async ({ page }) => {
  await page.goto(`${BASE}/play.html?lang=en&fresh=1`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox);
  await page.evaluate(() => (window as unknown as { __CCvox: { teleport: (x: number, z: number) => void } }).__CCvox.teleport(28.6, 22.2));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/cc-14-wonder-block.png' });
});
