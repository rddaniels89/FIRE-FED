import { test, expect } from '@playwright/test';

test.describe('Smoke: core flows', () => {
  test('TSP inputs accept multi-digit typing and chart renders', async ({ page }) => {
    await page.goto('/tsp-forecast');

    await page.getByLabel('Starting TSP Balance').fill('50000');
    await page.getByLabel('Current Age').fill('35');
    await page.getByLabel('Target Retirement Age').fill('62');
    await page.getByLabel('Annual Salary').fill('80000');
    await page.getByLabel('Monthly Contribution %').fill('10');

    await expect(page.getByText('Current age must be between')).toHaveCount(0);

    // Chart.js renders canvas; this ensures the chart section mounted.
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('FERS monthly pension is whole dollars and break-even age is whole number', async ({ page }) => {
    await page.goto('/fers-pension');

    // Basic pension calculation card exists
    await expect(page.getByRole('heading', { name: 'Pension Calculation' })).toBeVisible();

    // Monthly pension should not show decimals
    const monthlyCard = page.locator('div.text-center', { has: page.getByText('Monthly Pension') }).first();
    const monthlyValue = await monthlyCard.locator('div').first().innerText();
    expect(monthlyValue).toMatch(/^\$\d[\d,]*$/);

    // Enable comparison and ensure break-even displays without decimals if shown
    await page.getByLabel('Compare \"Stay Federal\" vs \"Leave After 20 Years\"').check();
    const breakEvenText = page.getByText('Break-even analysis:');
    if (await breakEvenText.count()) {
      const content = await breakEvenText.innerText();
      expect(content).not.toMatch(/\d+\.\d+/);
    }
  });

  test('Summary shows both desired and projected FIRE ages; PDF export triggers download', async ({ page }) => {
    await page.goto('/summary');

    await expect(page.getByText('Desired FIRE Age', { exact: true })).toBeVisible();
    await expect(page.getByText('Projected FIRE Age', { exact: true })).toBeVisible();

    // With VITE_BYPASS_PRO enabled via Playwright config, PDF export should be available.
    const pdfButton = page.getByRole('button', { name: /Download PDF/i });
    await expect(pdfButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await pdfButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});


