/** HUD must not overlap at 3 sizes; language switch re-renders the HUD live. */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ headless: true, launchOptions: { args: ['--mute-audio'] }, channel: process.env.CC_CHANNEL || undefined });
for (const [w, h] of [[1440, 900], [800, 600], [390, 844]]) {
  test(`no HUD overlaps at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/play.html?demo=1&lang=en`);
    await expect(page.getByTestId('quest')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);
    const boxes = await page.evaluate(() => {
      const sel = ['#hud .hudtop', '[data-testid=quest]', '[data-testid=xp]', '[data-testid=wonders]', '#ladder', '#topright', '#toast.show', '#hint'];
      return sel.flatMap((s) => [...document.querySelectorAll(s)].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { s, x: r.left, y: r.top, r: r.right, b: r.bottom }; }));
    });
    const hit: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) hit.push(`${a.s} x ${b.s}`);
    }
    await page.screenshot({ path: `screenshots/cc-hud-${w}x${h}.png` });
    expect(hit).toEqual([]);
    await expect(page.getByTestId('exit')).toBeInViewport();
  });
}
test('language switch is live', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto(`${BASE}/play.html?demo=1&lang=en`);
  await expect(page.getByTestId('quest')).toBeVisible({ timeout: 20_000 });
  const before = await page.getByTestId('journal-btn').textContent();
  await page.getByTestId('settings-btn').click();
  await page.getByTestId('lang-pills').locator('[data-v=es]').click();
  await page.keyboard.press('Escape');
  const after = await page.getByTestId('journal-btn').textContent();
  await page.screenshot({ path: 'screenshots/cc-lang-es.png' });
  expect(after).not.toBe(before);
});
