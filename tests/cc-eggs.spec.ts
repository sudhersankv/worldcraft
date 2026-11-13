/** Wonder sparkles: touching one opens an "I wonder…" card, +XP, a Journal card and the HUD counter. */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined });
test('wonder sparkle', async ({ page }) => {
  await page.goto(`${BASE}/play.html?demo=1&lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox);
  await page.evaluate(() => (window as unknown as { __CCvox: { onInteract: (s: string) => void } }).__CCvox.onInteract('egg:crab'));
  await expect(page.getByTestId('egg-card')).toBeVisible();
  await expect(page.getByTestId('wonders')).toContainText('1/');
});
