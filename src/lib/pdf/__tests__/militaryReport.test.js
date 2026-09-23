import { describe, expect, it } from 'vitest';
import { createMilitaryRetirementReportPdf } from '../militaryReport';
import { calculateMilitaryRetiredPay } from '../../military/retirement/calculate';
import { labelForStatus } from '../../military/status';

/** A jsPDF stand-in that records every string written, so the test can check the page says what the screen said. */
class FakePdf {
  constructor() {
    this.texts = [];
    this.pages = 1;
    this.props = null;
  }
  setProperties(p) {
    this.props = p;
  }
  setFont() {}
  setFontSize() {}
  setTextColor() {}
  setDrawColor() {}
  setFillColor() {}
  rect() {}
  line() {}
  addPage() {
    this.pages += 1;
  }
  getNumberOfPages() {
    return this.pages;
  }
  setPage() {}
  getTextWidth(s) {
    return String(s).length * 1.8;
  }
  splitTextToSize(s) {
    return String(s).split('\n');
  }
  text(s) {
    this.texts.push(Array.isArray(s) ? s.join(' ') : String(s));
  }
}

const OFFICIAL = 'user_entered_official';

describe('Military Retirement Report PDF', () => {
  it('shows the same figures, status label, rules version, sources, and warnings as the screen', () => {
    const result = calculateMilitaryRetiredPay({ path: 'regular', system: 'high_36', systemConfirmation: 'official', diems: '2006-06-01', payEntryBaseDate: '2006-06-01', retirementDate: '2027-01-01', ageAtRetirement: 38, creditableService: { years: 20, months: 0, days: 0, provenance: OFFICIAL }, gradePeriods: [{ grade: 'E7', startDate: '2018-01-01' }] });
    const pdf = createMilitaryRetirementReportPdf({ jsPDF: FakePdf, result, generatedAt: 'test' });
    const all = pdf.texts.join('\n');
    expect(pdf.props.title).toBe('Military Retirement Report');
    expect(all).toContain(labelForStatus(result.status));
    expect(all).toContain(`Rules ${result.rulesVersion}`);
    expect(all).toContain(`$${Math.round(result.projectedMonthly).toLocaleString()}`);
    expect(all).toContain('High-36');
    expect(all).toContain('Rounded down to the next lower dollar');
    expect(all).toContain('not an official retired-pay determination');
    expect(all).toContain('not affiliated with or endorsed by DoD');
    for (const i of result.issues) expect(all).toContain(i.code);
    expect(all).toMatch(/1407|High-36/);
    expect(all).toContain(result.inputHash);
  });

  it('renders a severance result as a separation, not a zero-dollar retirement', () => {
    const result = calculateMilitaryRetiredPay({ path: 'medical', system: 'high_36', systemConfirmation: 'official', diems: '2010-06-01', payEntryBaseDate: '2010-06-01', retirementDate: '2026-07-01', gradePeriods: [{ grade: 'E5', startDate: '2022-01-01' }], payBaseOverride: { monthly: 4000, provenance: OFFICIAL }, creditableService: { years: 8, months: 0, days: 0, provenance: OFFICIAL }, medical: { disposition: 'separation_severance', dodDisabilityPercent: 20, monthlyBasicPay: 4000, provenance: OFFICIAL } });
    const pdf = createMilitaryRetirementReportPdf({ jsPDF: FakePdf, result, generatedAt: 'test' });
    const all = pdf.texts.join('\n');
    expect(all).toContain('Medical separation with severance');
    expect(all).toContain('$64,000');
    expect(all).not.toContain('Gross monthly retired pay');
  });
});
