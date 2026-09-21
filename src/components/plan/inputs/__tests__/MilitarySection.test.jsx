import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MilitarySection, { MilitaryCoverageSection, MilitaryIncomeSection, MilitaryTspSection } from '../MilitarySection';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../../../lib/scenarios/schema';

vi.mock('../../../../lib/telemetry', () => ({ trackEvent: vi.fn() }));

const PERIOD = {
  id: 'ad',
  dutyStatus: 'active_duty',
  startDate: '1998-06-15',
  endDate: '2002-06-14',
  characterStatus: 'confirmed_honorable_conditions',
  documentationStatus: 'dd214',
  inputProvenance: 'user_entered_official',
  earningsByYear: { 1998: 10000, 1999: 19000, 2000: 20000, 2001: 21000, 2002: 9000 },
};

const base = () => normalizeScenario({ ...createDefaultScenario('m'), profile: { currentAge: 50, separationAge: 57 }, fers: { yearsOfService: 19, high3Salary: 100000 } });
const withMilitary = (military) => applyScenarioUpdates(base(), { military });

function renderSection(scenario, { write = vi.fn(), canUse = () => false, Component: SectionComponent = MilitarySection } = {}) {
  render(
    <MemoryRouter>
      {createElement(SectionComponent, { scenario, write, open: true, onToggle: () => {}, canUse })}
    </MemoryRouter>
  );
  return write;
}
const renderIncome = (scenario, opts = {}) => renderSection(scenario, { ...opts, Component: MilitaryIncomeSection });
const renderTsp = (scenario, opts = {}) => renderSection(scenario, { ...opts, Component: MilitaryTspSection });
const renderCoverage = (scenario, opts = {}) => renderSection(scenario, { ...opts, Component: MilitaryCoverageSection });

