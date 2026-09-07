import { describe, expect, it } from 'vitest';
import { FALLBACK_SOURCES, REPORT_DISCLAIMER, REPORT_TITLE, createRetirementReportPdf, resolveSources } from '../report';
import { buildTimeline } from '../../projection/timeline';
import { findFireDate } from '../../projection/fireDate';
import { oneYearDeltas } from '../../projection/deltas';
import { runStressTests } from '../../analytics/stressTests';
import { runMonteCarloAnalytics } from '../../analytics/monteCarlo';
import { createDefaultScenario, normalizeScenario } from '../../scenarios/schema';

/** A jsPDF stand-in that records every string written to a page. */
class MockPdf {
  constructor() {
    this.pages = 1;
    this.texts = [];
    this.images = 0;
    this.currentPage = 1;
    this.textsByPage = { 1: [] };
  }
  setProperties(props) {
    this.props = props;
  }
  setFillColor() {}
  rect() {}
  setFont() {}
  setFontSize() {}
  setTextColor() {}
  text(t) {
    this.texts.push(String(t));
    (this.textsByPage[this.currentPage] ??= []).push(String(t));
  }
  splitTextToSize(text, maxWidth) {
    // Roughly 2mm per character: enough to exercise wrapping without a font.
    const perLine = Math.max(10, Math.floor(maxWidth / 2));
    const s = String(text);
    const out = [];
    for (let i = 0; i < s.length; i += perLine) out.push(s.slice(i, i + perLine));
    return out.length ? out : [''];
  }
  addPage() {
    this.pages += 1;
    this.currentPage = this.pages;
  }
  setDrawColor() {}
  line() {}
  getTextWidth(t) {
    return String(t).length * 1.8;
  }
  addImage() {
    this.images += 1;
  }
  getNumberOfPages() {
    return this.pages;
  }
  setPage(n) {
    this.currentPage = n;
  }
  save() {}
}

const scenario = () =>
  normalizeScenario({
    ...createDefaultScenario('Report test'),
    profile: { currentAge: 45, separationAge: 57, socialSecurityClaimAge: 67 },
    tsp: { currentBalance: 500000, annualSalary: 120000, monthlyContributionPercent: 12, annualSalaryGrowthRate: 2, inflationRate: 2.5 },
    fers: { yearsOfService: 18, high3Salary: 115000 },
    fire: { monthlyFireIncomeGoal: 5500, sideHustleIncome: 0 },
    summary: { monthlyExpenses: 5000, socialSecurity: { mode: 'manual', monthlyBenefit: 2500 } },
  });

const joined = (pdf) => pdf.texts.join('\n');

