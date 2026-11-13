/** Screenshots of each biome's NPC area (art review). */
import { test } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 720 } });
test('biomes', async ({ page }) => {
  await page.goto(`${BASE}/play.html?lang=en`);
  await page.waitForFunction(() => !!(window as unknown as { __CCvox?: unknown }).__CCvox);
  for (const [name, x, z, tx, tz] of [['volcano', 60.5, 38.5, 76, 28], ['ice', 68.5, 70.5, 82, 82], ['jungle', 40.5, 72.5, 26, 88]] as const) {
    await page.evaluate(([x, z, tx, tz]) => { const v = (window as unknown as { __CCvox: { teleport: (x: number, z: number) => void; yaw: number; pitch: number; dist: number } }).__CCvox; v.teleport(x, z); v.yaw = Math.atan2(x - tx, z - tz); v.pitch = 0.45; v.dist = 11; }, [x, z, tx, tz]);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `screenshots/cc-9-${name}.png` });
  }
});
