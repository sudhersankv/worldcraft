/** Talk to Rocky in Ember Peak: dialogue opens with a 3D portrait. */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 720 } });
test('npc rocky', async ({ page }) => {
  await page.goto(`${BASE}/play.html?lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox);
  await page.evaluate(() => { const v = (window as unknown as { __CCvox: { teleport: (x: number, z: number) => void; onInteract: (s: string) => void } }).__CCvox; v.teleport(61.5, 38); v.onInteract('npc:rocky'); });
  await expect(page.getByTestId('sam-panel')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshots/cc-12-rocky.png' });
});
