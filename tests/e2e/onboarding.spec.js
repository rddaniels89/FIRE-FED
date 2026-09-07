import { test, expect } from '@playwright/test';

/**
 * Goal-first onboarding (ROADMAP 56/57): pick a question, answer only the
 * numbers it needs, and land on the page that answers it.
 */
test.describe('Onboarding: goal-first stepper', () => {
  async function tryContinueAsGuest(page) {
    // "/" is the public landing page; the auth screen lives at /signin.
    await page.goto('/signin');
    const guestButton = page.getByRole('button', { name: 'Continue as Guest' });
    try {
      await guestButton.waitFor({ state: 'visible', timeout: 5000 });
      await guestButton.click();
      return true;
    } catch {
      // Guest mode is unavailable (real Supabase configured, or a dev bypass
      // signed us in already). Skip rather than fail on the wrong screen.
      return false;
    }
  }

  test('"When can I leave?" asks for six numbers and lands on /plan', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping onboarding checks.');
    await page.goto('/');

    const onboarding = page.getByTestId('onboarding');
    await expect(onboarding.getByRole('heading', { name: 'What do you want to explore?' })).toBeVisible();

    await onboarding.getByRole('button', { name: /When can I leave federal service\?/ }).click();
    await expect(onboarding.getByRole('heading', { name: 'When can I leave federal service?' })).toBeVisible();

    await onboarding.getByLabel('Current age').fill('45');
    await onboarding.getByLabel('Years of federal service').fill('15');
    await onboarding.getByLabel('Current salary').fill('110000');
    await onboarding.getByLabel('TSP balance').fill('250000');
    await onboarding.getByLabel('Monthly income goal in retirement').fill('6500');
    await onboarding.getByLabel('Separation age (a guess is fine)').fill('57');

    // Step 2 must not ask for anything the goal does not need.
    await expect(onboarding.getByLabel('High-3 average salary')).toHaveCount(0);
    await expect(onboarding.getByLabel('Social Security at full retirement age')).toHaveCount(0);

    await onboarding.getByRole('button', { name: 'Next' }).click();
    await expect(onboarding.getByRole('heading', { name: 'Two optional details' })).toBeVisible();
    await onboarding.getByLabel('Years enrolled in FEHB').fill('12');
    await onboarding.getByRole('button', { name: 'Finish', exact: true }).click();

    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByRole('heading', { name: 'When could I leave?' })).toBeVisible();

    // The inputs were written once and are visible on the inputs page, not asked again.
    await page.goto('/plan/inputs');
    await expect(page.getByRole('textbox', { name: 'Current age' })).toHaveValue('45');
    await expect(page.getByRole('textbox', { name: 'Separation age' })).toHaveValue('57');
    await page.goto('/');
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect(page.getByTestId('my-plan-card')).toContainText('Age 45');
  });
});
