import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlanInputs from '../../PlanInputs';
import { createDefaultScenario, normalizeScenario } from '../../../../lib/scenarios/schema';
import { FEATURES } from '../../../../lib/entitlements';
import { youSummary, taxesSummary, householdSummary } from '../summaries';

const mocks = vi.hoisted(() => ({
  scenario: null,
  update: vi.fn(),
  entitlements: { features: {} },
}));

vi.mock('../../../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: mocks.scenario, updateCurrentScenario: mocks.update }),
}));

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ entitlements: mocks.entitlements }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PlanInputs />
    </MemoryRouter>
  );

describe('PlanInputs', () => {
  beforeEach(() => {
    mocks.scenario = normalizeScenario(createDefaultScenario('Test'));
    mocks.update = vi.fn();
    mocks.entitlements = { features: {} };
  });

  it('renders every section with the You section open and the rest summarised', () => {
    renderPage();
    for (const name of ['You', 'Service and pay', 'Savings', 'Spending', 'Social Security', 'Taxes', 'Healthcare', 'Household', 'Strategies', 'Assumptions']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /^You/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(taxesSummary(mocks.scenario))).toBeInTheDocument();
    expect(screen.getByText(/Privacy: FireFed stores ages, not birth dates/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /View my plan/ })).toHaveLength(2);
  });

  it('writes profile fields after the debounce and translates the annuity-start radio to null', () => {
    vi.useFakeTimers();
    try {
      renderPage();
      const age = screen.getByRole('textbox', { name: 'Separation age' });
      fireEvent.focus(age);
      fireEvent.change(age, { target: { value: '5' } });
      fireEvent.change(age, { target: { value: '57' } });
      expect(mocks.update).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.update).toHaveBeenCalledWith({ profile: { separationAge: 57 } });

      fireEvent.click(screen.getByLabelText('Choose an age'));
      expect(mocks.update).toHaveBeenLastCalledWith({ profile: { annuityStartAge: 62 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the monthly benefit per claim age once a Social Security figure exists', () => {
    mocks.scenario = normalizeScenario({
      ...createDefaultScenario('Test'),
      summary: { socialSecurity: { mode: 'manual', monthlyBenefit: 2000 } },
    });
    renderPage();
    const select = screen.getByLabelText('Social Security claim age');
    expect(select).toHaveDisplayValue(/67 — \$2,000\/mo/);
    expect(screen.getByRole('option', { name: /70 — \$2,480\/mo/ })).toBeInTheDocument();
  });

  it('writes the state preset shape and shows its notes', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Taxes/ }));
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'AL' } });
    expect(mocks.update).toHaveBeenCalledWith({
      taxes: {
        state: { code: 'AL', rate: 0.04, exemptsFederalPension: true, exemptsSocialSecurity: true, pensionExclusion: 0 },
      },
    });
    expect(screen.getByTestId('state-tax-notes')).toHaveTextContent(/not modeled/);
  });

  it('blank High-3 falls back to the current salary', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Service and pay/ }));
    const high3 = screen.getByRole('textbox', { name: 'High-3 average salary' });
    fireEvent.focus(high3);
    fireEvent.change(high3, { target: { value: '' } });
    fireEvent.blur(high3);
    expect(mocks.update).toHaveBeenCalledWith({ fers: { high3Salary: mocks.scenario.tsp.annualSalary } });
  });

  it('gates Household and Strategies for free users and unlocks them for Pro', () => {
    renderPage();
    expect(screen.getByText(householdSummary(mocks.scenario, false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Household/ }));
    expect(screen.getByLabelText('Include a spouse or partner in the plan')).toBeDisabled();
    expect(screen.getAllByRole('link', { name: 'See Pro' }).length).toBeGreaterThan(0);
  });

  it('lets Pro users enable the spouse and the Trustees haircut toggle writes the default cut', () => {
    mocks.entitlements = { features: { [FEATURES.HOUSEHOLD]: true, [FEATURES.BRIDGE_STRATEGIES]: true, [FEATURES.IRMAA]: true } };
    mocks.scenario = normalizeScenario({
      ...createDefaultScenario('Test'),
      summary: { socialSecurity: { mode: 'manual', monthlyBenefit: 1500 } },
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Household/ }));
    const enable = screen.getByLabelText('Include a spouse or partner in the plan');
    expect(enable).toBeEnabled();
    fireEvent.click(enable);
    expect(mocks.update).toHaveBeenCalledWith({ household: { spouse: { enabled: true } } });

    fireEvent.click(screen.getByRole('button', { name: /^Social Security/ }));
    fireEvent.click(screen.getByLabelText("Model the Trustees' projected cut"));
    expect(mocks.update).toHaveBeenCalledWith({
      summary: { socialSecurity: { trustFundHaircut: { startYear: 2033, percent: 23 } } },
    });
  });

  it('summarises the profile from the schema fields', () => {
    expect(youSummary(mocks.scenario)).toMatch(/Age 42 · leaves at 55 · annuity at separation · Social Security at 67/);
  });
});
