/** Phone layout: every overlay has a visible close button inside the viewport; Esc closes; HUD exit exists. */
import { test, expect, devices } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ ...devices['Pixel 7'], headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined });
test('mobile overlays closable', async ({ page }) => {
  await page.goto(`${BASE}/play.html?demo=1&lang=en`);
  await expect(page.getByTestId('exit')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('quest')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => (window as unknown as { __CCgo: (w: string) => void }).__CCgo('board'));
  const close = page.getByTestId('close').first();
  await expect(close).toBeInViewport();
  await page.screenshot({ path: 'screenshots/cc-10-mobile-recall.png' });
  await close.click();
  await expect(page.getByTestId('recall-before')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __CCgo: (w: string) => void }).__CCgo('board'));
  await page.getByTestId('recall-choice-0').click();
  await expect(page.getByTestId('wonder-board')).toBeVisible();
  await expect(page.getByTestId('close').first()).toBeInViewport();
  await page.screenshot({ path: 'screenshots/cc-11-mobile-board.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wonder-board')).toHaveCount(0);
});
