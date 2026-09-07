import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createDefaultScenario, normalizeScenario } from '../../../lib/scenarios/schema';
import { FEATURES } from '../../../lib/entitlements';

const mocks = vi.hoisted(() => ({
  updateCurrentScenario: vi.fn(),
  scenario: null,
  entitlements: { features: {} },
}));

vi.mock('react-chartjs-2', () => ({ Line: () => null }));

vi.mock('../../../contexts/ScenarioContext', () => ({
  useScenario: () => ({
    currentScenario: mocks.scenario,
    updateCurrentScenario: mocks.updateCurrentScenario,
  }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ entitlements: mocks.entitlements }),
}));

// The charts read the theme to pick axis and gridline colours.
vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

import CareerSimulator from '../CareerSimulator';

const renderPage = ({ pro = true, career = {} } = {}) => {
  mocks.scenario = normalizeScenario({
    ...createDefaultScenario('Test'),
    career: { enabled: false, grade: 13, step: 4, localityCode: 'RUS', annualRaisePercent: 2, promotions: [], ...career },
  });
  mocks.entitlements = { features: pro ? { [FEATURES.CAREER_SIMULATOR]: true } : {} };
  return render(
    <MemoryRouter>
      <CareerSimulator />
    </MemoryRouter>,
  );
};

describe('CareerSimulator', () => {
  it('renders the High-3 card with a projected figure', () => {
    renderPage();
    const card = screen.getByText(/High-3 at separation/i).closest('.card');
    expect(card).toBeInTheDocument();
    expect(card.textContent).toMatch(/\$\d{1,3}(,\d{3})+/);
    expect(screen.getByText(/Projected FERS annuity at start/i)).toBeInTheDocument();
    expect(screen.getByText(/What one more year would do/i)).toBeInTheDocument();
  });

  it('enables the career path in the plan and syncs today\'s salary', () => {
    renderPage();
    const toggle = screen.getByRole('switch', { name: /Use this career path in my plan/i });
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);

    expect(mocks.updateCurrentScenario).toHaveBeenCalledTimes(1);
    const updates = mocks.updateCurrentScenario.mock.calls[0][0];
    expect(updates.career).toMatchObject({ enabled: true, grade: 13, step: 4, localityCode: 'RUS' });
    expect(updates.tsp.annualSalary).toBeGreaterThan(100000);
    expect(updates.fers.high3Salary).toBe(updates.tsp.annualSalary);
  });

  it('adds and removes promotion rows', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add promotion/i }));
    const updates = mocks.updateCurrentScenario.mock.calls[0][0];
    expect(updates.career.promotions).toEqual([{ atAge: 44, toGrade: 14 }]);
  });

  it('locks the inputs and shows the upgrade CTA for non-Pro users', () => {
    renderPage({ pro: false });
    expect(screen.getByRole('link', { name: /See Pro features/i })).toHaveAttribute('href', '/pro-features');
    expect(screen.getByRole('switch', { name: /Use this career path in my plan/i })).toBeDisabled();
    expect(screen.getByLabelText(/^Grade$/i)).toBeDisabled();
    expect(screen.getByLabelText(/^Grade$/i)).toHaveValue('12');
    expect(screen.getByText(/High-3 at separation/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: /Use this career path in my plan/i }));
    expect(mocks.updateCurrentScenario).not.toHaveBeenCalled();
  });
});
