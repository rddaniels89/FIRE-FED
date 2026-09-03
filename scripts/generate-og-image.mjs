/**
 * Renders scripts/og-image.html to public/og-image.png at the 1200x630 size
 * link previews expect.
 *
 * Committed alongside its HTML source so the image can be regenerated when the
 * branding changes, rather than sitting in the repo as a binary nobody can edit.
 *
 *   node scripts/generate-og-image.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, 'og-image.html');
const output = resolve(here, '..', 'public', 'og-image.png');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

await page.goto(`file://${source}`);
// Google Fonts loads over the network; screenshotting before it lands would
// silently bake in the fallback face.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

await page.screenshot({ path: output, type: 'png' });
await browser.close();

console.log(`Wrote ${output}`);