describe('the Federal Retirement Projection Report', () => {
  it('builds every section from the timeline and the analytics passed in', () => {
    const s = scenario();
    const timeline = buildTimeline(s);
    const fireDate = findFireDate(s);
    const deltas = oneYearDeltas(s, { baseTimeline: timeline });
    const stress = runStressTests(s, { baseTimeline: timeline });
    const monteCarlo = runMonteCarloAnalytics({ scenario: s, settings: { simulations: 100, seed: 7 } });

    const pdf = createRetirementReportPdf({
      jsPDF: MockPdf,
      scenario: s,
      timeline,
      fireDate,
      deltas,
      stress,
      monteCarlo,
      comparison: {
        columns: ['Report test', 'Leave at 60'],
        rows: [{ label: 'Separation age', values: ['57', '60'] }],
      },
      settings: { detailLevel: 'detailed', includeCharts: false },
      chartImages: {},
      computed: { generatedAt: '2026-01-01' },
    });

    expect(pdf).toBeInstanceOf(MockPdf);
    expect(pdf.props.title).toContain(REPORT_TITLE);

    const all = joined(pdf);
    expect(all).toContain(REPORT_TITLE);
    expect(all).toContain('Scenario: Report test');
    expect(all).toContain('Generated: 2026-01-01');
    expect(all).toContain(REPORT_DISCLAIMER);

    for (const heading of [
      '1. Summary',
      '2. Federal FIRE date',
      '3. FERS annuity',
      '4. TSP and portfolio',
      '5. Special Retirement Supplement',
      '6. Bridge',
      '7. Social Security',
      '8. Healthcare',
      '9. Taxes',
      '10. Household timeline',
      '11. Scenario comparison',
      '12. Monte Carlo',
      '13. Stress tests',
      '14. Assumptions',
      '15. Sources',
    ]) {
      expect(all).toContain(heading);
    }

    // Readings, not placeholders.
    expect(all).toContain(`${fireDate.separationAge} (${fireDate.yearsFromNow} years from now)`);
    expect(all).toContain(timeline.plan.pathLabel);
    expect(all).toContain('Probability funds last to end age');
    expect(all).toContain('One year either way');
    for (const r of stress.results) expect(all).toContain(r.label.slice(0, 10));
    expect(all).toContain('Leave at 60');
  });

  it('numbers every page in the footer with the scenario in the header', () => {
    const s = scenario();
    const pdf = createRetirementReportPdf({
      jsPDF: MockPdf,
      scenario: s,
      timeline: buildTimeline(s),
      settings: { detailLevel: 'detailed', includeCharts: false },
    });
    const pages = pdf.getNumberOfPages();
    expect(pages).toBeGreaterThan(2);
    for (let i = 1; i <= pages; i++) {
      expect(pdf.texts).toContain(`FireFed · Educational use only · page ${i}/${pages}`);
    }
    // Every page after the cover carries the running header.
    for (let i = 2; i <= pages; i++) {
      expect(pdf.textsByPage[i]).toContain('Report test');
    }
  });

  it('never tells the reader what to do', () => {
    const s = scenario();
    const timeline = buildTimeline(s);
    const pdf = createRetirementReportPdf({
      jsPDF: MockPdf,
      scenario: s,
      timeline,
      fireDate: findFireDate(s),
      deltas: oneYearDeltas(s, { baseTimeline: timeline }),
      stress: runStressTests(s, { baseTimeline: timeline }),
      settings: { detailLevel: 'detailed', includeCharts: false },
    });
    const all = joined(pdf).toLowerCase();
    expect(all).not.toMatch(/recommend/);
    expect(all).not.toMatch(/\bshould\b/);
    // The only "advice" is the disclaimer saying this is not it.
    const withoutDisclaimer = all.split(REPORT_DISCLAIMER.toLowerCase()).join('');
    expect(withoutDisclaimer).not.toMatch(/advice/);
  });

  it('summary detail level is shorter than detailed and omits the optional sections it was not given', () => {
    const s = scenario();
    const timeline = buildTimeline(s);
    const detailed = createRetirementReportPdf({ jsPDF: MockPdf, scenario: s, timeline, fireDate: findFireDate(s), settings: { detailLevel: 'detailed' } });
    const summary = createRetirementReportPdf({ jsPDF: MockPdf, scenario: s, timeline, fireDate: findFireDate(s), settings: { detailLevel: 'summary' } });
    expect(summary.texts.length).toBeLessThan(detailed.texts.length);
    const all = joined(summary);
    expect(all).not.toContain('11. Scenario comparison');
    expect(all).not.toContain('12. Monte Carlo');
    expect(all).not.toContain('13. Stress tests');
    expect(all).toContain('14. Assumptions');
  });

  it('embeds chart images only when asked', () => {
    const s = scenario();
    const timeline = buildTimeline(s);
    const images = { netWorth: 'data:image/png;base64,AAAA', balances: 'data:image/png;base64,BBBB' };
    const withCharts = createRetirementReportPdf({ jsPDF: MockPdf, scenario: s, timeline, settings: { includeCharts: true }, chartImages: images });
    const without = createRetirementReportPdf({ jsPDF: MockPdf, scenario: s, timeline, settings: { includeCharts: false }, chartImages: images });
    expect(withCharts.images).toBe(2);
    expect(without.images).toBe(0);
    expect(joined(withCharts)).toContain('Portfolio balance by age');
  });

  it('builds the timeline itself when only a scenario is passed', () => {
    const pdf = createRetirementReportPdf({ jsPDF: MockPdf, scenario: scenario(), settings: { detailLevel: 'summary' } });
    expect(joined(pdf)).toContain('10. Household timeline');
  });

  it('still returns a document for a scenario without a profile', () => {
    const pdf = createRetirementReportPdf({ jsPDF: MockPdf, scenario: { name: 'Bare' }, settings: {} });
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(joined(pdf)).toContain('Scenario: Bare');
  });

  it('lists sources from the registry or the static fallback', () => {
    const sources = resolveSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(typeof (src.title ?? src.name ?? src.id)).toBe('string');
    }
    expect(FALLBACK_SOURCES.some((s) => s.source.url.includes('opm.gov'))).toBe(true);
    expect(FALLBACK_SOURCES.some((s) => s.source.url.includes('tsp.gov'))).toBe(true);
    expect(FALLBACK_SOURCES.some((s) => s.source.url.includes('ssa.gov'))).toBe(true);
    expect(FALLBACK_SOURCES.some((s) => s.source.url.includes('irs.gov'))).toBe(true);
  });
});
