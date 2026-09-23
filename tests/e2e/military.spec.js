import { test, expect } from '@playwright/test';

/**
 * Military + Federal Plan (military roadmap pass 6): a veteran records a
 * service period and a VA award on the inputs page, sees the classification
 * and the results, and can delete every military entry. No medical field is
 * ever presented.
 */
test.describe('Military service and benefits', () => {
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

  async function openSection(page, titlePattern, testId) {
    const header = page.getByRole('button', { name: titlePattern });
    await expect(header).toBeVisible();
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    return page.getByTestId(testId);
  }

  async function openMilitarySection(page) {
    await page.goto('/plan/inputs');
    return openSection(page, /^Military service and benefits/, 'section-military');
  }

  test('records a service period, sees its status, adds a VA award, and reaches the results', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping.');

    const section = await openMilitarySection(page);
    await section.getByRole('radio', { name: 'Yes, me' }).check();
    await expect(section.getByRole('heading', { name: 'Service periods' })).toBeVisible();

    await section.getByRole('button', { name: 'Add service period' }).click();
    const period = section.getByTestId('service-period-0');
    await period.getByLabel('Start date').fill('1998-06-15');
    await period.getByLabel('End date').fill('2002-06-14');
    await period.getByLabel('Character of service').selectOption('confirmed_honorable_conditions');
    await period.getByLabel('Record you have').selectOption('dd214');
    await period.getByLabel('These dates are').selectOption('user_entered_official');
    await expect(period.getByText('Calculated')).toBeVisible();
    await expect(period.getByLabel('Basic pay 1999')).toBeVisible();

    // A VA stream, in its own section: amount and date only; nothing medical is asked.
    const income = await openSection(page, /^Military retired pay, VA, and survivor income/, 'section-military-income');
    await income.getByLabel('Add income').selectOption('va_disability');
    await income.getByRole('button', { name: 'Add', exact: true }).click();
    const stream = income.getByTestId('income-stream-0');
    await stream.getByLabel('Gross amount').fill('1500');
    await stream.getByLabel('Gross amount').blur();
    await expect(income.getByLabel(/diagnos|condition|claim number/i)).toHaveCount(0);
    // The TSP and coverage sections exist too, and only once the connection is recorded.
    await expect(page.getByRole('button', { name: /^Uniformed-services TSP and BRS/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Health coverage by person/ })).toBeVisible();

    await page.goto('/plan/military');
    await expect(page.getByRole('heading', { name: 'Military + Federal Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Military snapshot' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Service-credit comparison' })).toBeVisible();
    await expect(page.getByText(/not an official service-credit determination/).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /VA disability compensation/ })).toBeVisible();

    // The dashboard picks it up too.
    await page.goto('/plan');
    await expect(page.getByTestId('military-teaser')).toBeVisible();
  });

  test('the section is fully keyboard operable and every military entry can be deleted', async ({ page }) => {
    const guestOk = await tryContinueAsGuest(page);
    test.skip(!guestOk, 'Guest-mode is unavailable; skipping.');

    const section = await openMilitarySection(page);
    const yesMe = section.getByRole('radio', { name: 'Yes, me' });
    await yesMe.focus();
    await page.keyboard.press('Space');
    await expect(yesMe).toBeChecked();

    const add = section.getByRole('button', { name: 'Add service period' });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(section.getByTestId('service-period-0')).toBeVisible();

    const del = section.getByRole('button', { name: 'Delete all military data' });
    await del.focus();
    await page.keyboard.press('Enter');
    const confirm = section.getByRole('button', { name: 'Yes, delete all military data' });
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('radio', { name: 'No', exact: true })).toBeChecked();
    await expect(section.getByTestId('service-period-0')).toHaveCount(0);
  });
});
