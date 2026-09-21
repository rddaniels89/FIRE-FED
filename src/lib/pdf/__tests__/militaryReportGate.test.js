import { describe, expect, it } from 'vitest';
import { createRetirementReportPdf } from '../report';
import { applyScenarioUpdates, createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

class FakePdf {
  constructor() {
    this.texts = [];
    this.pages = 1;
  }
  setProperties() {}
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
  addImage() {}
}

const scenario = () =>
  applyScenarioUpdates(normalizeScenario({ ...createDefaultScenario('g'), profile: { currentAge: 50, separationAge: 57 } }), {
    military: { connection: 'self', incomeStreams: [{ id: 'va', type: 'va_disability', grossAmount: 1500, frequency: 'monthly', amountStatus: 'official', officialAmountAsOfDate: '2026-01-01' }] },
  });

describe('household report military pages behind the launch gate', () => {
  it('prints the military pages when allowed, and a plain omission note when they are Pro', () => {
    const allowed = createRetirementReportPdf({ jsPDF: FakePdf, scenario: scenario(), settings: { detailLevel: 'detailed' }, computed: { militaryPdfAllowed: true } });
    const allowedText = allowed.texts.join('\n');
    expect(allowedText).toContain('Military service and income');
    expect(allowedText).toContain('VA disability compensation');

    const gated = createRetirementReportPdf({ jsPDF: FakePdf, scenario: scenario(), settings: { detailLevel: 'detailed' }, computed: { militaryPdfAllowed: false } });
    const gatedText = gated.texts.join('\n');
    expect(gatedText).toContain('Military service and income');
    expect(gatedText).toContain('are part of Pro and are omitted here');
    expect(gatedText).not.toContain('Service recorded');
    expect(allowedText).toContain('Service recorded');
    // Never implies completeness.
    expect(gatedText).toContain('at no charge');
  });
});
