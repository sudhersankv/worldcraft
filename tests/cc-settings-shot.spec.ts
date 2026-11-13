/** Settings panel at phone size (art/readability review). */
import { test } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 375, height: 667 } });
test('settings phone', async ({ page }) => {
  await page.goto(`${BASE}/play.html?demo=1&lang=ta`);
  await page.getByTestId('settings-btn').click({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/cc-13-settings-phone.png' });
});
