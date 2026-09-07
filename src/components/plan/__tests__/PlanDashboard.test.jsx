import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createDefaultScenario, normalizeScenario } from '../../../lib/scenarios/schema';
import { findFireDate } from '../../../lib/projection/fireDate';

// jsdom has no canvas. react-chartjs-2 spreads unknown props onto the canvas,
// so the stub does the same and the charts' text alternatives stay testable.
vi.mock('react-chartjs-2', () => {
  const chartStub = (props) => (
    <canvas role={props.role} aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} />
  );
  return { Bar: chartStub, Line: chartStub };
});

const scenario = normalizeScenario(createDefaultScenario('Test'));
const updateCurrentScenario = vi.fn();

vi.mock('../../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: scenario, updateCurrentScenario, isLoadingScenarios: false }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ entitlements: { isPro: false, features: {} } }),
}));

// The charts read the theme to pick axis and gridline colours.
vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false }),
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

  it('gives every chart, control and region a text alternative', () => {
    renderPage();

    // The charts are canvases: each states its own reading and points at the
    // year-by-year table for the detail.
    const income = screen.getByRole('img', { name: /^Income by source from age \d+ to \d+/ });
    expect(income).toHaveAttribute('aria-describedby', 'year-by-year-panel');
    expect(screen.getByRole('img', { name: /^Total balance in nominal dollars from age/ })).toBeInTheDocument();

    // The sustainability strip reads out rather than relying on green vs red.
    expect(screen.getByRole('img', { name: /^Sustainability by separation age: / })).toBeInTheDocument();

    // The disclosure controls a panel that exists whether or not it is open.
    const yearByYear = screen.getByRole('button', { name: /Year by year/ });
    expect(yearByYear).toHaveAttribute('aria-controls', 'year-by-year-panel');
    expect(document.getElementById('year-by-year-panel')).toBeTruthy();

    expect(screen.getByRole('progressbar', { name: 'Bridge funded' })).toBeInTheDocument();

    // Two "Use this age" buttons, told apart by the age each one sets.
    // The visible text is "Use this age" on both cards, so the age is appended
    // for screen readers rather than replacing the label — an aria-label that
    // dropped the visible words would break the label-in-name rule.
    const useButtons = screen.getAllByRole('button', { name: /^Use this age \d+$/ });
    expect(useButtons).toHaveLength(2);
    expect(new Set(useButtons.map((b) => b.textContent))).toHaveProperty('size', 2);
  });

  it('binds the slider to the scenario separation age and gates Pro tools', () => {
    renderPage();
    const slider = screen.getByRole('slider', { name: 'Separation age' });
    expect(slider).toHaveValue(String(scenario.profile.separationAge));
    expect(screen.getAllByText('Pro feature').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('72(t) SEPP payments')).toBeDisabled();
  });
});
