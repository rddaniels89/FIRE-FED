/**
 * The Military Retirement Report: one calculation from the Military
 * Retirement Calculator as a PDF, with the same inputs, outputs, status
 * labels, sources, and rules version the screen showed (spec §16, §17).
 *
 * Built on the same document primitives as the household report so the two
 * never disagree in style or in figures.
 */

import { createDoc, drawFooters } from './report';
import { labelForStatus } from '../military/status';
import { getRule } from '../rules/registry';

const MM_A4_WIDTH = 210;
const LEFT = 15;

const money = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : `$${Math.round(Number(n)).toLocaleString()}`);
const money2 = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (f) => (f === null || f === undefined ? '—' : `${(Number(f) * 100).toFixed(2)}%`);
const text = (v) => (v === null || v === undefined ? '—' : String(v));

function stepValue(s) {
  if (s.value === null || s.value === undefined) return '—';
  if (s.unit === 'fraction') return pct(s.value);
  if (s.unit === 'monthly' || s.unit === 'usd') return money2(s.value);
  if (typeof s.value === 'number') return s.value.toLocaleString();
  return String(s.value);
}

/**
 * Renders a calculation result to a jsPDF document.
 *
 *   jsPDF       the constructor (dynamically imported by the caller)
 *   result      from calculateMilitaryRetiredPay
 *   generatedAt optional display string
 */
