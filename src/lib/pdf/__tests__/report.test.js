import { describe, expect, it } from 'vitest';
import { createRetirementReportPdf } from '../report';

describe('pdf report', () => {
  it('exports createRetirementReportPdf and returns a jsPDF instance', () => {
    class MockPdf {
      constructor() {
        this.pages = 1;
      }
      setProperties() {}
      setFillColor() {}
      rect() {}
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      text() {}
      splitTextToSize(text) {
        return [String(text)];
      }
      addPage() {
        this.pages += 1;
      }
      setDrawColor() {}
      line() {}
      getTextWidth() {
        return 10;
      }
      addImage() {}
      getNumberOfPages() {
        return this.pages;
      }
      setPage() {}
      save() {}
    }

    const pdf = createRetirementReportPdf({
      jsPDF: MockPdf,
      scenario: { name: 'Test' },
      settings: { detailLevel: 'summary', includeCharts: false },
      chartImages: {},
      computed: {
        generatedAt: '2026-01-01',
        swr: 0.04,
        totalNetWorthAtRetirement: 1000000,
        totalAnnualIncomeEstimate: 80000,
      },
    });

    expect(pdf).toBeInstanceOf(MockPdf);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(0);
  });
});
