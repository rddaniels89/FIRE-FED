import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicMilitaryRetirementCalculator from '../PublicMilitaryRetirementCalculator';
import { formToInputs } from '../militaryCalculatorForm';
import { createDefaultScenario, normalizeScenario } from '../../../lib/scenarios/schema';

const mocks = vi.hoisted(() => ({ isAuthenticated: false, scenario: null, update: vi.fn(), track: vi.fn() }));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: mocks.isAuthenticated }) }));
vi.mock('../../../contexts/ScenarioContext', () => ({ useScenario: () => ({ currentScenario: mocks.scenario, updateCurrentScenario: mocks.update }) }));
vi.mock('../../../lib/telemetry', () => ({ trackEvent: (...a) => mocks.track(...a) }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PublicMilitaryRetirementCalculator />
    </MemoryRouter>
  );

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PublicMilitaryRetirementCalculator', () => {
  beforeEach(() => {
    mocks.isAuthenticated = false;
    mocks.scenario = null;
    mocks.update.mockClear();
    mocks.track.mockClear();
  });

  it('opens on the entry choice with the required copy and no result until a path is chosen', () => {
    renderPage();
    expect(screen.getByText('Estimate military retired pay and see every input behind the result.')).toBeInTheDocument();
    expect(screen.getByTestId('status-notice')).toHaveTextContent('not an official retired-pay determination');
    expect(screen.getByText(/Independent educational planning tool; not affiliated/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Guard or Reserve retirement based on points/ })).toBeInTheDocument();
    expect(screen.queryByTestId('result-cards')).not.toBeInTheDocument();
    expect(screen.queryByText(/guaranteed|approved|you qualify|official calculator|best election/i)).not.toBeInTheDocument();
  });

  it('the "not sure" path asks a few questions, suggests a path with the records that decide it, and moves the visitor there', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /I am not sure/ }));
    const wizard = screen.getByTestId('unsure-explainer');
    expect(wizard).toHaveTextContent('None of this tells you which path you are on');
    expect(screen.queryByTestId('result-cards')).not.toBeInTheDocument();
    expect(screen.getByTestId('wizard-suggestion')).toHaveTextContent('Answer what you can');
    // Reserve-only questions appear once the component is known.
    expect(screen.queryByTestId('wizard-qualifyingYears')).not.toBeInTheDocument();
    fireEvent.click(within(wizard).getByLabelText('Still serving (active, Guard, or Reserve)'));
    fireEvent.click(within(wizard).getByLabelText('National Guard or Reserve'));
    fireEvent.click(within(wizard).getByLabelText('No', { selector: 'input[name="wizard-medical"]' }));
    fireEvent.click(within(wizard).getByLabelText('No', { selector: 'input[name="wizard-tera"]' }));
    fireEvent.click(within(wizard).getByLabelText('Under 20'));
    const suggestion = screen.getByTestId('wizard-suggestion');
    expect(suggestion).toHaveTextContent('Continue with: Guard or Reserve retirement based on points');
    expect(suggestion).toHaveTextContent('20-year letter');
    expect(suggestion.textContent.toLowerCase()).not.toMatch(/you qualify|you are eligible|you should/);
    fireEvent.click(within(suggestion).getByRole('button', { name: /Continue with guard or reserve/i }));
    expect(screen.getByRole('radio', { name: /Guard or Reserve retirement based on points/ })).toBeChecked();
    expect(screen.getByTestId('reserve-notice')).toBeInTheDocument();
  });

  it('computes a regular High-36 retirement with the result cards, the audit, and the pay-base table', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Active or regular retirement/ }));
    expect(mocks.track).toHaveBeenCalledWith('public_calculator_engaged', { calculator: 'military_retirement' });
    fill('DIEMS (date you first entered service)', '2006-06-01');
    expect(screen.getByTestId('system-suggestion')).toHaveTextContent('High-36 may apply. Confirm it from your official record');
    fireEvent.click(screen.getByRole('button', { name: 'Use High-36' }));
    fill('Pay entry base date (PEBD)', '2006-06-01');
    fill('Retirement date', '2027-01-01'); // window 2024-01 to 2026-12: every month has a table
    fill('Age at retirement', '38');
    fill('Held from', '2018-01-01');

    const cards = screen.getByTestId('result-cards');
    expect(within(cards).getByTestId('card-system')).toHaveTextContent('High-36');
    expect(within(cards).getByTestId('card-multiplier')).toHaveTextContent('50.00%');
    expect(within(cards).getByTestId('card-start')).toHaveTextContent('2027-01-01');
    const gross = within(cards).getByTestId('card-gross').textContent;
    expect(gross).toMatch(/\$\d,\d{3}/);
    expect(within(cards).getByTestId('card-data-quality')).toHaveTextContent(/estimated/i);
    // Quick mode is always an estimate.
    expect(screen.getByText('Estimated')).toBeInTheDocument();

    // Formula audit lists the rounding step and the rule id.
    const audit = screen.getByTestId('formula-audit');
    expect(within(audit).getAllByText(/military\.retired_pay_formula/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Pay-base table' }));
    const table = screen.getByTestId('paybase-table');
    expect(within(table).getAllByRole('row').length).toBe(37); // header + 36 months
  });

  it('runs the Reserve path from points with the separate tests and the reserve notice', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Guard or Reserve retirement based on points/ }));
    expect(screen.getByTestId('reserve-notice')).toHaveTextContent('qualifying years and retired-pay age are separate tests');
    fill('DIEMS (date you first entered service)', '1996-06-01');
    fireEvent.click(screen.getByRole('button', { name: 'Use High-36' }));
    fill('Pay entry base date (PEBD)', '1996-06-01');
    fill('Total creditable points', '4320');
    fill('Qualifying years (50+ points)', '22');
    fill('Birth month', '1976-05-10');
    fill('Transfer or discharge date', '2026-06-01');
    fill('Held from', '2018-01-01');
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'E8' } });

    const cards = screen.getByTestId('result-cards');
    expect(within(cards).getByTestId('card-service')).toHaveTextContent('4,320 points = 12.0000 years');
    expect(within(cards).getByTestId('card-service')).toHaveTextContent('22 qualifying years');
    expect(within(cards).getByTestId('card-start')).toHaveTextContent('2036-05-01');
    expect(within(cards).getByTestId('card-start')).toHaveTextContent('age 60');
    expect(within(cards).getByTestId('card-multiplier')).toHaveTextContent('30.00%');
    expect(screen.getByText(/Whether you stayed in the Retired Reserve or were discharged/)).toBeInTheDocument();

    // Under 20 qualifying years is a projection, and says so.
    fill('Qualifying years (50+ points)', '18');
    expect(screen.getByText(/Fewer than 20 qualifying years are recorded/)).toBeInTheDocument();
  });

  it('reconciliation mode takes the official figure and shows the difference', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /I already receive retired pay/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Official reconciliation/ }));
    fill('DIEMS (date you first entered service)', '2006-06-01');
    fireEvent.click(screen.getByRole('button', { name: 'Use High-36' }));
    fill('Pay entry base date (PEBD)', '2006-06-01');
    fill('Retirement date', '2026-07-01');
    fill('Held from', '2018-01-01');
    fill('Gross monthly retired pay on your statement or estimate', '3300');
    fill('Statement date', '2026-08-01');
    expect(screen.getByTestId('card-gross')).toHaveTextContent('$3,300');
    expect(screen.getByTestId('card-gross')).toHaveTextContent('Official amount shown');
    fireEvent.click(screen.getByRole('tab', { name: 'Reconciliation' }));
    expect(screen.getByTestId('reconciliation')).toHaveTextContent('Official monthly');
    expect(screen.getByTestId('reconciliation')).toHaveTextContent('$3,300.00');
  });

  it('medical path: asks for the official disposition first, then shows both methods, the cap, and the severance path', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Official medical retirement/ }));
    expect(screen.getByTestId('medical-notice')).toHaveTextContent('does not evaluate medical fitness or disability');
    expect(screen.getByTestId('no-figure')).toBeInTheDocument();
    expect(screen.getByText(/No official medical disposition is recorded/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Official disposition'), { target: { value: 'pdrl' } });
    fill('DoD disability percentage', '60');
    fill('VA rating (kept separate, optional)', '90');
    fill('DIEMS (date you first entered service)', '2010-06-01');
    fireEvent.click(screen.getByRole('button', { name: 'Use High-36' }));
    fill('Pay entry base date (PEBD)', '2010-06-01');
    fill('Years', '14');
    fill('Retirement date', '2027-01-01');
    fill('Held from', '2018-01-01');
    expect(screen.getByTestId('card-multiplier')).toHaveTextContent('60.00%');
    expect(screen.getByTestId('formula-audit')).toHaveTextContent('Greater of the two');
    expect(screen.getByText(/The VA rating recorded here is kept separate/)).toBeInTheDocument();
    expect(screen.getByText(/depends on an official classification/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download this calculation (PDF)' })).toBeInTheDocument();
    // Severance is its own result, not a zero pension.
    fireEvent.change(screen.getByLabelText('Official disposition'), { target: { value: 'separation_severance' } });
    fill('Monthly basic pay at separation', '4000');
    expect(screen.getByTestId('card-severance')).toHaveTextContent('$112,000'); // 2 × 4,000 × 14 years
    expect(screen.queryByTestId('result-cards')).not.toBeInTheDocument();
  });

  it('TERA path: blocked without an official authority, reduced formula with it', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Official TERA retirement/ }));
    expect(screen.getByTestId('tera-fields')).toHaveTextContent('does not show TERA as a future option');
    expect(screen.getByText(/TERA is calculated only under an official Temporary Early Retirement Authority approval/)).toBeInTheDocument();
    fill('Authority on the approval', 'FY2012 NDAA §504 (Army)');
    fill('DIEMS (date you first entered service)', '2010-06-01');
    fireEvent.click(screen.getByRole('button', { name: 'Use High-36' }));
    fill('Pay entry base date (PEBD)', '2010-06-01');
    fill('Years', '16');
    fill('Retirement date', '2027-01-01');
    fill('Held from', '2018-01-01');
    expect(screen.getByTestId('card-multiplier')).toHaveTextContent('38.40%');
    expect(screen.getByTestId('formula-audit')).toHaveTextContent('TERA reduction: 1% per year short of 20');
  });

  it('signed out: a sign-up prompt; signed in: connects the result to the plan as a linked stream', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Active or regular retirement/ }));
    expect(screen.getByRole('link', { name: 'Create a free account' })).toBeInTheDocument();
    expect(screen.queryByTestId('connect-plan')).not.toBeInTheDocument();
  });

  it('signed in: saving writes retirementScenarios and a linked income stream to the military block', async () => {
    mocks.isAuthenticated = true;
    mocks.scenario = normalizeScenario(createDefaultScenario('m'));
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Active or regular retirement/ }));
    const button = screen.getByRole('button', { name: 'Use this result in my Military + Federal Plan' });
    expect(button).toBeDisabled(); // no figure yet: no retirement date
    fill('DIEMS (date you first entered service)', '2006-06-01');
    fireEvent.click(screen.getByRole('button', { name: 'Use High-36' }));
    fill('Pay entry base date (PEBD)', '2006-06-01');
    fill('Retirement date', '2026-07-01');
    fill('Held from', '2018-01-01');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await screen.findByText(/Saved as a linked income stream/);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const patch = mocks.update.mock.calls[0][0].military;
    expect(patch.connection).toBe('self');
    expect(patch.retirementScenarios).toHaveLength(1);
    expect(patch.retirementScenarios[0].calculations[0]).toMatchObject({ rulesVersion: '2026.1', path: 'regular' });
    expect(patch.incomeStreams).toHaveLength(1);
    expect(patch.incomeStreams[0]).toMatchObject({ type: 'longevity_retired_pay', sourceCalculationId: patch.retirementScenarios[0].currentCalculationId, grossAmount: null });
    expect(mocks.track).toHaveBeenCalledWith('military_calculation_saved', expect.objectContaining({ path: 'regular' }));
  });

  it('formToInputs: quick mode never claims official provenance and the reserve block only exists on the reserve path', () => {
    const base = { path: 'regular', mode: 'quick', system: 'high_36', systemConfirmation: 'official', diems: '2006-06-01', cbsElected: false, brsOptIn: false, payEntryBaseDate: '2006-06-01', retirementDate: '2026-07-01', ageAtRetirement: '38', serviceYears: '20', serviceMonths: '3', serviceDays: '9', serviceProvenance: 'user_entered_official', gradePeriods: [{ id: 'g', grade: 'E7', startDate: '2018-01-01', endDate: '' }], retiredGradeConfirmed: true, inflationPct: '2.5', basicPayGrowthPct: '3', officialMonthlyGross: '3000', officialAsOfDate: '', reserve: { officialTotalPoints: '', officialQualifyingYears: '', pointsProvenance: 'user_estimate', birthDate: '', retiredReserveStatus: 'unknown', separationDate: '', officialEligibilityDate: '', reducedAgePeriods: [], retirementYears: [] } };
    const quick = formToInputs(base);
    expect(quick.creditableService.provenance).toBe('user_estimate');
    expect(quick.retiredGradeConfirmed).toBe(false);
    expect(quick.officialEstimate).toBeNull();
    expect(quick.reserve).toBeNull();
    expect(quick.assumptions).toEqual({ inflation: 0.025, basicPayGrowth: 0.03 });
    const detailed = formToInputs({ ...base, mode: 'detailed' });
    expect(detailed.creditableService.provenance).toBe('user_entered_official');
    expect(detailed.retiredGradeConfirmed).toBe(true);
    const reconcile = formToInputs({ ...base, mode: 'reconcile' });
    expect(reconcile.officialEstimate).toEqual({ monthlyGross: 3000, asOfDate: null });
    const reserve = formToInputs({ ...base, path: 'reserve_nonregular', mode: 'detailed', reserve: { ...base.reserve, officialTotalPoints: '4320', pointsProvenance: 'user_entered_official' } });
    expect(reserve.creditableService).toBeNull();
    expect(reserve.reserve).toMatchObject({ officialTotalPoints: 4320, pointsProvenance: 'user_entered_official', separationDate: '2026-07-01' });
  });
});
