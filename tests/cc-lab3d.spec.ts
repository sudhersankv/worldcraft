/** In-world lab: walk to the dock, pick up a board, throw it. Screenshot for review. */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 720 } });
test('lab3d', async ({ page }) => {
  await page.goto(`${BASE}/play.html?lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox);
  await page.evaluate(() => { const v = (window as unknown as { __CCvox: { teleport: (x: number, z: number) => void } }).__CCvox; v.teleport(18.5, 17.5); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/cc-8-lab-dock.png' });
  const prompt = page.locator('#prompt');
  await expect(prompt).toBeVisible({ timeout: 5000 });
  console.log('prompt:', await prompt.textContent());
});
