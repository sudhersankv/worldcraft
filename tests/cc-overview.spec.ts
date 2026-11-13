/** Overview screenshots of the beach (art review). */
import { test } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 720 } });
test('overview', async ({ page }) => {
  await page.goto(`${BASE}/play.html?lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshots/cc-6-play.png' });
  for (const [i, [yaw, pitch, dist]] of [[1.9, 0.5, 12], [3.4, 0.45, 12], [0.4, 0.6, 12]].entries()) {
    await page.evaluate(([y, p, d]) => { const v = (window as unknown as { __CCvox: Record<string, number> }).__CCvox; v.yaw = y; v.pitch = p; v.dist = d; }, [yaw, pitch, dist]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/cc-7-view${i}.png` });
  }
});
