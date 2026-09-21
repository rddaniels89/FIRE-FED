import { test, expect } from '@playwright/test';

/**
 * Onboarding asks who the person is before what they want. A military member
 * with no federal job gets military goals and never a FERS question; a
 * veteran in federal service keeps the federal goals with the military
 * connection recorded.
 */
test.describe('Onboarding: who the plan is for', () => {
  async function tryContinueAsGuest(page) {
    await page.goto('/signin');
    const guestButton = page.getByRole('button', { name: 'Continue as Guest' });
    try {
      await guestButton.waitFor({ state: 'visible', timeout: 5000 });
      await guestButton.click();
      return true;
    } catch {
      return false;
    }
  }

  test('a military member with no federal job goes straight to the military calculator', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping.');
    await page.goto('/');
    const onboarding = page.getByTestId('onboarding');
    await expect(onboarding.getByRole('heading', { name: 'What do you want to explore?' })).toBeVisible();
    // Federal goals by default.
    await expect(onboarding.getByRole('button', { name: /When can I leave federal service\?/ })).toBeVisible();
    await onboarding.getByTestId('onboarding-kind').getByLabel('Military member or veteran, no federal job').check();
    await expect(onboarding.getByRole('button', { name: /When can I leave federal service\?/ })).toHaveCount(0);
    await onboarding.getByRole('button', { name: /Estimate my military retired pay/ }).click();
    await expect(page).toHaveURL(/\/calculators\/military-retirement$/);
    await expect(page.getByRole('heading', { name: 'Military Retirement Calculator' })).toBeVisible();
    // The plan inputs no longer ask FERS questions.
    await page.goto('/plan/inputs');
    await expect(page.getByRole('button', { name: /^Service and pay/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Military retired pay, VA, and survivor income/ })).toBeVisible();
    // The signed-in nav has a Military entry (behind the menu button on phones).
    const militaryLink = page.getByRole('link', { name: 'Military', exact: true }).first();
    if (!(await militaryLink.isVisible())) await page.locator('button[aria-controls="mobile-menu"]').click();
    await expect(militaryLink).toBeVisible();
  });

  test('a veteran in federal service keeps the federal goals and lands with the military connection recorded', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping.');
    await page.goto('/');
    const onboarding = page.getByTestId('onboarding');
    await onboarding.getByTestId('onboarding-kind').getByLabel('Federal employee with military service').check();
    await onboarding.getByRole('button', { name: /Estimate my FERS pension/ }).click();
    await onboarding.getByLabel('Current age').fill('45');
    await onboarding.getByLabel('Years of federal service').fill('15');
    await onboarding.getByLabel('High-3 average salary').fill('110000');
    await onboarding.getByRole('button', { name: 'Next' }).click();
    await onboarding.getByRole('button', { name: 'Skip and finish' }).click();
    await page.goto('/plan/inputs');
    const header = page.getByRole('button', { name: /^Military service and benefits/ });
    await expect(header).toBeVisible();
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    await expect(page.getByTestId('section-military').getByRole('radio', { name: 'Yes, me' })).toBeChecked();
  });
});