describe('MilitarySection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the connection question first and hides everything else until it is answered', () => {
    renderSection(base());
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
    expect(screen.queryByText('Service periods')).not.toBeInTheDocument();
    expect(screen.getByText(/does not ask for a DoD ID, VA file number, unit, duty location, or any medical information/)).toBeInTheDocument();
  });

  it('writes the connection and reveals the intake, with the non-affiliation notice', () => {
    const write = renderSection(base());
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, me' }));
    expect(write).toHaveBeenCalledWith({ military: { connection: 'self' } });
    const s = withMilitary({ connection: 'self' });
    renderSection(s);
    expect(screen.getAllByText(/not affiliated with or endorsed by those agencies/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Your current relationship to the uniformed services')).toBeInTheDocument();
  });

  it('adds a service period with active duty preselected and no dates', () => {
    const write = renderSection(withMilitary({ connection: 'self' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add service period' }));
    expect(write).toHaveBeenCalledTimes(1);
    const patch = write.mock.calls[0][0];
    expect(patch.military.servicePeriods).toHaveLength(1);
    expect(patch.military.servicePeriods[0]).toMatchObject({ dutyStatus: 'active_duty', startDate: null, endDate: null, characterStatus: 'unknown' });
  });

  it('shows a period with its status badge, its basic-pay-by-year inputs, and its issues', () => {
    renderSection(withMilitary({ connection: 'self', servicePeriods: [PERIOD] }));
    const card = screen.getByTestId('service-period-0');
    expect(within(card).getByText('Calculated')).toBeInTheDocument();
    expect(within(card).getByLabelText('Basic pay 1999')).toHaveValue('19000');
    expect(within(card).getByLabelText('Start date')).toHaveValue('1998-06-15');
    // Unpaid: the deposit note appears on the period.
    expect(within(card).getByText(/not recorded as paid in full/)).toBeInTheDocument();
  });

  it('an unknown character of service shows the determination badge and the block', () => {
    renderSection(withMilitary({ connection: 'self', servicePeriods: [{ ...PERIOD, characterStatus: 'unknown' }] }));
    const card = screen.getByTestId('service-period-0');
    expect(within(card).getByText('Official determination required')).toBeInTheDocument();
    expect(card.querySelector('[data-issue-code="MIL_CHARACTER_UNKNOWN"]')).not.toBeNull();
  });

  it('writes a period field change with the whole array', () => {
    const write = renderSection(withMilitary({ connection: 'self', servicePeriods: [PERIOD] }));
    fireEvent.change(screen.getByLabelText('Duty status'), { target: { value: 'inactive_duty_training' } });
    const patch = write.mock.calls[0][0];
    expect(patch.military.servicePeriods[0].dutyStatus).toBe('inactive_duty_training');
    expect(patch.military.servicePeriods[0].id).toBe('ad');
  });

  it('shows the deposit summary and the SF 3108 next steps', () => {
    renderSection(withMilitary({ connection: 'self', servicePeriods: [PERIOD], deposit: { firstFersCoverageDate: '2010-03-01' } }));
    const summary = screen.getByTestId('deposit-summary');
    expect(within(summary).getByText('Estimated principal')).toBeInTheDocument();
    expect(within(summary).getByText(/submit SF 3108/)).toBeInTheDocument();
    expect(within(summary).getByText(/not an official service-credit determination/)).toBeInTheDocument();
  });

  it('switches to official-balance mode fields', () => {
    const write = renderSection(withMilitary({ connection: 'self' }));
    fireEvent.click(screen.getByRole('radio', { name: /official balance from my agency/ }));
    expect(write).toHaveBeenCalledWith({ military: { deposit: { mode: 'official_balance' } } });
    renderSection(withMilitary({ connection: 'self', deposit: { mode: 'official_balance' } }));
    expect(screen.getByLabelText('Official balance from your agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Balance good through')).toBeInTheDocument();
  });

  it('retired pay: shows the type and waiver fields, never a waiver for chapter 61', () => {
    renderIncome(withMilitary({ connection: 'self', retiredPay: { receives: 'yes', type: 'regular_longevity' } }));
    expect(screen.getByLabelText('Waiver of retired pay')).toBeInTheDocument();
    expect(screen.getByText(/FireFed never prepares or submits a waiver/)).toBeInTheDocument();
    cleanupRender();
    // The gate speaks only when there is service to credit.
    renderIncome(withMilitary({ connection: 'self', servicePeriods: [PERIOD], retiredPay: { receives: 'yes', type: 'disability_chapter61' } }));
    expect(screen.queryByLabelText('Waiver of retired pay')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Combat or instrumentality-of-war finding')).toBeInTheDocument();
    expect(document.querySelector('[data-issue-code="MIL_CH61_OFFICIAL_INPUT_REQUIRED"]')).not.toBeNull();
  });

  it('adds an income stream of the chosen type', () => {
    const write = renderIncome(withMilitary({ connection: 'self' }));
    fireEvent.change(screen.getByLabelText('Add income'), { target: { value: 'va_disability' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const patch = write.mock.calls[0][0];
    expect(patch.military.incomeStreams).toHaveLength(1);
    expect(patch.military.incomeStreams[0]).toMatchObject({ type: 'va_disability', grossAmount: null, amountStatus: 'official' });
  });

  it('a VA stream asks for an amount or a rating and dependents, and nothing medical', () => {
    renderIncome(withMilitary({ connection: 'self', incomeStreams: [{ id: 'va', type: 'va_disability', grossAmount: null }] }));
    const card = screen.getByTestId('income-stream-0');
    expect(within(card).getByLabelText('Combined rating')).toBeInTheDocument();
    expect(within(card).getByLabelText('Children under 18')).toBeInTheDocument();
    expect(within(card).getByText(/does not estimate conditions, advise on claims, or predict future ratings/)).toBeInTheDocument();
    expect(within(card).queryByLabelText(/diagnos|condition|claim number|file number/i)).not.toBeInTheDocument();
  });

  it('shows the estimate note once a rating is chosen, and the staleness note on an old official amount', () => {
    renderIncome(withMilitary({ connection: 'self', incomeStreams: [{ id: 'va', type: 'va_disability', grossAmount: null, amountStatus: 'estimated', vaEstimate: { rating: 70, spouse: true } }] }));
    expect(document.querySelector('[data-issue-code="MIL_VA_TABLE_ESTIMATE"]')).not.toBeNull();
    cleanupRender();
    renderIncome(withMilitary({ connection: 'self', incomeStreams: [{ id: 'rp', type: 'longevity_retired_pay', grossAmount: 2500, amountStatus: 'official', officialAmountAsOfDate: '2023-01-01' }] }));
    expect(document.querySelector('[data-issue-code="MIL_OFFICIAL_AMOUNT_STALE"]')).not.toBeNull();
  });

  it('gates the survivor scenario behind Pro', () => {
    renderIncome(withMilitary({ connection: 'self' }));
    expect(screen.getByText(/Model a death and the survivor streams with Pro/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your age at death (optional)')).toBeDisabled();
    cleanupRender();
    renderIncome(withMilitary({ connection: 'self' }), { canUse: () => true });
    expect(screen.getByLabelText('Your age at death (optional)')).not.toBeDisabled();
  });

  it('deletes all military data only after a second click, and resets the block', () => {
    const write = renderSection(withMilitary({ connection: 'self', servicePeriods: [PERIOD] }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete all military data' }));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete all military data' }));
    expect(write).toHaveBeenCalledTimes(1);
    const patch = write.mock.calls[0][0];
    expect(patch.military.connection).toBe('none');
    expect(patch.military.servicePeriods).toEqual([]);
    expect(patch.military.incomeStreams).toEqual([]);
  });

  it('links to the military results page', () => {
    renderSection(withMilitary({ connection: 'self' }));
    expect(screen.getByRole('link', { name: 'See the military results' })).toHaveAttribute('href', '/plan/military');
  });

  it('uniformed TSP: hidden until enabled, then shows the buckets, the shared-limit summary, and the BRS extras only for BRS', () => {
    const write = renderTsp(withMilitary({ connection: 'self' }));
    const panel = screen.getByTestId('uniformed-tsp');
    expect(within(panel).queryByLabelText('Traditional balance (taxable)')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByLabelText('I have a uniformed-services TSP account'));
    expect(write).toHaveBeenCalledWith({ military: { tsp: { uniformedServices: { enabled: true } } } });
    cleanupRender();
    renderTsp(withMilitary({ connection: 'self', tsp: { uniformedServices: { enabled: true, coverageSystem: 'brs', monthsOfService: 96, contributing: true, monthlyBasicPay: 3000, employeePercent: 5 } } }));
    expect(screen.getByLabelText('Tax-exempt (combat-zone) balance')).toBeInTheDocument();
    expect(screen.getByLabelText('Of which from tax-exempt combat-zone pay, per year')).toBeInTheDocument();
    expect(screen.getByTestId('tsp-coordination-summary')).toHaveTextContent('Shared limit $32,500 (with catch-up)'); // age 50 in the base scenario
    expect(screen.getByTestId('brs-extras')).toBeInTheDocument();
    expect(screen.getByLabelText('Lump-sum scenario')).toBeInTheDocument();
    cleanupRender();
    renderTsp(withMilitary({ connection: 'self', tsp: { uniformedServices: { enabled: true, coverageSystem: 'legacy' } } }));
    expect(screen.queryByTestId('brs-extras')).not.toBeInTheDocument();
  });

  it('flags a shared-limit overrun on the section itself', () => {
    renderTsp(withMilitary({ connection: 'self', tsp: { uniformedServices: { enabled: true, coverageSystem: 'brs', monthsOfService: 96, contributing: true, monthlyBasicPay: 8000, employeePercent: 60, ytdEmployeeDeferrals: 20000 } } }));
    expect(screen.getByText(/exceed this year’s elective-deferral limit/)).toBeInTheDocument();
  });

  it('coverage periods: adds a row per person, and a TRS row for a current fed is blocked in place', () => {
    const write = renderCoverage(withMilitary({ connection: 'self' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add coverage period' }));
    expect(write).toHaveBeenCalledTimes(1);
    const added = write.mock.calls[0][0].military.coverage;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ source: 'fehb', ownerId: 'primary', enrollmentConfirmed: false });
    cleanupRender();
    renderCoverage(withMilitary({ connection: 'self', coverage: [{ id: 'c1', ownerId: 'primary', source: 'trs', startDate: '2026-01-01', enrollmentConfirmed: true }] }));
    const row = screen.getByTestId('coverage-period-0');
    expect(within(row).getByLabelText('Coverage')).toHaveValue('trs');
    expect(within(row).getByText(/cannot purchase TRICARE Reserve Select/)).toBeInTheDocument();
    expect(within(row).getByLabelText('Monthly premium')).toHaveAttribute('placeholder', 'Program table');
    // Nothing medical is asked anywhere in the coverage row.
    expect(within(row).queryByLabelText(/diagnos|condition|claim number/i)).not.toBeInTheDocument();
  });

  it('SBP panel: appears with retired pay, records the election, and summarizes the estimated net deposit', () => {
    renderIncome(withMilitary({ connection: 'self' }));
    expect(screen.queryByTestId('sbp-panel')).not.toBeInTheDocument();
    cleanupRender();
    const write = renderIncome(
      withMilitary({
        connection: 'self',
        retiredPay: { receives: 'yes', type: 'regular_longevity' },
        incomeStreams: [{ id: 'rp', type: 'longevity_retired_pay', grossAmount: 3000, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' }],
        sbp: { elected: 'yes', category: 'spouse', fullBase: true, provenance: 'user_entered_official' },
      })
    );
    const panel = screen.getByTestId('sbp-panel');
    expect(within(panel).getByLabelText('SBP coverage')).toHaveValue('yes');
    expect(within(panel).getByLabelText('Beneficiary category')).toHaveValue('spouse');
    expect(screen.getByTestId('ledger-summary')).toHaveTextContent('Estimated net deposit: $2,805 per month from $3,000 gross; SBP premium $195, survivor annuity $1,650');
    fireEvent.change(within(panel).getByLabelText('SBP coverage'), { target: { value: 'no' } });
    expect(write).toHaveBeenCalledWith({ military: { sbp: { elected: 'no' } } });
    // Never a recommendation.
    expect(panel.textContent.toLowerCase()).not.toMatch(/you should|best election|worth electing/);
  });

  it('shows the newer-rules banner for a scenario saved under older rules and applies the current version on request', () => {
    const write = renderSection(withMilitary({ connection: 'self', rulesVersion: '2025.1' }));
    const banner = screen.getByTestId('rules-stale-banner');
    expect(banner).toHaveTextContent('Saved calculations keep their own version and are not changed');
    fireEvent.click(within(banner).getByRole('button', { name: 'Apply current rules to this scenario' }));
    expect(write).toHaveBeenCalledWith({ military: { rulesVersion: '2026.1' } });
    cleanupRender();
    renderSection(withMilitary({ connection: 'self' }));
    expect(screen.queryByTestId('rules-stale-banner')).not.toBeInTheDocument();
  });
});

function cleanupRender() {
  document.body.innerHTML = '';
}
