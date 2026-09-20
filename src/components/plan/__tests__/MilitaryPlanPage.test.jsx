import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MilitaryPlanPage from '../MilitaryPlanPage';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../../lib/scenarios/schema';
import { FEATURES } from '../../../lib/entitlements';
import { RETIRED_PAY_WAIVER_WARNING } from '../../../lib/military/retiredPayWaiver';

const mocks = vi.hoisted(() => ({ scenario: null, entitlements: { features: {} }, track: vi.fn() }));

vi.mock('../../../contexts/ScenarioContext', () => ({ useScenario: () => ({ currentScenario: mocks.scenario, isLoadingScenarios: false }) }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ entitlements: mocks.entitlements }) }));
vi.mock('../../../lib/telemetry', () => ({ trackEvent: (...args) => mocks.track(...args) }));

const PERIOD = {
  id: 'ad',
  dutyStatus: 'active_duty',
  startDate: '1998-01-01',
  endDate: '2001-12-31',
  characterStatus: 'confirmed_honorable_conditions',
  documentationStatus: 'dd214',
  inputProvenance: 'user_entered_official',
  earningsByYear: { 1998: 18000, 1999: 19000, 2000: 20000, 2001: 21000 },
};

const scenario = (military) =>
  applyScenarioUpdates(
    normalizeScenario({
      ...createDefaultScenario('m'),
      profile: { currentAge: 50, separationAge: 57, socialSecurityClaimAge: 67 },
      tsp: { currentBalance: 400000, annualSalary: 110000, monthlyContributionPercent: 10, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
      fers: { yearsOfService: 19, monthsOfService: 0, high3Salary: 105000 },
      fire: { monthlyFireIncomeGoal: 5000, sideHustleIncome: 0 },
      summary: { monthlyExpenses: 4500, socialSecurity: { mode: 'manual', monthlyBenefit: 2400 } },
    }),
    { military }
  );

const renderPage = () =>
  render(
    <MemoryRouter>
      <MilitaryPlanPage />
    </MemoryRouter>
  );

describe('MilitaryPlanPage', () => {
  beforeEach(() => {
    mocks.entitlements = { features: {} };
    mocks.track.mockClear();
  });

  it('invites the user to add a connection when none is recorded', () => {
    mocks.scenario = scenario({ connection: 'none' });
    renderPage();
    expect(screen.getByRole('link', { name: 'Add a military connection' })).toHaveAttribute('href', '/plan/inputs#military');
    expect(screen.getByText(/Official agencies make eligibility and payment decisions/)).toBeInTheDocument();
  });

  it('renders the five views for a veteran with a paid deposit', () => {
    mocks.scenario = scenario({ connection: 'self', servicePeriods: [PERIOD], deposit: { firstFersCoverageDate: '2008-03-01' }, incomeStreams: [{ id: 'va', type: 'va_disability', grossAmount: 1500, amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' }] });
    renderPage();
    for (const name of ['Military snapshot', 'Service-credit comparison', 'Military income timeline', 'Assumptions and sources']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    // No retired pay recorded, so no waiver view.
    expect(screen.queryByRole('heading', { name: 'Retired-pay waiver comparison' })).not.toBeInTheDocument();
    // The comparison: MRA+10 without the deposit, unreduced with it.
    expect(screen.getByText('Whole-plan comparison')).toBeInTheDocument();
    expect(screen.getByText('MRA+10, starting now')).toBeInTheDocument();
    expect(screen.getByText('Immediate, unreduced')).toBeInTheDocument();
    // The spec copy.
    expect(screen.getByText(/not an official service-credit determination/)).toBeInTheDocument();
    expect(screen.getByText(/official balance may differ/)).toBeInTheDocument();
    // Income timeline carries the VA stream with its tax class.
    expect(screen.getByRole('columnheader', { name: /VA disability compensation \(Not taxable\)/ })).toBeInTheDocument();
    // Advanced analysis is Pro.
    expect(screen.getByText(/Present value, the discounted break-even/)).toBeInTheDocument();
  });

  it('unlocks the analysis block for Pro', () => {
    mocks.entitlements = { features: { [FEATURES.MILITARY_ANALYSIS]: true } };
    mocks.scenario = scenario({ connection: 'self', servicePeriods: [PERIOD], deposit: { firstFersCoverageDate: '2008-03-01' } });
    renderPage();
    expect(screen.getByText(/Net present value at/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'After-tax difference by age' })).toBeInTheDocument();
  });

  it('always shows the §6.7 warning and the block for a regular retiree, and gates the scenarios', () => {
    mocks.scenario = scenario({
      connection: 'self',
      servicePeriods: [PERIOD],
      retiredPay: { receives: 'yes', type: 'regular_longevity' },
      incomeStreams: [{ id: 'rp', type: 'longevity_retired_pay', grossAmount: 3000, amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' }],
    });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Retired-pay waiver comparison' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(RETIRED_PAY_WAIVER_WARNING);
    expect(document.querySelector('[data-issue-code="MIL_WAIVER_CONFIRMATION_REQUIRED"]')).not.toBeNull();
    expect(screen.getByText(/The keep, waive, and exception scenarios/)).toBeInTheDocument();
    // Nothing is credited in the plan of record.
    expect(within(screen.getByRole('heading', { name: 'Military snapshot' }).closest('section')).getByText('None credited')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('unsupported_case_shown');
  });

  it('shows the keep and waive scenarios for Pro', () => {
    mocks.entitlements = { features: { [FEATURES.MILITARY_SCENARIOS]: true } };
    mocks.scenario = scenario({
      connection: 'self',
      servicePeriods: [PERIOD],
      retiredPay: { receives: 'yes', type: 'regular_longevity' },
      incomeStreams: [{ id: 'rp', type: 'longevity_retired_pay', grossAmount: 3000, amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' }],
    });
    renderPage();
    const table = screen.getByRole('table', { name: 'Keep, waive, and exception scenarios' });
    expect(within(table).getByRole('columnheader', { name: 'Keep retired pay' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Waive (hypothetical)' })).toBeInTheDocument();
    expect(screen.getByText(/FireFed does not prepare or submit a waiver/)).toBeInTheDocument();
  });

  it('never uses recommendation language', () => {
    mocks.entitlements = { features: { [FEATURES.MILITARY_SCENARIOS]: true, [FEATURES.MILITARY_ANALYSIS]: true } };
    mocks.scenario = scenario({ connection: 'self', servicePeriods: [PERIOD], retiredPay: { receives: 'yes', type: 'regular_longevity' }, incomeStreams: [{ id: 'rp', type: 'longevity_retired_pay', grossAmount: 3000, amountStatus: 'official' }] });
    renderPage();
    expect(document.body.textContent.toLowerCase()).not.toMatch(/you should|you qualify|buy back|best plan|worth paying/);
  });
});
