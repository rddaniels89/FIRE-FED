import { test, expect } from '@playwright/test';

test.describe('Smoke: core flows', () => {
  async function tryContinueAsGuest(page) {
    // "/" is the public landing page now; the auth screen lives at /signin.
    await page.goto('/signin');
    const guestButton = page.getByRole('button', { name: 'Continue as Guest' });
    try {
      await guestButton.waitFor({ state: 'visible', timeout: 5000 });
      await guestButton.click();
      return true;
    } catch {
      // Guest mode is unavailable. That is expected when Supabase is configured
      // (auth screen shown) or when a dev bypass signed us straight in; skip the
      // guest-dependent assertions rather than failing on the wrong screen.
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

  test('Roth catch-up notice tracks the SECURE 2.0 wage threshold', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping calculator UI checks.');
    await page.goto('/tsp-forecast');

    await page.getByRole('textbox', { name: 'Current Age' }).fill('55');
    await page.getByRole('textbox', { name: 'Target Retirement Age' }).fill('62');
    await page.getByRole('textbox', { name: 'Monthly Contribution %' }).fill('30');

    const notice = page.getByText('Your catch-up contributions must be Roth.');

    await page.getByRole('textbox', { name: 'Annual Salary' }).fill('200000');
    await expect(notice).toBeVisible();

    await page.getByRole('textbox', { name: 'Annual Salary' }).fill('90000');
    await expect(notice).toHaveCount(0);
  });

  test('Prior-year wages field overrides the salary estimate', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping calculator UI checks.');
    await page.goto('/tsp-forecast');

    await page.getByRole('textbox', { name: 'Current Age' }).fill('55');
    await page.getByRole('textbox', { name: 'Target Retirement Age' }).fill('62');
    await page.getByRole('textbox', { name: 'Monthly Contribution %' }).fill('30');
    await page.getByRole('textbox', { name: 'Annual Salary' }).fill('90000');

    const notice = page.getByText('Your catch-up contributions must be Roth.');
    const wages = page.getByRole('textbox', { name: /Prior-year wages/ });

    // Salary alone is under the threshold, so no notice.
    await expect(notice).toHaveCount(0);

    // Last year's wages were above it — the rule applies despite the lower salary.
    await wages.fill('250000');
    await expect(notice).toBeVisible();
    await expect(page.getByText('Based on the prior-year wages you entered.')).toBeVisible();

    // Clearing it returns to the salary estimate.
    await wages.fill('');
    await expect(notice).toHaveCount(0);
  });

  test('Unknown URLs render a 404 instead of a blank page', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping in-app routing checks.');
    await page.goto('/this-route-does-not-exist');

    await expect(page.getByRole('heading', { name: /Page not found/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to dashboard/i })).toBeVisible();
  });

  test('Password reset route renders', async ({ page }) => {
    await page.goto('/auth/reset');
    await expect(page.getByRole('heading', { name: /Reset your password/i })).toBeVisible();
  });

  test('Unauthed users land on the marketing page, not a login form', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Know what your federal retirement is actually worth/i })
    ).toBeVisible();
    // The product is named and priced before anyone is asked to sign up.
    await expect(page.getByText(/\$9\.99\/month/)).toBeVisible();
    // Nothing behind the gate should be reachable before signing in.
    await expect(page.getByRole('link', { name: /Scenarios/ })).toHaveCount(0);
  });

  test('The auth screen defaults to sign-up and can be switched to sign-in', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: /Create your free account/i })).toBeVisible();

    await page.goto('/signin?mode=signin');
    await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();
  });

  // The whole point of the public routes: a stranger from a video can get a real
  // answer before being asked for anything.
  test('The FERS calculator works with no account', async ({ page }) => {
    await page.goto('/calculators/fers-pension');
    await expect(page.getByRole('heading', { name: 'FERS Pension Calculator' })).toBeVisible();

    await page.getByLabel('High-3 average salary').fill('100000');
    await page.getByLabel('Years of service (so far)').fill('30');
    await page.getByLabel('Current age').fill('57');
    await page.getByLabel('Planned retirement age').fill('57');

    // 100,000 x 30 years x 1.0% = $30,000.
    await expect(page.getByText('$30,000')).toBeVisible();
    await expect(page.getByRole('link', { name: /Create a free account/i }).first()).toBeVisible();
  });

  test('The SRS calculator explains ineligibility rather than showing zero', async ({ page }) => {
    await page.goto('/calculators/special-retirement-supplement');
    await expect(
      page.getByRole('heading', { name: 'Special Retirement Supplement Calculator' })
    ).toBeVisible();

    // MRA+30 qualifies: 2000 x 30 / 40 = $1,500/mo.
    await expect(page.getByText('$1,500/mo')).toBeVisible();

    // MRA+10 is a reduced annuity and does not.
    await page.getByLabel('Years of creditable civilian service').fill('10');
    await expect(page.getByRole('heading', { name: /No supplement for this scenario/i })).toBeVisible();
    await expect(page.getByText(/MRA\+10 is a reduced annuity/i)).toBeVisible();
  });

  test('Pricing is readable without an account', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('$9.99')).toBeVisible();
    await expect(page.getByText('$0')).toBeVisible();
  });
});