export function createMilitaryRetirementReportPdf({ jsPDF, result, generatedAt = new Date().toLocaleString(), title = 'Military Retirement Report' }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setProperties({ title, subject: 'Military retired pay estimate', author: 'FireFed' });
  const doc = createDoc(pdf, { scenarioName: labelForStatus(result.status) });

  pdf.setFillColor(241, 245, 249);
  pdf.rect(0, 0, MM_A4_WIDTH, 56, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title, LEFT, 26);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Generated: ${generatedAt}   Status: ${labelForStatus(result.status)}   Rules ${text(result.rulesVersion)}   Engine ${text(result.engineVersion)}`, LEFT, 36);
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text('This is a planning calculation, not an official retired-pay determination. Your service and DFAS records control.', LEFT, 44);
  pdf.text('Independent educational planning tool; not affiliated with or endorsed by DoD, DFAS, VA, OPM, or any military service.', LEFT, 49);
  doc.y = 68;

  const inputs = result.inputs ?? {};
  const isReserve = inputs.path === 'reserve_nonregular';
  const special = result.special ?? null;

  doc.section(1, 'Result');
  if (special?.kind === 'severance') {
    doc.keyValues([
      { label: 'Path', value: 'Medical separation with severance (not a retirement)' },
      { label: 'Severance pay (one time)', value: money(special.severance.lumpSum) },
      { label: 'Years counted / bounded', value: `${special.severance.yearsBeforeBounds} / ${special.severance.years}` },
      { label: 'Monthly basic pay used', value: money2(special.severance.monthlyBasicPay) },
    ]);
  } else if (result.grossMonthly === null || result.grossMonthly === undefined) {
    doc.paragraph('No figure: the items in section 4 say what is missing or needs an official answer.');
  } else {
    doc.keyValues([
      { label: 'Gross monthly retired pay', value: `${money(result.projectedMonthly)} (${money(result.projectedMonthly * 12)} a year, first-payment dollars)${result.reconciliation ? `; official amount shown, FireFed computed ${money(result.grossMonthly)}` : ''}` },
      { label: 'Retired pay starts', value: text(result.retiredPayStartDate) },
      { label: 'Path', value: text(inputs.path).replace(/_/g, ' ') + (special ? ` (${special.kind === 'chapter61' ? `Chapter 61, ${special.method} method` : special.kind.toUpperCase()})` : '') },
      { label: 'Retirement system', value: `${text(result.systemLabel)}${result.systemConfirmed ? ' (confirmed)' : ' (not confirmed)'}` },
      { label: 'Retired-pay base', value: `${money2(result.payBase?.monthly)} (${text(result.payBase?.method).replace(/_/g, ' ')})` },
      isReserve
        ? { label: 'Service basis', value: `${result.reserve.points.totalPoints.toLocaleString()} points = ${result.reserve.equivalent.equivalentYears.toFixed(4)} years; ${text(result.reserve.points.qualifyingYears)} qualifying years` }
        : { label: 'Service basis', value: `${text(result.service?.months)} whole months (${result.service?.official ? 'official' : 'estimate'})` },
      { label: 'Multiplier', value: `${pct(result.multiplier?.multiplier)}${result.multiplier?.capApplied ? ' (capped)' : ''}` },
      { label: 'Rounding', value: `${money2(result.grossMonthlyUnrounded)} rounded down to ${money(result.grossMonthly)}` },
      { label: 'COLA', value: `Future years at ${pct(inputs.assumptions?.inflation)}; first adjustment prorated by quarter (pending verification)` },
    ]);
  }

  doc.section(2, 'Formula audit');
  doc.table(
    [
      { label: 'Step', width: 78, align: 'left' },
      { label: 'Displayed' },
      { label: 'Unrounded' },
      { label: 'Rule', width: 40, align: 'left' },
    ],
    (result.steps ?? []).map((s) => [text(s.label), stepValue(s), s.unrounded !== undefined && s.unrounded !== null ? String(s.unrounded) : '', text(s.ruleId)])
  );

  if (result.payBase?.method === 'high_36' && result.payBase.months?.length) {
    doc.section(3, 'Pay-base table (the 36 highest months)');
    doc.table(
      [
        { label: 'Month', width: 20, align: 'left' },
        { label: 'Grade', width: 18, align: 'left' },
        { label: 'YOS' },
        { label: 'Monthly' },
        { label: 'Table', width: 24, align: 'left' },
        { label: 'Basis', width: 22, align: 'left' },
      ],
      result.payBase.months.map((m) => [m.month, text(m.gradeLabel), m.yearsOfService === null ? '?' : m.yearsOfService.toFixed(2), money2(m.monthly), text(m.tableDate), m.assumed ? 'projected' : m.derived ? 'derived' : m.verified ? 'published' : 'unverified'])
    );
  } else {
    doc.section(3, 'Pay base');
    doc.keyValues([
      { label: 'Method', value: text(result.payBase?.method).replace(/_/g, ' ') },
      { label: 'Monthly', value: money2(result.payBase?.monthly) },
      result.payBase?.tableDate ? { label: 'Table', value: text(result.payBase.tableDate) } : null,
    ].filter(Boolean));
  }

  doc.section(4, 'Issues, warnings, and notes');
  const issues = result.issues ?? [];
  if (issues.length === 0) doc.paragraph('None.');
  for (const sev of ['block', 'warning', 'info']) {
    const list = issues.filter((i) => i.severity === sev);
    if (list.length === 0) continue;
    doc.subheading(sev === 'block' ? 'Stops the calculation' : sev === 'warning' ? 'Check this' : 'Notes');
    doc.bullets(list.map((i) => `${i.code}: ${i.message}`));
  }

  doc.section(5, 'Data quality');
  const dq = result.dataQuality ?? {};
  doc.keyValues([
    { label: 'Official', value: (dq.official ?? []).join(', ') || 'none' },
    { label: 'Estimated', value: (dq.estimated ?? []).join(', ') || 'none' },
    { label: 'Defaulted', value: (dq.defaulted ?? []).join(', ') || 'none' },
    { label: 'Missing', value: (dq.missing ?? []).join(', ') || 'none' },
  ]);

  doc.section(6, 'Inputs');
  doc.keyValues([
    { label: 'Path / system / confirmation', value: `${text(inputs.path)} / ${text(inputs.system)} / ${text(inputs.systemConfirmation)}` },
    { label: 'DIEMS / PEBD / retirement date', value: `${text(inputs.diems)} / ${text(inputs.payEntryBaseDate)} / ${text(inputs.retirementDate)}` },
    inputs.creditableService ? { label: 'Creditable service', value: `${inputs.creditableService.years}y ${inputs.creditableService.months}m ${inputs.creditableService.days}d (${inputs.creditableService.provenance})` } : null,
    { label: 'Grade periods', value: (inputs.gradePeriods ?? []).map((g) => `${g.grade} from ${text(g.startDate)}${g.endDate ? ` to ${g.endDate}` : ''}`).join('; ') || '—' },
    inputs.reserve ? { label: 'Reserve points / qualifying years', value: `${text(inputs.reserve.officialTotalPoints)} / ${text(inputs.reserve.officialQualifyingYears)} (${inputs.reserve.pointsProvenance})` } : null,
    inputs.medical ? { label: 'Medical disposition / DoD percentage', value: `${text(inputs.medical.disposition)} / ${text(inputs.medical.dodDisabilityPercent)}% (${inputs.medical.provenance})` } : null,
    inputs.tera ? { label: 'TERA authority / approval', value: `${text(inputs.tera.authorityName)} / ${text(inputs.tera.approvalDate)} (${inputs.tera.provenance})` } : null,
    { label: 'Assumptions', value: `basic pay growth ${pct(inputs.assumptions?.basicPayGrowth)}, inflation ${pct(inputs.assumptions?.inflation)}` },
    { label: 'Input hash', value: text(result.inputHash) },
  ].filter(Boolean));

  doc.section(7, 'Sources');
  const ruleIds = [...new Set((result.steps ?? []).map((s) => s.ruleId).filter(Boolean))];
  const rules = ruleIds.map((id) => getRule(id)).filter(Boolean);
  doc.bullets(rules.map((r) => `${r.title}: ${r.source?.name ?? ''} ${r.source?.url ?? ''}${r.statute ? ` (${r.statute})` : ''}; verified ${r.lastVerified ?? '—'}`));
  doc.paragraph('Educational planning estimate, not legal, tax, investment, benefits, or claims advice. Official records and agency determinations control.', { size: 8, color: [100, 116, 139] });

  drawFooters(pdf);
  return pdf;
}
