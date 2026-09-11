import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import MethodologyPage from '../MethodologyPage';
import { listRules } from '../../../lib/rules/registry';

const renderPage = () =>
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  );

describe('MethodologyPage', () => {
  it('renders every rule from the registry with a link to its source', () => {
    renderPage();
    const rules = listRules();
    expect(rules.length).toBeGreaterThan(30);
    for (const r of rules) {
      const links = screen.getAllByRole('link', { name: (n) => n.includes(r.source.name) });
      expect(links.some((l) => l.getAttribute('href') === r.source.url)).toBe(true);
    }
    // The count in the heading is the registry's, not a typed number.
    expect(screen.getByRole('heading', { name: `Every rule, with its source (${rules.length})` })).toBeInTheDocument();
  });

  it('shows the published examples with the authority figure and a link to the test', () => {
    renderPage();
    const srs = screen.getByRole('heading', { name: /supplement, OPM's own illustration/ }).closest('.card');
    expect(within(srs).getByText('$750.00')).toBeInTheDocument();
    expect(within(srs).getByRole('link', { name: /The test/ })).toHaveAttribute(
      'href',
      'https://github.com/rddaniels89/FIRE-FED/blob/main/src/lib/calculations/__tests__/opmConformance.test.js'
    );

    const p915 = screen.getByRole('heading', { name: /Publication 915/ }).closest('.card');
    expect(within(p915).getByText('$2,990')).toBeInTheDocument();
  });

  it('owns up to what the differential tests found', () => {
    renderPage();
    expect(screen.getByText(/minimum retirement age was hardcoded at 57/)).toBeInTheDocument();
    expect(screen.getByText(/Discontinued service retirement was not modeled/)).toBeInTheDocument();
  });

  it('keeps the educational, non-affiliated positioning', () => {
    renderPage();
    expect(screen.getByText(/does not provide individualized financial advice/)).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with OPM, the TSP, the SSA/)).toBeInTheDocument();
  });
});
