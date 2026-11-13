/** Reloading with a new ?lang= continues the same play (progress restored from localStorage cc.state). */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 760 } });
test('reload keeps progress', async ({ page }) => {
  await page.goto(`${BASE}/play.html?demo=1&lang=en`);
  await expect(page.getByTestId('quest')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => (window as unknown as { __CCvox: { onInteract: (s: string) => void } }).__CCvox.onInteract('egg:crab'));
  await expect(page.getByTestId('wonders')).toContainText('1/');
  const sid = await page.evaluate(() => { const v = (window as unknown as { __CC: { xp: number } }).__CC; return v.xp; });
  await page.waitForTimeout(1800);
  await page.goto(`${BASE}/play.html?demo=1&lang=es`);
  await expect(page.getByTestId('quest')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('wonders')).toContainText('1/');
  const xp2 = await page.evaluate(() => (window as unknown as { __CC: { xp: number } }).__CC.xp);
  expect(xp2).toBe(sid);
});
