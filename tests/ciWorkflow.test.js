/**
 * The e2e job runs inside Playwright's own container image, which ships the
 * browsers and their system libraries preinstalled. That only works if the
 * image tag matches the @playwright/test version the tests are written
 * against: a mismatch either fails at startup with a version error, or quietly
 * runs the suite against browsers it was not built for.
 *
 * Nothing else links the two, so this test does.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The tests run under jsdom, where import.meta.url is not a file URL, so read
// from the project root instead.
const root = process.cwd();
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** The exact version, with any ^ or ~ range prefix stripped. */
function installedPlaywrightVersion() {
  const spec = pkg.devDependencies?.['@playwright/test'] ?? pkg.dependencies?.['@playwright/test'];
  return String(spec).replace(/^[^\d]*/, '');
}

describe('the CI workflow', () => {
  it('pins the Playwright container to the installed Playwright version', () => {
    const image = workflow.match(/image:\s*mcr\.microsoft\.com\/playwright:v([\d.]+)-/);
    expect(image, 'no Playwright container image found in .github/workflows/ci.yml').not.toBeNull();
    expect(image[1]).toBe(installedPlaywrightVersion());
  });

  it('does not reinstall browsers, which the image already provides', () => {
    expect(workflow).not.toMatch(/playwright install/);
  });

  it('runs the container as a non-root user so artifacts are not owned by root', () => {
    expect(workflow).toMatch(/options:\s*--user\s+\d+/);
  });
});
