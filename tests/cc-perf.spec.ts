/** Logs average FPS with a 4x CPU throttle (Chromium CDP). Not a gate; prints the number. */
import { test } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 720 } });
test('fps under 4x CPU throttle', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CC_THROTTLE ?? 4) });
  await page.goto(`${BASE}/play.html?lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox, null, { timeout: 30_000 });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
  await page.waitForTimeout(7000);
  const r = await page.evaluate(() => { const v = (window as unknown as { __CCvox: { fps: number; level: string } }).__CCvox; return { fps: v.fps, level: v.level }; });
  console.log('FPS(4x throttle):', r.fps.toFixed(1), 'quality:', r.level);
});
