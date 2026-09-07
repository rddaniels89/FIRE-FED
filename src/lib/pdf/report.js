/**
 * The Federal Retirement Projection Report.
 *
 * Every figure here is a reading from the lifetime timeline (see
 * projection/timeline.js) so the PDF cannot disagree with the dashboard. The
 * report describes a projection under stated assumptions; the wording stays
 * descriptive throughout and never tells the reader what to do.
 */

import { buildTimeline } from '../projection/timeline';
import { calculateSocialSecurityBenefit } from '../calculations/socialSecurity';
import { CURRENT_PARAMETER_YEAR } from '../calculations/annualParameters';
import * as rulesRegistry from '../rules/registry';

const MM_A4 = Object.freeze({ width: 210, height: 297 });
const MARGIN = Object.freeze({ left: 15, right: 15, top: 15, bottom: 18, header: 10 });

export const REPORT_TITLE = 'Federal Retirement Projection Report';
export const REPORT_DISCLAIMER = 'Educational projection — not individualized financial advice';

/** Used when the rule registry has nothing to list yet. */
export const FALLBACK_SOURCES = Object.freeze([
  { title: 'FERS eligibility, computation and reductions', source: { name: 'OPM', url: 'https://www.opm.gov/retirement-center/fers-information/' } },
  { title: 'FERS Special Retirement Supplement', source: { name: 'OPM', url: 'https://www.opm.gov/retirement-center/fers-information/types-of-retirement/' } },
  { title: 'FEHB continuation into retirement (five-year rule)', source: { name: 'OPM', url: 'https://www.opm.gov/healthcare-insurance/healthcare/plan-information/' } },
  { title: 'TSP contribution limits and withdrawal rules', source: { name: 'TSP', url: 'https://www.tsp.gov/' } },
  { title: 'Early withdrawal penalty, age 55 separation rule and 72(t)', source: { name: 'IRS', url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-exceptions-to-tax-on-early-distributions' } },
  { title: 'Social Security full retirement age and claiming adjustments', source: { name: 'SSA', url: 'https://www.ssa.gov/benefits/retirement/planner/agereduction.html' } },
  { title: 'Social Security Trustees Report (trust fund depletion)', source: { name: 'SSA', url: 'https://www.ssa.gov/oact/tr/' } },
  { title: 'Medicare Part B premiums and IRMAA', source: { name: 'CMS', url: 'https://www.cms.gov/newsroom/fact-sheets' } },
  { title: 'Federal income tax brackets and standard deduction', source: { name: 'IRS', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments' } },
]);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

function years(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)} years`;
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function age(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
  return text(value)
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

const FEHB_OUTCOME_LABELS = Object.freeze({
  continues: 'Continues into retirement',
  suspended_then_reinstated: 'Suspended at separation, reinstated when the annuity starts',
  lost_permanently: 'Lost at separation',
  not_enrolled_long_enough: 'Lost: fewer than five years enrolled',
});

export function fehbOutcomeLabel(outcome) {
  return FEHB_OUTCOME_LABELS[outcome] ?? titleCase(outcome || 'Not modeled');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * A cursor over the page with the header, page breaks and the primitives the
 * sections are written in. Every section is a sequence of these calls.
 */
function createDoc(pdf, { scenarioName }) {
  const { left, right, top, bottom, header } = MARGIN;
  const width = MM_A4.width - left - right;
  const usableBottom = MM_A4.height - bottom;
  const doc = { pdf, y: top + header, left, right, width };

  const drawHeader = () => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105);
    pdf.text(REPORT_TITLE, left, top);
    const name = text(scenarioName);
    if (name) {
      const w = pdf.getTextWidth(name);
      pdf.text(name, MM_A4.width - right - w, top);
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.line(left, top + 2.5, MM_A4.width - right, top + 2.5);
  };

  doc.newPage = () => {
    pdf.addPage();
    drawHeader();
    doc.y = top + header;
  };

  doc.ensure = (needed) => {
    if (doc.y + needed > usableBottom) doc.newPage();
  };

  doc.section = (number, title) => {
    doc.ensure(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text(number ? `${number}. ${text(title)}` : text(title), left, doc.y);
    doc.y += 5;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(left, doc.y - 1.5, MM_A4.width - right, doc.y - 1.5);
    doc.y += 3;
  };

  doc.subheading = (title) => {
    doc.ensure(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text(text(title), left, doc.y);
    doc.y += 5;
  };

  doc.paragraph = (body, { size = 9.5, color = [51, 65, 85], lineHeight = 4.3 } = {}) => {
    const t = text(body);
    if (!t) return;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(t, width);
    for (const line of lines) {
      doc.ensure(lineHeight + 1);
      pdf.text(line, left, doc.y);
      doc.y += lineHeight;
    }
    doc.y += 1.5;
  };

  doc.bullets = (items) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(51, 65, 85);
    for (const item of items) {
      const t = text(item);
      if (!t) continue;
      const lines = pdf.splitTextToSize(`• ${t}`, width - 3);
      for (const line of lines) {
        doc.ensure(5);
        pdf.text(line, left + 3, doc.y);
        doc.y += 4.3;
      }
    }
    doc.y += 1;
  };

  doc.keyValues = (rows, { labelWidth = 70 } = {}) => {
    const valueX = left + labelWidth;
    const valueWidth = MM_A4.width - right - valueX;
    pdf.setFontSize(9.5);
    for (const row of rows) {
      if (!row) continue;
      const label = text(row.label);
      const value = text(row.value);
      if (!label && !value) continue;
      const lines = pdf.splitTextToSize(value || '—', valueWidth);
      doc.ensure(4.5 * lines.length + 2);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 59);
      pdf.text(label, left, doc.y);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(51, 65, 85);
      for (const line of lines) {
        pdf.text(line, valueX, doc.y);
        doc.y += 4.5;
      }
      doc.y += 0.8;
    }
    doc.y += 1.5;
  };

  /**
   * A grid. `columns` are { label, width?, align? }; `rows` are arrays of
   * cell strings. Widths default to an even split; the header repeats after a
   * page break.
   */
  doc.table = (columns, rows, { fontSize = 8, rowHeight = 4.6 } = {}) => {
    const fixed = columns.reduce((s, c) => s + num(c.width), 0);
    const flexCount = columns.filter((c) => !c.width).length;
    const flexWidth = flexCount > 0 ? Math.max(8, (width - fixed) / flexCount) : 0;
    const widths = columns.map((c) => (c.width ? c.width : flexWidth));

    const drawRow = (cells, { bold = false, fill = null } = {}) => {
      doc.ensure(rowHeight + 1);
      if (fill) {
        pdf.setFillColor(...fill);
        pdf.rect(left, doc.y - rowHeight + 1.2, width, rowHeight, 'F');
      }
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(bold ? 15 : 51, bold ? 23 : 65, bold ? 42 : 85);
      let x = left;
      cells.forEach((cell, i) => {
        const w = widths[i];
        const align = columns[i]?.align ?? (i === 0 ? 'left' : 'right');
        let t = text(cell);
        // Clip rather than wrap: a table row is one line.
        while (t.length > 1 && pdf.getTextWidth(t) > w - 2) t = t.slice(0, -1);
        const tx = align === 'right' ? x + w - 1 - pdf.getTextWidth(t) : x + 1;
        pdf.text(t, tx, doc.y);
        x += w;
      });
      doc.y += rowHeight;
    };

    const drawHeaderRow = () => drawRow(columns.map((c) => c.label), { bold: true, fill: [241, 245, 249] });

    doc.ensure(rowHeight * 3);
    drawHeaderRow();
    for (const row of rows) {
      const before = pdf.getNumberOfPages();
      doc.ensure(rowHeight + 1);
      if (pdf.getNumberOfPages() !== before) drawHeaderRow();
      drawRow(row);
    }
    doc.y += 3;
  };

  doc.image = (label, dataUrl, { height = 90 } = {}) => {
    if (!dataUrl) return;
    doc.ensure(height + 12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 42);
    pdf.text(text(label), left, doc.y);
    doc.y += 5;
    try {
      pdf.addImage(dataUrl, 'PNG', left, doc.y, width, height, undefined, 'FAST');
    } catch {
      // A failed image never fails the report.
    }
    doc.y += height + 8;
  };

  doc.drawHeader = drawHeader;
  return doc;
}

function drawFooters(pdf) {
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    const y = MM_A4.height - 10;
    pdf.text(`FireFed · Educational use only · page ${i}/${pages}`, MARGIN.left, y);
  }
}

// ---------------------------------------------------------------------------
// Readings from the timeline
// ---------------------------------------------------------------------------

function rowAt(rows, targetAge) {
  const a = Math.round(num(targetAge, NaN));
  if (!Number.isFinite(a)) return null;
  return rows.find((r) => r.age === a) ?? null;
}

function balanceBeforeSeparation(timeline) {
  const sep = timeline.plan.separationAge;
  const before = rowAt(timeline.rows, sep - 1);
  return before ? before.balances : rowAt(timeline.rows, sep)?.balances ?? null;
}

function effectiveRateAt(rows, targetAge) {
  const r = rowAt(rows, targetAge);
  if (!r) return null;
  const gross = num(r.totalIncome) + num(r.withdrawals?.total);
  if (gross <= 0) return 0;
  return (num(r.taxes?.total) / gross) * 100;
}

function penaltyYears(rows) {
  return rows.filter((r) => r.phase !== 'working' && num(r.penalties) > 0);
}

/** The rule registry when it has entries, otherwise the static list. */
export function resolveSources() {
  try {
    if (typeof rulesRegistry.listRules === 'function') {
      const list = rulesRegistry.listRules();
      if (Array.isArray(list) && list.length > 0) return list;
    }
    const fromMap = Object.values(rulesRegistry.RULES ?? {});
    if (fromMap.length > 0) return fromMap;
  } catch {
    // fall through to the static list
  }
  return FALLBACK_SOURCES;
}

function timelineAges(timeline, { detailed }) {
  const { plan, rows } = timeline;
  const first = rows[0]?.age ?? 0;
  const last = rows[rows.length - 1]?.age ?? first;
  const fra = Math.round(num(plan.socialSecurity?.fra?.decimal, 67));
  const anchors = [plan.separationAge, plan.annuityStartAge, 62, 65, fra, plan.socialSecurity?.claimAge, last];
  const wanted = new Set(anchors.filter((a) => Number.isFinite(Number(a))).map((a) => Math.round(Number(a))));
  if (detailed) {
    for (let a = first; a <= last; a += 5) wanted.add(a);
  } else {
    wanted.add(first);
    for (let a = first; a <= last; a += 10) wanted.add(a);
  }
  return [...wanted].filter((a) => a >= first && a <= last).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * Builds the report. `timeline` is the deterministic timeline for the scenario
 * (built here when omitted); `fireDate`, `deltas`, `stress`, `monteCarlo` and
 * `comparison` are optional and add their sections when present.
 *
 * `settings.detailLevel` is 'summary' or 'detailed' (the dashboard's 'compact'
 * is read as summary). `settings.includeCharts` embeds `chartImages` (a map of
 * key → PNG data URL; the legacy pensionVsTsp / netWorth keys are labelled).
 */
export function createRetirementReportPdf({
  jsPDF,
  scenario,
  timeline: timelineIn,
  fireDate,
  deltas,
  stress,
  monteCarlo,
  comparison,
  settings,
  chartImages,
  computed,
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const scenarioName = text(scenario?.name || 'Scenario');
  const detailed = (settings?.detailLevel || 'detailed') === 'detailed';
  const includeCharts = Boolean(settings?.includeCharts);
  const generatedAt = text(computed?.generatedAt || new Date().toLocaleString());

  let timeline = timelineIn ?? null;
  if (!timeline && scenario?.profile) {
    try {
      timeline = buildTimeline(scenario);
    } catch {
      timeline = null;
    }
  }

  pdf.setProperties({
    title: `${REPORT_TITLE} - ${scenarioName}`,
    subject: 'Federal retirement projection',
    author: 'FireFed',
  });

  const doc = createDoc(pdf, { scenarioName });

  // ---------------- Cover ----------------
  pdf.setFillColor(241, 245, 249);
  pdf.rect(0, 0, MM_A4.width, 64, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(15, 23, 42);
  pdf.text(REPORT_TITLE, MARGIN.left, 28);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Scenario: ${scenarioName}`, MARGIN.left, 40);
  pdf.text(`Generated: ${generatedAt}`, MARGIN.left, 47);
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(REPORT_DISCLAIMER, MARGIN.left, 56);

  doc.y = 80;
  doc.paragraph(
    'This report is a projection of one federal retirement scenario under the assumptions listed in section 14. Every figure is read from a single year-by-year model: income starts when the federal rules say it starts, withdrawals pay the tax and penalty the rules impose, and the plan is called sustainable when no year records a shortfall through the end age. Figures are nominal (future dollars) unless a line says otherwise.',
    { size: 10 }
  );

  if (!timeline) {
    doc.paragraph('The timeline could not be built for this scenario, so the sections that read from it are omitted.');
    drawFooters(pdf);
    return pdf;
  }

  const { plan, rows, summary, inputs } = timeline;
  const endAge = rows[rows.length - 1]?.age ?? num(inputs?.endAge, 95);
  const sepBalances = balanceBeforeSeparation(timeline);
  const fire = fireDate ?? null;

  // ---------------- 1. Summary ----------------
  doc.section(1, 'Summary');
  doc.keyValues([
    { label: 'Projected sustainable separation age', value: fire ? (fire.found ? `${fire.separationAge} (${fire.yearsFromNow} years from now)` : 'None found through the search limit') : '—' },
    { label: 'Separation age in this scenario', value: age(plan.separationAge) },
    { label: 'Retirement path', value: plan.pathLabel },
    { label: 'Sustainable through end age', value: `${yesNo(summary.isSustainable)} (end age ${endAge})` },
    { label: 'Portfolio at separation', value: money(summary.balanceAtSeparation) },
    { label: 'Bridge', value: `${summary.bridge.years} years, ${pct(summary.bridge.fundedPercent, 0)} funded` },
    { label: 'First shortfall age', value: summary.firstShortfallAge == null ? 'None' : age(summary.firstShortfallAge) },
    { label: 'Portfolio at end age', value: `${money(summary.balanceAtEnd)} (${money(summary.balanceAtEndReal)} in today's dollars)` },
  ]);

  // ---------------- 2. FIRE date ----------------
  doc.section(2, 'Federal FIRE date');
  if (!fire) {
    doc.paragraph('The FIRE date search was not run for this report.');
  } else {
    doc.paragraph(
      fire.found
        ? `The earliest separation age at which the timeline never runs dry is ${fire.separationAge}. Each age below was tested by rebuilding the whole model with that separation age.`
        : 'No separation age up to the search limit kept the timeline solvent through the end age under these inputs.'
    );
    const tried = Array.isArray(fire.tried) ? fire.tried : [];
    const shown = detailed ? tried : tried.slice(Math.max(0, tried.length - 6));
    if (shown.length > 0) {
      doc.table(
        [
          { label: 'Separation age', width: 28 },
          { label: 'Path', width: 48, align: 'left' },
          { label: 'Sustainable', width: 24 },
          { label: 'First shortfall', width: 26 },
          { label: 'Minimum balance', width: 32 },
          { label: 'Bridge funded' },
        ],
        shown.map((t) => [
          age(t.separationAge),
          titleCase(t.path ?? '—'),
          yesNo(t.isSustainable),
          t.firstShortfallAge == null ? '—' : age(t.firstShortfallAge),
          money(t.minBalance),
          pct(t.bridgeFundedPercent, 0),
        ])
      );
    }
  }
  if (deltas?.later || deltas?.earlier) {
    doc.subheading('One year either way');
    const describe = (d, verb) => {
      if (!d) return null;
      const gained = d.thresholdChanges.filter((c) => c.direction === 'gained').map((c) => c.label);
      const lost = d.thresholdChanges.filter((c) => c.direction === 'lost').map((c) => c.label);
      const parts = [
        `${verb} (separating at ${d.to.separationAge}): pension at start ${money(d.from.pensionAnnualAtStart)} to ${money(d.to.pensionAnnualAtStart)}`,
        `portfolio at end ${money(d.from.balanceAtEnd)} to ${money(d.to.balanceAtEnd)}`,
      ];
      if (gained.length) parts.push(`gains ${gained.join(', ')}`);
      if (lost.length) parts.push(`loses ${lost.join(', ')}`);
      return parts.join('; ') + '.';
    };
    doc.bullets([describe(deltas.later, 'One year later'), describe(deltas.earlier, 'One year earlier')].filter(Boolean));
  }

  // ---------------- 3. FERS annuity ----------------
  doc.section(3, 'FERS annuity');
  const annuity = plan.annuity ?? {};
  const survivor = annuity.survivor;
  const fersRows = [
    { label: 'Path', value: plan.pathLabel },
    { label: 'Service at separation', value: `${years(plan.service.eligibilityYears)} for eligibility, ${years(plan.service.computationYears)} for computation` },
    plan.service.sickLeaveYears > 0
      ? { label: 'Unused sick leave credited', value: `${years(plan.service.sickLeaveYears)}${plan.service.creditsSickLeave ? '' : ' (not credited on this path)'}` }
      : null,
    { label: 'High-3 at separation', value: `${money(plan.high3?.high3AtSeparation)} (${plan.high3?.basis === 'career' ? 'from the career simulator' : 'from salary growth'})` },
    { label: 'Multiplier', value: annuity.multiplier ? pct(annuity.multiplier * 100, 1) : '—' },
    { label: 'Age reduction', value: annuity.ageReductionPercent > 0 ? pct(annuity.ageReductionPercent, 1) : 'None' },
    {
      label: 'Survivor election',
      value: survivor
        ? `${titleCase(survivor.election ?? scenario?.fers?.survivorElection ?? 'none')}: ${pct(survivor.reductionPercent ?? 0, 0)} reduction, survivor receives ${money(survivor.survivorAnnualBenefit ?? 0)} a year`
        : titleCase(scenario?.fers?.survivorElection ?? 'none'),
    },
    { label: 'Annuity start age', value: plan.annuityStartAge == null ? 'No annuity' : age(plan.annuityStartAge) },
    { label: 'Annuity at start', value: `${money(annuity.annualAtStart)} a year (${money(annuity.monthlyAtStart)} a month)` },
    { label: "In today's dollars", value: money(annuity.realValueAtStartInTodaysDollars) },
    { label: 'COLA starts', value: `Age ${age(annuity.colaStartAge)}` },
    annuity.nominalFreezeYears > 0
      ? { label: 'Deferred freeze', value: `Fixed in separation-day dollars for ${annuity.nominalFreezeYears} years: ${pct(annuity.purchasingPowerLostToFreeze * 100, 0)} of purchasing power` }
      : null,
  ];
  doc.keyValues(fersRows.filter(Boolean));
  if (plan.reason) doc.paragraph(plan.reason);
  if (detailed && Array.isArray(plan.notes) && plan.notes.length) doc.bullets(plan.notes);

  // ---------------- 4. TSP and portfolio ----------------
  doc.section(4, 'TSP and portfolio');
  const strategies = scenario?.strategies ?? {};
  const strategyList = [
    inputs?.seppEnabled || strategies.sepp?.enabled ? '72(t) substantially equal periodic payments' : null,
    inputs?.rothConversionEnabled || strategies.rothConversion?.enabled ? 'Roth conversion ladder' : null,
    strategies.rolloverRothTspToIra !== false ? 'Roth TSP rolled to a Roth IRA at separation' : null,
  ].filter(Boolean);
  const penaltyRows = penaltyYears(rows);
  doc.keyValues([
    { label: 'Balance today', value: `${money(scenario?.tsp?.currentBalance)} TSP (${money(scenario?.tsp?.rothBalance)} Roth), ${money(scenario?.fire?.taxableBrokerageBalance)} taxable, ${money(scenario?.fire?.cashBalance)} cash` },
    sepBalances
      ? { label: 'At separation', value: `${money(sepBalances.total)} total: ${money(sepBalances.traditional)} Traditional, ${money(sepBalances.roth)} Roth, ${money(sepBalances.taxable)} taxable, ${money(sepBalances.cash)} cash` }
      : null,
    { label: 'Contribution', value: `${pct(scenario?.tsp?.monthlyContributionPercent, 0)} of salary, ${titleCase(scenario?.tsp?.contributionType ?? 'traditional')}` },
    { label: 'Expected return', value: pct(num(inputs?.expectedReturn) * 100, 2) },
    { label: 'Traditional penalty-free from', value: `Age ${age(plan.tspAccess?.traditionalPenaltyFreeAge)}${plan.tspAccess?.usesSeparationYearRule ? ' (separation-year rule)' : ''}` },
    { label: 'Years with early-withdrawal penalties', value: penaltyRows.length > 0 ? `${penaltyRows.length} (ages ${penaltyRows[0].age} to ${penaltyRows[penaltyRows.length - 1].age})` : 'None' },
    { label: 'Cumulative penalties', value: money(summary.cumulativePenalties) },
    { label: 'Strategies enabled', value: strategyList.length ? strategyList.join('; ') : 'None' },
    { label: 'Minimum balance', value: `${money(summary.minBalance)} at age ${age(summary.minBalanceAge)}` },
  ].filter(Boolean));
  if (detailed && Array.isArray(plan.tspAccess?.notes)) doc.bullets(plan.tspAccess.notes);

  // ---------------- 5. Special Retirement Supplement ----------------
  doc.section(5, 'Special Retirement Supplement');
  const srs = plan.srs ?? {};
  if (srs.isEligible) {
    doc.keyValues([
      { label: 'Eligible', value: 'Yes' },
      { label: 'Paid from', value: `Age ${age(srs.startAge)} until 62` },
      { label: 'Amount', value: `${money(srs.annual)} a year (${money(srs.monthly)} a month) before the earnings test` },
      { label: 'Earnings test', value: 'Applied year by year to earned income after separation' },
    ]);
  } else {
    doc.keyValues([
      { label: 'Eligible', value: 'No' },
      { label: 'Reason', value: srs.reason || 'The supplement is paid only with an immediate, unreduced FERS annuity before 62.' },
    ]);
  }

  // ---------------- 6. Bridge ----------------
  doc.section(6, 'Bridge');
  const bridge = summary.bridge;
  const bridgeBalance = num(bridge.assetsAtSeparation) - num(bridge.withdrawalsNeeded);
  doc.paragraph(
    'The bridge is the span after separation in which guaranteed income (annuity, supplement, Social Security, spouse income) is less than spending and healthcare. Its withdrawals come from the portfolio in the funding order cash, taxable, Roth contributions, seasoned conversions, Traditional TSP, Roth earnings.'
  );
  doc.keyValues([
    { label: 'Bridge span', value: bridge.years > 0 ? `${bridge.years} years, age ${bridge.startAge} to ${bridge.endAge}` : 'None: guaranteed income covers outflows from separation' },
    { label: 'Withdrawals needed', value: money(bridge.withdrawalsNeeded) },
    { label: 'Withdrawals funded', value: `${money(bridge.withdrawalsFunded)} (${pct(bridge.fundedPercent, 0)})` },
    { label: 'Assets at separation', value: money(bridge.assetsAtSeparation) },
    { label: bridgeBalance >= 0 ? 'Surplus over bridge need' : 'Shortfall against bridge need', value: money(Math.abs(bridgeBalance)) },
    { label: 'Penalties paid in the bridge', value: money(bridge.penalties) },
  ]);
  if (Array.isArray(bridge.incomeStarts) && bridge.incomeStarts.length) {
    doc.subheading('Income starts');
    doc.bullets(bridge.incomeStarts.map((s) => `${s.source}: age ${age(s.age)}${s.endAge ? ` to ${age(s.endAge)}` : ''}`));
  }

  // ---------------- 7. Social Security ----------------
  doc.section(7, 'Social Security');
  const ss = plan.socialSecurity ?? {};
  let ssAtClaim = null;
  if (num(ss.piaMonthlyAtFra) > 0) {
    try {
      ssAtClaim = calculateSocialSecurityBenefit({ piaMonthlyAtFra: ss.piaMonthlyAtFra, claimAge: ss.claimAge, birthYear: ss.birthYear });
    } catch {
      ssAtClaim = null;
    }
  }
  const haircut = ss.trustFundHaircut;
  doc.keyValues([
    { label: 'Source of the figure', value: ss.mode === 'manual' ? 'SSA statement amount at full retirement age' : ss.mode === 'estimate' ? 'Estimated from salary' : 'Not configured (no benefit modeled)' },
    { label: 'PIA at full retirement age', value: `${money(ss.piaMonthlyAtFra)} a month` },
    { label: 'Full retirement age', value: ss.fra?.label ?? age(ss.fra?.decimal) },
    { label: 'Claim age', value: age(ss.claimAge) },
    ssAtClaim ? { label: 'Benefit at claim', value: `${money(ssAtClaim.monthlyAtClaim)} a month in today's dollars (${pct(num(ssAtClaim.factor) * 100, 1)} of PIA)` } : null,
    { label: 'Trust fund haircut', value: haircut ? `${pct(haircut.percent, 0)} from ${haircut.startYear}` : 'Not modeled' },
  ].filter(Boolean));

  // ---------------- 8. Healthcare ----------------
  doc.section(8, 'Healthcare');
  const fra = Math.round(num(ss.fra?.decimal, 67));
  const healthAt = (a) => {
    const r = rowAt(rows, a);
    return r ? `${titleCase(r.healthcare?.coverageType ?? 'unknown')}: ${money(r.healthcare?.total)} a year` : 'Beyond the timeline';
  };
  doc.keyValues([
    { label: 'FEHB in retirement', value: fehbOutcomeLabel(plan.fehb?.outcome) },
    plan.fehb?.message ? { label: 'Detail', value: plan.fehb.message } : null,
    { label: `At separation (${age(plan.separationAge)})`, value: healthAt(plan.separationAge) },
    { label: 'At 65', value: healthAt(65) },
    { label: 'At 75', value: healthAt(75) },
    { label: 'Premium growth', value: pct(scenario?.healthcare?.premiumGrowthPercent ?? 5, 1) + ' a year' },
    { label: 'Medicare Part B', value: scenario?.healthcare?.enrollInPartB === false ? 'Not enrolled at 65' : 'Enrolled at 65' },
    { label: 'IRMAA', value: scenario?.healthcare?.includeIrmaa ? 'Modeled from MAGI two years prior' : 'Not modeled' },
  ].filter(Boolean));

  // ---------------- 9. Taxes ----------------
  doc.section(9, 'Taxes');
  const state = scenario?.taxes?.state ?? {};
  const rateRows = [plan.separationAge, 65, fra]
    .filter((a, i, arr) => arr.indexOf(a) === i)
    .map((a) => {
      const rate = effectiveRateAt(rows, a);
      return { label: `Effective rate at ${age(a)}`, value: rate == null ? 'Beyond the timeline' : pct(rate, 1) };
    });
  const stateText =
    scenario?.taxes?.includeStateTax === false
      ? 'State tax not modeled'
      : state.code && state.code !== 'NONE'
        ? `${state.code}, ${pct(num(state.rate) * 100, 1)}${state.exemptsFederalPension ? ', exempts the federal pension' : ''}`
        : 'No state income tax modeled';
  doc.keyValues([
    { label: 'Cumulative taxes', value: `${money(summary.cumulativeTaxes)} (federal, state, FICA and penalties, ${rows[0]?.age} to ${endAge})` },
    ...rateRows,
    { label: 'Filing status', value: titleCase(inputs?.filingStatus ?? scenario?.taxes?.filingStatus ?? 'single') },
    { label: 'State', value: stateText },
    { label: 'Tax parameters', value: `${CURRENT_PARAMETER_YEAR} brackets, held constant in real terms` },
  ]);
  doc.paragraph('The effective rate is total tax divided by gross inflows including withdrawals for that year.', { size: 8.5, color: [100, 116, 139] });

  // ---------------- 10. Household timeline ----------------
  doc.section(10, 'Household timeline');
  doc.paragraph(detailed ? 'Every fifth year plus separation, 62, 65 and full retirement age. Nominal dollars.' : 'Selected years. Nominal dollars.', { size: 8.5, color: [100, 116, 139] });
  const hasSpouse = Boolean(scenario?.household?.spouse?.enabled);
  const ages = timelineAges(timeline, { detailed });
  const k = (v) => {
    const n = num(v);
    if (Math.abs(n) < 500) return n === 0 ? '0' : `${Math.round(n)}`;
    return `${Math.round(n / 1000)}k`;
  };
  const columns = [
    { label: 'Age', width: 10 },
    { label: 'Salary', width: 15 },
    { label: 'Pension', width: 15 },
    { label: 'SRS', width: 13 },
    { label: 'SS', width: 14 },
    hasSpouse ? { label: 'Spouse', width: 15 } : null,
    { label: 'Withdr.', width: 16 },
    { label: 'Taxes', width: 15 },
    { label: 'Health', width: 15 },
    { label: 'Spend', width: 16 },
    { label: 'Balance' },
  ].filter(Boolean);
  doc.table(
    columns,
    ages.map((a) => {
      const r = rowAt(rows, a);
      if (!r) return [age(a)];
      return [
        `${r.age}${r.age === plan.separationAge ? '*' : ''}`,
        k(r.salary),
        k(r.pension),
        k(r.srs),
        k(r.socialSecurity),
        hasSpouse ? k(num(r.spouseIncome) + num(r.spouseSocialSecurity) + num(r.spousePension)) : null,
        k(r.withdrawals?.total),
        k(r.taxes?.total),
        k(r.healthcare?.total),
        k(r.spending),
        k(r.balances?.total),
      ].filter((c) => c !== null);
    }),
    { fontSize: 7.5, rowHeight: 4.4 }
  );
  doc.paragraph('* separation year. Withdrawals are portfolio draws including any 72(t) payment; taxes include penalties.', { size: 8, color: [100, 116, 139] });

  // ---------------- 11. Scenario comparison (optional) ----------------
  if (comparison && Array.isArray(comparison.rows) && comparison.rows.length > 0 && Array.isArray(comparison.columns)) {
    doc.section(11, 'Scenario comparison');
    doc.table(
      [{ label: 'Metric', width: 50, align: 'left' }, ...comparison.columns.map((c) => ({ label: text(c) }))],
      comparison.rows.map((r) => [r.label, ...(r.values ?? []).map((v) => text(v))])
    );
  }

  // ---------------- 12. Monte Carlo (optional) ----------------
  if (monteCarlo?.outcomes) {
    doc.section(12, 'Monte Carlo');
    const o = monteCarlo.outcomes;
    const sims = monteCarlo.inputs?.simulations;
    doc.paragraph(
      `${sims ? `${sims} simulations` : 'Each simulation'} of the same timeline with a different sequence of returns drawn from the allocation's mean (${pct(num(monteCarlo.inputs?.meanReturn) * 100, 1)}) and volatility (${pct(num(monteCarlo.inputs?.portfolioStdDev) * 100, 1)}).`
    );
    doc.keyValues([
      { label: 'Probability funds last to end age', value: pct(num(o.probabilityFundsLastToEndAge) * 100, 0) },
      { label: 'Probability the bridge is fully funded', value: o.probabilityFireByDesiredAge == null ? '—' : pct(num(o.probabilityFireByDesiredAge) * 100, 0) },
      { label: 'Balance at end age (p10 / p50 / p90)', value: o.balanceAtEnd ? `${money(o.balanceAtEnd.p10)} / ${money(o.balanceAtEnd.p50)} / ${money(o.balanceAtEnd.p90)}` : '—' },
      { label: 'Minimum balance (p10 / p50 / p90)', value: o.minBalance ? `${money(o.minBalance.p10)} / ${money(o.minBalance.p50)} / ${money(o.minBalance.p90)}` : '—' },
      { label: 'Most vulnerable age', value: o.mostVulnerableAge == null ? '—' : `${age(o.mostVulnerableAge)} (10th percentile balance ${money(o.mostVulnerableP10Balance)})` },
      { label: 'Median first shortfall age', value: o.medianFirstShortfallAge == null ? 'No shortfall in the median case' : age(o.medianFirstShortfallAge) },
    ]);
  }

  // ---------------- 13. Stress tests (optional) ----------------
  if (stress && Array.isArray(stress.results) && stress.results.length > 0) {
    doc.section(13, 'Stress tests');
    doc.paragraph(`${stress.survivedCount} of ${stress.totalCount} tests hold through the end age. Each test reruns the same model with one assumption changed.`);
    doc.table(
      [
        { label: 'Test', width: 40, align: 'left' },
        { label: 'What changes', width: 64, align: 'left' },
        { label: 'Result', width: 26, align: 'left' },
        { label: 'Balance at end' },
      ],
      stress.results.map((r) => [
        r.label,
        r.description ?? '',
        r.survives ? 'Holds' : `Short at ${age(r.firstShortfallAge)}`,
        money(r.balanceAtEnd),
      ])
    );
  }

  // ---------------- 14. Assumptions ----------------
  doc.section(14, 'Assumptions');
  const tsp = scenario?.tsp ?? {};
  const assumptions = scenario?.summary?.assumptions ?? {};
  const alloc = tsp.allocation ?? {};
  doc.keyValues([
    { label: 'Inflation', value: pct(num(inputs?.inflation) * 100, 1) + ' a year' },
    { label: 'Spending inflation', value: assumptions.spendingInflationPercent == null ? 'Same as inflation' : pct(assumptions.spendingInflationPercent, 1) },
    { label: 'Salary growth', value: pct(num(inputs?.salaryGrowth) * 100, 1) + ' a year' },
    { label: 'Expected return', value: `${pct(num(inputs?.expectedReturn) * 100, 2)}${assumptions.expectedReturnPercent == null ? ' (from the TSP allocation)' : ' (entered)'}` },
    { label: 'TSP allocation', value: `G ${num(alloc.G)}%, F ${num(alloc.F)}%, C ${num(alloc.C)}%, S ${num(alloc.S)}%, I ${num(alloc.I)}%` },
    { label: 'End age', value: age(endAge) },
    { label: 'Healthcare cost growth', value: pct(scenario?.healthcare?.premiumGrowthPercent ?? 5, 1) + ' a year' },
    { label: 'Tax year', value: String(CURRENT_PARAMETER_YEAR) },
    { label: 'Spending', value: `${money(num(scenario?.summary?.monthlyExpenses) * 12)} a year while working, ${money(num(scenario?.fire?.monthlyFireIncomeGoal) * 12)} a year after separation, in today's dollars` },
    { label: 'Employer TSP contributions', value: `${tsp.includeAutomatic1Percent === false ? 'No' : 'Yes'} automatic 1%, ${tsp.includeEmployerMatch === false ? 'no' : 'with'} matching` },
    { label: 'Defaults', value: 'Any input left unchanged uses the app default shown on the Assumptions page.' },
  ]);
  doc.bullets([
    'Tax brackets and contribution limits are held at the current parameter year; future indexing is not modeled.',
    'The FERS COLA is the CPI-linked FERS formula applied from the COLA start age.',
    'Roth earnings withdrawn before qualification are taxed and penalised; Roth contributions are not.',
    'The model is annual: mid-year separations and partial years are rounded to whole ages.',
  ]);

  // ---------------- 15. Sources ----------------
  doc.section(15, 'Sources');
  const sources = resolveSources();
  doc.table(
    [
      { label: 'Rule', width: 66, align: 'left' },
      { label: 'Source', width: 18, align: 'left' },
      { label: 'Rule year', width: 16 },
      { label: 'Verified', width: 22 },
      { label: 'URL', align: 'left' },
    ],
    sources.map((s) => [
      s.title ?? s.name ?? s.id ?? '',
      s.source?.name ?? '',
      s.ruleYear ?? '',
      s.lastVerified ?? '',
      s.source?.url ?? '',
    ]),
    { fontSize: 7, rowHeight: 4.2 }
  );

  // ---------------- Charts (optional) ----------------
  const images = chartImages && typeof chartImages === 'object' ? Object.entries(chartImages).filter(([, v]) => Boolean(v)) : [];
  if (includeCharts && images.length > 0) {
    doc.newPage();
    doc.section(null, 'Charts');
    const labels = { pensionVsTsp: 'Pension vs TSP share', netWorth: 'Net worth growth', balances: 'Portfolio balance by age' };
    for (const [key, dataUrl] of images) doc.image(labels[key] ?? titleCase(key), dataUrl);
  }

  drawFooters(pdf);
  return pdf;
}
