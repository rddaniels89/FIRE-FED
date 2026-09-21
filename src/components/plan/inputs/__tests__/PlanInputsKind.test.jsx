import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlanInputs from '../../PlanInputs';
import PlanDashboard from '../../PlanDashboard';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario, profileKindUpdates } from '../../../../lib/scenarios/schema';

const mocks = vi.hoisted(() => ({ scenario: null, update: vi.fn(), entitlements: { features: {} } }));

vi.mock('../../../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: mocks.scenario, updateCurrentScenario: mocks.update, isLoadingScenarios: false }),
}));
vi.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ entitlements: mocks.entitlements }) }));
vi.mock('../../../../lib/telemetry', () => ({ trackEvent: vi.fn() }));
// The dashboard's charts read the theme; stub both so the page renders under jsdom.
vi.mock('../../../../contexts/ThemeContext', () => ({ useTheme: () => ({ isDarkMode: false }) }));
vi.mock('react-chartjs-2', () => {
  const chartStub = (props) => <canvas role={props.role} aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} />;
  return { Bar: chartStub, Line: chartStub };
});

const federal = () => normalizeScenario({ ...createDefaultScenario('f'), profile: { currentAge: 45, separationAge: 57 } });
const militaryOnly = () => {
  const s = federal();
  return applyScenarioUpdates(s, profileKindUpdates(s, 'military_only'));
};

const renderInputs = () =>
  render(
    <MemoryRouter>
      <PlanInputs />
    </MemoryRouter>
  );

describe('who the plan is for', () => {
  beforeEach(() => mocks.update.mockClear());

  it('the You section asks first, and answering writes the kind with its consequences', () => {
    mocks.scenario = federal();
    renderInputs();
    const kind = screen.getByTestId('profile-kind');
    expect(within(kind).getByRole('radio', { name: 'Federal employee' })).toBeChecked();
    fireEvent.click(within(kind).getByRole('radio', { name: 'Military member or veteran, no federal job' }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ profile: { kind: 'military_only' }, military: { connection: 'self' }, fers: { yearsOfService: 0, monthsOfService: 0 } }));
  });

  it('a federal employee sees the FERS questions and the nudge to the military sections', () => {
    mocks.scenario = federal();
    renderInputs();
    expect(screen.getByRole('button', { name: /^Service and pay/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Service and pay/ }));
    expect(screen.getByTestId('service-military-nudge')).toHaveTextContent('Prior military service is entered under Military service and benefits');
    expect(screen.getByLabelText('Retirement path')).toBeInTheDocument();
    expect(screen.getByLabelText('Separation age')).toBeInTheDocument();
  });

  it('a military member with no federal job sees no FERS questions, and the military sections are open for business', () => {
    mocks.scenario = militaryOnly();
    renderInputs();
    expect(screen.queryByRole('button', { name: /^Service and pay/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Retirement path')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hire cohort')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Age you stop working')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Military service and benefits/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Military retired pay, VA, and survivor income/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Uniformed-services TSP and BRS/ })).toBeInTheDocument();
  });

  it('the dashboard for a plan with no federal job leads with the military plan instead of FERS eligibility', () => {
    mocks.scenario = militaryOnly();
    render(
      <MemoryRouter>
        <PlanDashboard />
      </MemoryRouter>
    );
    expect(screen.getByTestId('military-first')).toBeInTheDocument();
    expect(within(screen.getByTestId('military-first')).getByRole('link', { name: 'Open the Military + Federal Plan' })).toHaveAttribute('href', '/plan/military');
    expect(screen.queryByRole('heading', { name: 'When could I leave?' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How do I bridge the gap?' })).toBeInTheDocument();
  });
});
