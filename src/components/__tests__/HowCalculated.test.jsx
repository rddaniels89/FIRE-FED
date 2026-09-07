import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HowCalculated from '../HowCalculated';
import { getRule } from '../../lib/rules/registry';

describe('HowCalculated', () => {
  it('renders its children and an info button without opening anything', () => {
    render(
      <HowCalculated ruleId="fers.annuity">
        <span>$40,000</span>
      </HowCalculated>
    );
    expect(screen.getByText('$40,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /how was this calculated/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a dialog with the title, plain English, formula, source, statute and verification line', () => {
    const rule = getRule('fers.annuity');
    render(
      <HowCalculated ruleId="fers.annuity" inputs={{ 'High-3': 100000, 'Years of service': 20, 'Sick leave credited': true }}>
        <span>$40,000</span>
      </HowCalculated>
    );
    fireEvent.click(screen.getByRole('button', { name: /how was this calculated/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: rule.title })).toBeInTheDocument();
    expect(screen.getByText(rule.plainEnglish)).toBeInTheDocument();
    expect(dialog.querySelector('code')).toHaveTextContent(rule.formula);

    const link = screen.getByRole('link', { name: rule.source.name });
    expect(link).toHaveAttribute('href', rule.source.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(dialog).toHaveTextContent(rule.statute);
    expect(dialog).toHaveTextContent(`Rule year ${rule.ruleYear}`);
    expect(dialog).toHaveTextContent(`Last verified ${rule.lastVerified}`);
    expect(dialog).toHaveTextContent('Verified against');

    expect(screen.getByText('Inputs used')).toBeInTheDocument();
    expect(screen.getByText('High-3')).toBeInTheDocument();
    expect(screen.getByText('100,000')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', () => {
    render(
      <HowCalculated ruleId="srs.amount">
        <span>$1,200/mo</span>
      </HowCalculated>
    );
    const button = screen.getByRole('button', { name: /how was this calculated/i });
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes when clicking outside, and stays open when clicking inside', () => {
    render(
      <div>
        <p>outside</p>
        <HowCalculated ruleId="tsp.employer_match">
          <span>5%</span>
        </HowCalculated>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /how was this calculated/i }));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a placeholder for an unknown rule id instead of crashing', () => {
    render(
      <HowCalculated ruleId="not.a.rule">
        <span>42</span>
      </HowCalculated>
    );
    fireEvent.click(screen.getByRole('button', { name: /how was this calculated/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Explanation not yet written for not.a.rule');
  });
});
