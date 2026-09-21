import { test, expect } from '@playwright/test';

/**
 * Military Retirement Calculator (military roadmap pass 8): the public page
 * is reachable without an account, the legacy URL redirects to it, a regular
 * High-36 estimate produces the result cards and the formula audit, and the
 * Reserve path keeps points, qualifying years, and the retired-pay age apart.
 */
test.describe('Military Retirement Calculator (public)', () => {
  test('redirects the legacy URL and renders the entry choice with the required copy', async ({ page }) => {
    await page.goto('/military-retirement-calculator');
    await expect(page).toHaveURL(/\/calculators\/military-retirement$/);
    await expect(page.getByRole('heading', { name: 'Military Retirement Calculator' })).toBeVisible();
    await expect(page.getByText('Estimate military retired pay and see every input behind the result.')).toBeVisible();
    await expect(page.getByTestId('status-notice')).toContainText('not an official retired-pay determination');
    await expect(page.getByText(/Independent educational planning tool/)).toBeVisible();
  });

  test('a regular High-36 estimate shows the cards, the status, and the audit', async ({ page }) => {
    await page.goto('/calculators/military-retirement');
    await page.getByRole('radio', { name: /Active or regular retirement/ }).check();
    await page.getByLabel('DIEMS (date you first entered service)').fill('2006-06-01');
    await page.getByRole('button', { name: 'Use High-36' }).click();
    await page.getByLabel('Pay entry base date (PEBD)').fill('2006-06-01');
    await page.getByLabel('Retirement date').fill('2027-01-01');
    await page.getByLabel('Age at retirement').fill('38');
    await page.getByLabel('Held from').fill('2018-01-01');

    const cards = page.getByTestId('result-cards');
    await expect(cards.getByTestId('card-multiplier')).toContainText('50.00%');
    await expect(cards.getByTestId('card-gross')).toContainText(/\$\d,\d{3}/);
    await expect(page.getByText('Estimated', { exact: true })).toBeVisible();
    await expect(page.getByTestId('formula-audit')).toBeVisible();
    await page.getByRole('tab', { name: 'Pay-base table' }).click();
    await expect(page.getByTestId('paybase-table').getByRole('row')).toHaveCount(37);
  });

  test('the Reserve path computes from points and keeps the three tests separate', async ({ page }) => {
    await page.goto('/calculators/military-retirement');
    await page.getByRole('radio', { name: /Guard or Reserve retirement based on points/ }).check();
    await expect(page.getByTestId('reserve-notice')).toContainText('separate tests');
    await page.getByLabel('DIEMS (date you first entered service)').fill('1996-06-01');
    await page.getByRole('button', { name: 'Use High-36' }).click();
    await page.getByLabel('Pay entry base date (PEBD)').fill('1996-06-01');
    await page.getByLabel('Total creditable points').fill('4320');
    await page.getByLabel('Qualifying years (50+ points)').fill('22');
    await page.getByLabel('Birth month').fill('1976-05-10');
    await page.getByLabel('Transfer or discharge date').fill('2026-06-01');
    await page.getByLabel('Grade', { exact: true }).selectOption('E8');
    await page.getByLabel('Held from').fill('2018-01-01');

    const cards = page.getByTestId('result-cards');
    await expect(cards.getByTestId('card-service')).toContainText('4,320 points = 12.0000 years');
    await expect(cards.getByTestId('card-start')).toContainText('2036-05-01');
    await expect(cards.getByTestId('card-multiplier')).toContainText('30.00%');
    // Nothing the visitor typed is in the URL (spec §16, §20.19).
    await expect(page).toHaveURL(/\/calculators\/military-retirement$/);
    expect(new URL(page.url()).search).toBe('');
  });

  test('the medical path calculates only from the official disposition and shows both methods', async ({ page }) => {
    await page.goto('/calculators/military-retirement');
    await page.getByRole('radio', { name: /Official medical retirement/ }).check();
    await expect(page.getByRole('heading', { name: 'What official disposition did your service provide?' })).toBeVisible();
    await expect(page.getByTestId('no-figure')).toBeVisible();
    await page.getByLabel('Official disposition').selectOption('pdrl');
    await page.getByLabel('DoD disability percentage').fill('60');
    await page.getByLabel('DIEMS (date you first entered service)').fill('2010-06-01');
    await page.getByRole('button', { name: 'Use High-36' }).click();
    await page.getByLabel('Pay entry base date (PEBD)').fill('2010-06-01');
    await page.getByLabel('Years', { exact: true }).fill('14');
    await page.getByLabel('Retirement date').fill('2027-01-01');
    await page.getByLabel('Held from').fill('2018-01-01');
    await expect(page.getByTestId('card-multiplier')).toContainText('60.00%');
    await expect(page.getByTestId('formula-audit')).toContainText('Greater of the two');
    await expect(page.getByText(/does not evaluate medical fitness or disability/)).toBeVisible();
  });
});
