import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createDefaultScenario, normalizeScenario } from '../../../lib/scenarios/schema';
import { findFireDate } from '../../../lib/projection/fireDate';

// jsdom has no canvas.
vi.mock('react-chartjs-2', () => ({ Bar: () => null, Line: () => null }));

const scenario = normalizeScenario(createDefaultScenario('Test'));
const updateCurrentScenario = vi.fn();

vi.mock('../../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: scenario, updateCurrentScenario, isLoadingScenarios: false }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ entitlements: { isPro: false, features: {} } }),
}));

import PlanDashboard from '../PlanDashboard';

function renderPage() {
  return render(
    <MemoryRouter>
      <PlanDashboard />
    </MemoryRouter>
  );
}

describe('PlanDashboard', () => {
  it('renders the four questions', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'When could I leave?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How do I bridge the gap?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What income starts later?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How durable is the projection?' })).toBeInTheDocument();
  });

  it('shows the projected sustainable separation age from findFireDate', () => {
    renderPage();
    const fire = findFireDate(scenario);
    const label = screen.getByText('Projected sustainable separation age');
    const card = within(label.parentElement);
    if (fire.found) {
      expect(card.getByText(String(fire.separationAge))).toBeInTheDocument();
      expect(card.getByText((content) => content.includes(fire.timeline.plan.pathLabel))).toBeInTheDocument();
    } else {
      expect(card.getByText(/Not found before 75/)).toBeInTheDocument();
    }
    expect(card.getByText('Educational projection under these assumptions, not advice.')).toBeInTheDocument();
  });

  it('binds the slider to the scenario separation age and gates Pro tools', () => {
    renderPage();
    const slider = screen.getByRole('slider', { name: 'Separation age' });
    expect(slider).toHaveValue(String(scenario.profile.separationAge));
    expect(screen.getAllByText('Pro feature').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('72(t) SEPP payments')).toBeDisabled();
  });
});
