/**
 * Curiosity Craft core loop, played end-to-end by typing (no mic needed):
 * roam (?demo=1) -> recall before -> Wonder Board (typed) -> pick question -> Sam -> 2 x "Why?" -> Try it -> Lab (stone, foam) -> recall after -> report.
 * Run: npx playwright test tests/cc-loop.spec.ts   (BASE_URL defaults to http://localhost:5174; CC_CHANNEL=msedge if Chromium is missing)
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
test.use({ channel: process.env.CC_CHANNEL || undefined, viewport: { width: 1280, height: 800 } });
test.setTimeout(150_000);

test('curiosity loop: >=3 questions and why-level >= 2', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/play.html?demo=1&world=beach&lang=en`);
  await expect(page.getByTestId('recall-before')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('recall-choice-1').click();
  await expect(page.getByTestId('wonder-board')).toBeVisible();
  await page.getByTestId('wonder-text').fill('I wonder why surfboards float on the waves');
  await page.getByTestId('wonder-submit').click();
  const guess = page.getByTestId('guess').first();
  const q0 = page.getByTestId('question-0');
  await expect(guess.or(q0)).toBeVisible({ timeout: 20_000 });
  if (await guess.isVisible()) await guess.click();
  await page.getByTestId('question-0').click();
  await expect(page.getByTestId('sam-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sam-answer')).not.toBeEmpty({ timeout: 20_000 });
  for (let i = 0; i < 2; i++) {
    await expect(page.getByTestId('why')).toBeEnabled({ timeout: 40_000 });
    await page.getByTestId('why').click();
  }
  await expect(page.getByTestId('why')).toBeEnabled({ timeout: 40_000 });
  await expect(page.getByTestId('ladder')).toHaveAttribute('data-level', '2');
  const boots = await page.evaluate(() => (window as unknown as { __CCboot: number }).__CCboot);
  const url = page.url();
  await page.getByTestId('try-it').click();
  await expect(page.getByTestId('lab')).toBeVisible();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => (window as unknown as { __CCboot: number }).__CCboot)).toBe(boots);
  await page.getByTestId('mat-stone').click();
  await page.getByTestId('drop').click();
  await expect(page.getByTestId('lab-result')).toHaveAttribute('data-outcome', 'sank', { timeout: 15_000 });
  await page.getByTestId('mat-foam').click();
  await page.getByTestId('shape-long').click();
  await page.getByTestId('drop').click();
  await expect(page.getByTestId('lab-finish')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('lab-finish').click();
  await expect(page.getByTestId('recall-after')).toBeVisible();
  await page.getByTestId('recall-choice-0').click();
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 10_000 });
  const asked = Number(await page.getByTestId('stat-questions').locator('b').textContent());
  const level = Number(await page.getByTestId('stat-level').locator('b').textContent());
  expect(asked).toBeGreaterThanOrEqual(3);
  expect(level).toBeGreaterThanOrEqual(2);
  await page.getByTestId('report').click();
  await expect(page).toHaveURL(/#report\//);
  expect(errors).toEqual([]);
});
