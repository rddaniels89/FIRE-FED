import { test, expect } from '@playwright/test';

test.describe('Smoke: core flows', () => {
  async function tryContinueAsGuest(page) {
    await page.goto('/');
    const guestButton = page.getByRole('button', { name: 'Continue as Guest' });
    try {
      await guestButton.waitFor({ state: 'visible', timeout: 5000 });
      await guestButton.click();
      return true;
    } catch {
      // Supabase is configured (or guest mode hidden); don't hard-fail tests that depend on guest mode.
      await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();
      return false;
    }
  }

  test('TSP inputs accept multi-digit typing and chart renders', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping calculator UI checks.');
    await page.goto('/tsp-forecast');

    // Use role+name to avoid matching stepper buttons with similar aria-labels.
    await page.getByRole('textbox', { name: 'Starting TSP Balance' }).fill('50000');
    await page.getByRole('textbox', { name: 'Current Age' }).fill('35');
    await page.getByRole('textbox', { name: 'Target Retirement Age' }).fill('62');
    await page.getByRole('textbox', { name: 'Annual Salary' }).fill('80000');
    await page.getByRole('textbox', { name: 'Monthly Contribution %' }).fill('10');

    await expect(page.getByText('Current age must be between')).toHaveCount(0);

    // Chart.js renders canvas; this ensures the chart section mounted.
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('FERS monthly pension is whole dollars and break-even age is whole number', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping calculator UI checks.');
    await page.goto('/fers-pension');

    // Basic pension calculation card exists
    await expect(page.getByRole('heading', { name: 'Pension Calculation' })).toBeVisible();

    // Monthly pension should not show decimals
    const monthlyCard = page.locator('div.text-center', { has: page.getByText('Monthly Pension') }).first();
    const monthlyValue = await monthlyCard.locator('div').first().innerText();
    expect(monthlyValue).toMatch(/^\$\d[\d,]*$/);

    // Enable comparison and ensure break-even displays without decimals if shown
    await page.getByLabel('Compare "Stay Federal" vs "Leave After 20 Years"').check();
    const breakEvenText = page.getByText('Break-even analysis:');
    if (await breakEvenText.count()) {
      const content = await breakEvenText.innerText();
      expect(content).not.toMatch(/\d+\.\d+/);
    }
  });

  test('Unauthed users see the auth screen', async ({ page }) => {
    await page.goto('/');
    // App routes unauthenticated sessions to Auth.
    await expect(page.getByRole('heading', { name: /Sign in|Log in|Authentication/i })).toBeVisible();
  });
});


