## QA checklist (mobile + cross-browser)

### Automated (recommended every PR)
- **Install browsers**: `npm run test:e2e:install`
- **Run E2E** (Chromium/Firefox/WebKit + mobile emulation): `npm run test:e2e`
- **Run unit tests**: `npm run test`
- **Build**: `npm run build`

### Manual smoke (before public publishing)

#### Core navigation
- Load app and navigate: Home → TSP → FERS → Summary → Scenarios → Pro Features
- Verify dark/light toggle works and persists

#### Inputs (desktop + mobile)
- **TSP**: type multi-digit numbers in balance/age/salary/contribution fields; ensure no “stuck” input behavior
- **FERS**: type multi-digit values in service and salary fields; toggle comparison and validate fields
- Verify copy/paste works (e.g., `80,000`)

#### Charts
- TSP chart renders and updates when changing age/salary/contribution
- FERS comparison charts render when comparison is enabled
- Summary charts render without console errors

#### PDF export (Pro)
- On Summary page, click “Download PDF” and verify a PDF downloads successfully
- Verify PDF contains the main summary content (not blank)

#### Cross-browser targets
- Desktop: Chrome, Edge, Firefox, Safari (or Playwright WebKit)
- Mobile: iOS Safari, Android Chrome (or Playwright mobile profiles)

#### Regression checks
- No blank screens after login/logout
- Scenario save/duplicate respects free limits and routes to Pro Features on limit hit


