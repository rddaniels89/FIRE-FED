import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../../lib/telemetry';
import { useAuth } from '../../contexts/AuthContext';
import { useScenario } from '../../contexts/ScenarioContext';
import { calculateMilitaryRetiredPay } from '../../lib/military/retirement/calculate';
import { CALCULATION_PATHS, RETIREMENT_SYSTEMS, SYSTEM_CONFIRMATION, SYSTEM_LABELS, suggestMilitaryRetirementSystem } from '../../lib/military/retirement/system';
import { GRADES, gradeLabel } from '../../lib/military/retirement/payTables';
import { REDUCED_AGE_AUTHORITIES, RETIRED_RESERVE_STATUSES } from '../../lib/military/retirement/reserve';
import { saveRetirementCalculation } from '../../lib/military/retirement/connect';
import { formToInputs } from './militaryCalculatorForm';
import { createMilitaryRetirementReportPdf } from '../../lib/pdf/militaryReport';
import { INPUT_PROVENANCE, ISSUE_SEVERITY, MILITARY_RESULT_STATUS } from '../../lib/military/status';
import { MILITARY_CONNECTIONS } from '../../lib/scenarios/schema';
import MilitaryIssues, { StatusBadge } from '../plan/MilitaryIssues';
import HowCalculated from '../HowCalculated';

/**
 * Military Retirement Calculator (spec §20.13, §20.14): the public surface of
 * the retired-pay engine. Anonymous and client-side; nothing is sent anywhere.
 *
 * Entry choice → three modes (quick, detailed, official reconciliation) →
 * result cards → formula audit, pay-base table, service audit, data quality.
 * When the visitor is signed in, the result can be connected to their plan as
 * a linked income stream; the plan reads the amount from the saved
 * calculation and never keeps an editable copy.
 */

const money = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `$${Math.round(Number(n)).toLocaleString()}`);
const money2 = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (f) => `${(Number(f) * 100).toFixed(2)}%`;
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? v : null);

const PATHS = [
  { id: CALCULATION_PATHS.REGULAR, label: 'Active or regular retirement', hint: '20 or more years of active service.' },
  { id: CALCULATION_PATHS.RESERVE_NONREGULAR, label: 'Guard or Reserve retirement based on points', hint: 'Twenty qualifying years; pay usually begins at 60.' },
  { id: CALCULATION_PATHS.MEDICAL, label: 'Official medical retirement', hint: 'Chapter 61, from an official DoD percentage.' },
  { id: CALCULATION_PATHS.TERA, label: 'Official TERA retirement', hint: 'Temporary Early Retirement Authority, 15 to 19 years.' },
  { id: CALCULATION_PATHS.ALREADY_RETIRED, label: 'I already receive retired pay and want to check the model', hint: 'Enter your statement figure and see the difference.' },
  { id: 'unsure', label: 'I am not sure', hint: 'A short explanation of the paths. It cannot declare eligibility.' },
];

const MODES = [
  { id: 'quick', label: 'Quick estimate', hint: 'First visit or a hypothetical. Usually an estimate.' },
  { id: 'detailed', label: 'Detailed estimate', hint: 'Complete grade history and official figures.' },
  { id: 'reconcile', label: 'Official reconciliation', hint: 'You have a service estimate or a statement.' },
];

const HEADER = 'Estimate military retired pay and see every input behind the result.';
const STATUS_NOTICE = 'This is a planning calculation, not an official retired-pay determination. Your service and DFAS records control.';
const RESERVE_NOTICE = 'Retirement points affect the pension multiplier; qualifying years and retired-pay age are separate tests.';
const MEDICAL_NOTICE = 'FireFed uses the official DoD percentage you enter. It does not evaluate medical fitness or disability.';
const FEDERAL_CONNECTION = 'Use this same result in your Military + Federal Plan—no retyping.';
const INDEPENDENCE = 'Independent educational planning tool; not affiliated with or endorsed by DoD, DFAS, VA, OPM, or any military service.';

const today = () => new Date().toISOString().slice(0, 10);

const defaultForm = () => ({
  path: '',
  mode: 'quick',
  system: '',
  systemConfirmation: SYSTEM_CONFIRMATION.SUGGESTED,
  diems: '',
  cbsElected: false,
  brsOptIn: false,
  payEntryBaseDate: '',
  retirementDate: '',
  ageAtRetirement: '',
  serviceYears: '20',
  serviceMonths: '0',
  serviceDays: '0',
  serviceProvenance: INPUT_PROVENANCE.USER_ESTIMATE,
  gradePeriods: [{ id: 'g1', grade: 'E7', startDate: '', endDate: '' }],
  retiredGradeConfirmed: false,
  inflationPct: '2.5',
  basicPayGrowthPct: '3.0',
  officialMonthlyGross: '',
  officialAsOfDate: '',
  medical: { disposition: 'unknown', dodDisabilityPercent: '', vaRating: '', tdrlPlacementDate: '', combatRelated: '', monthlyBasicPay: '', provenance: INPUT_PROVENANCE.USER_ESTIMATE },
  tera: { authorityName: '', approvalDate: '', provenance: INPUT_PROVENANCE.USER_ESTIMATE },
  reserve: {
    officialTotalPoints: '',
    officialQualifyingYears: '',
    pointsProvenance: INPUT_PROVENANCE.USER_ESTIMATE,
    birthDate: '',
    retiredReserveStatus: RETIRED_RESERVE_STATUSES.UNKNOWN,
    separationDate: '',
    officialEligibilityDate: '',
    reducedAgePeriods: [],
    retirementYears: [],
  },
});

let seq = 0;
const nextId = (p) => `${p}${(seq += 1)}`;

function Field({ id, label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Card({ title, children, testId }) {
  return (
    <div className="card p-5" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-1 text-slate-900 dark:text-white">{children}</div>
    </div>
  );
}

export default function PublicMilitaryRetirementCalculator() {
  const [form, setForm] = useState(defaultForm);
  const [view, setView] = useState('audit');
  const [saved, setSaved] = useState(null);
  const { isAuthenticated } = useAuth();
  const { currentScenario, updateCurrentScenario } = useScenario();

  const hasEngaged = useRef(false);
  const markEngaged = () => {
    if (hasEngaged.current) return;
    hasEngaged.current = true;
    trackEvent('public_calculator_engaged', { calculator: 'military_retirement' });
  };
  const patch = (p) => {
    markEngaged();
    setForm((f) => ({ ...f, ...p }));
  };
  const patchReserve = (p) => patch({ reserve: { ...form.reserve, ...p } });
  const set = (k) => (e) => patch({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setR = (k) => (e) => patchReserve({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const isReserve = form.path === CALCULATION_PATHS.RESERVE_NONREGULAR;
  const calculable = [CALCULATION_PATHS.REGULAR, CALCULATION_PATHS.RESERVE_NONREGULAR, CALCULATION_PATHS.ALREADY_RETIRED, CALCULATION_PATHS.MEDICAL, CALCULATION_PATHS.TERA].includes(form.path);
  const suggestion = useMemo(() => suggestMilitaryRetirementSystem({ diems: dateOrNull(form.diems), cbsElected: form.cbsElected, brsOptIn: form.brsOptIn }), [form.diems, form.cbsElected, form.brsOptIn]);

  const inputs = useMemo(() => formToInputs(form), [form]);
  const result = useMemo(() => (calculable ? calculateMilitaryRetiredPay(inputs) : null), [inputs, calculable]);

  const canSave = isAuthenticated && currentScenario && result && result.grossMonthly !== null && result.status !== MILITARY_RESULT_STATUS.NOT_SUPPORTED && !result.issues.some((i) => i.severity === ISSUE_SEVERITY.BLOCK);

  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    if (!result || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = createMilitaryRetirementReportPdf({ jsPDF, result });
      pdf.save(`firefed-military-retirement-${today()}.pdf`);
      trackEvent('pdf_export_succeeded', { calculator: 'military_retirement' });
    } catch (e) {
      trackEvent('pdf_export_failed', { calculator: 'military_retirement', message: e?.message || 'unknown' });
    } finally {
      setPdfBusy(false);
    }
  };
  const saveToPlan = async () => {
    const military = currentScenario.military ?? {};
    const out = saveRetirementCalculation(military, { result, inputs: result.inputs, name: `${result.systemLabel ?? 'Retired pay'} · ${isReserve ? 'Reserve' : 'Active'} · ${today()}` });
    const connection = military.connection && military.connection !== MILITARY_CONNECTIONS.NONE ? military.connection : MILITARY_CONNECTIONS.SELF;
    await updateCurrentScenario({ military: { connection, retirementScenarios: out.military.retirementScenarios, incomeStreams: out.military.incomeStreams } });
    trackEvent('military_calculation_saved', { path: form.path, status: result.status });
    setSaved(out);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Military Retirement Calculator</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl">{HEADER}</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-3xl" data-testid="status-notice">{STATUS_NOTICE}</p>

      {/* 1. Entry choice */}
      <fieldset className="card p-6 mt-8">
        <legend className="text-xl font-semibold navy-text px-1">Which path are you estimating?</legend>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {PATHS.map((p) => (
            <label key={p.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${form.path === p.id ? 'border-navy-500 bg-navy-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" name="mrt-path" value={p.id} checked={form.path === p.id} onChange={() => patch({ path: p.id })} className="mt-1" />
              <span>
                <span className="block font-medium text-slate-900 dark:text-white">{p.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {form.path === 'unsure' && (
        <div className="card p-6 mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200" data-testid="unsure-explainer">
          <h2 className="text-lg font-semibold navy-text">The paths, in plain terms</h2>
          <p><strong>Active or regular retirement</strong> follows 20 or more years of active service. Pay begins when you retire and is based on your service and your basic pay.</p>
          <p><strong>Guard or Reserve retirement</strong> is earned in retirement points across 20 qualifying years. Pay usually starts at 60, and the pension is based on all your points divided by 360.</p>
          <p><strong>Medical retirement</strong> and <strong>TERA</strong> are official determinations. FireFed can only work from the figures on the orders themselves.</p>
          <p>None of this tells you which path you are on. Your service record, your points statement, or your orders do. Pick the path that matches them above.</p>
        </div>
      )}

      {calculable && (
        <div className="grid lg:grid-cols-2 gap-8 mt-8">
          {/* Inputs */}
          <div className="space-y-6">
            <fieldset className="card p-6">
              <legend className="text-lg font-semibold navy-text px-1">How much detail do you have?</legend>
              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                {MODES.map((m) => (
                  <label key={m.id} className={`rounded-lg border p-3 cursor-pointer ${form.mode === m.id ? 'border-navy-500 bg-navy-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700'}`}>
                    <input type="radio" name="mrt-mode" value={m.id} checked={form.mode === m.id} onChange={() => patch({ mode: m.id })} className="mr-2" />
                    <span className="font-medium text-slate-900 dark:text-white">{m.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">{m.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {form.path === CALCULATION_PATHS.MEDICAL && (
              <div className="card p-6 space-y-4" data-testid="medical-notice">
                <h2 className="text-lg font-semibold navy-text">What official disposition did your service provide?</h2>
                <p className="text-sm text-slate-700 dark:text-slate-200">{MEDICAL_NOTICE}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="medDisposition" label="Official disposition">
                    <select id="medDisposition" className="input-field w-full" value={form.medical.disposition} onChange={(e) => patch({ medical: { ...form.medical, disposition: e.target.value } })}>
                      <option value="unknown">Not recorded yet</option>
                      <option value="pdrl">Permanent disability retirement (PDRL)</option>
                      <option value="tdrl">Temporary disability retirement (TDRL)</option>
                      <option value="separation_severance">Separation with severance pay</option>
                    </select>
                  </Field>
                  <Field id="medDodPct" label="DoD disability percentage" hint="From the orders. Not the VA rating.">
                    <input id="medDodPct" inputMode="numeric" className="input-field w-full" value={form.medical.dodDisabilityPercent} onChange={(e) => patch({ medical: { ...form.medical, dodDisabilityPercent: e.target.value } })} />
                  </Field>
                  <Field id="medVaRating" label="VA rating (kept separate, optional)" hint="Recorded so the two are never confused; it does not enter this calculation.">
                    <input id="medVaRating" inputMode="numeric" className="input-field w-full" value={form.medical.vaRating} onChange={(e) => patch({ medical: { ...form.medical, vaRating: e.target.value } })} />
                  </Field>
                  {form.medical.disposition === 'tdrl' && (
                    <Field id="medTdrlDate" label="TDRL placement date" hint="Placements before 1 January 2017 carried a 50% floor.">
                      <input id="medTdrlDate" type="date" className="input-field w-full" value={form.medical.tdrlPlacementDate} onChange={(e) => patch({ medical: { ...form.medical, tdrlPlacementDate: e.target.value } })} />
                    </Field>
                  )}
                  {form.medical.disposition === 'separation_severance' && (
                    <>
                      <Field id="medBasicPay" label="Monthly basic pay at separation">
                        <input id="medBasicPay" inputMode="decimal" className="input-field w-full" value={form.medical.monthlyBasicPay} onChange={(e) => patch({ medical: { ...form.medical, monthlyBasicPay: e.target.value } })} />
                      </Field>
                      <Field id="medCombat" label="Combat-related finding (official)">
                        <select id="medCombat" className="input-field w-full" value={form.medical.combatRelated} onChange={(e) => patch({ medical: { ...form.medical, combatRelated: e.target.value } })}>
                          <option value="">Not recorded</option>
                          <option value="yes">Yes, per the orders</option>
                          <option value="no">No</option>
                        </select>
                      </Field>
                    </>
                  )}
                  {form.mode !== 'quick' && (
                    <Field id="medProv" label="These figures are">
                      <select id="medProv" className="input-field w-full" value={form.medical.provenance} onChange={(e) => patch({ medical: { ...form.medical, provenance: e.target.value } })}>
                        <option value={INPUT_PROVENANCE.USER_ESTIMATE}>My estimate</option>
                        <option value={INPUT_PROVENANCE.USER_ENTERED_OFFICIAL}>From my official orders</option>
                      </select>
                    </Field>
                  )}
                </div>
              </div>
            )}
            {form.path === CALCULATION_PATHS.TERA && (
              <div className="card p-6 space-y-4" data-testid="tera-fields">
                <h2 className="text-lg font-semibold navy-text">Official TERA authority</h2>
                <p className="text-sm text-slate-700 dark:text-slate-200">FireFed uses the figures on your TERA approval. It does not decide who is offered early retirement, and it does not show TERA as a future option.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="teraAuthority" label="Authority on the approval" hint="For example the NDAA section and service program named on your orders.">
                    <input id="teraAuthority" className="input-field w-full" value={form.tera.authorityName} onChange={(e) => patch({ tera: { ...form.tera, authorityName: e.target.value } })} />
                  </Field>
                  <Field id="teraApproval" label="Approval date">
                    <input id="teraApproval" type="date" className="input-field w-full" value={form.tera.approvalDate} onChange={(e) => patch({ tera: { ...form.tera, approvalDate: e.target.value } })} />
                  </Field>
                  {form.mode !== 'quick' && (
                    <Field id="teraProv" label="This authority is">
                      <select id="teraProv" className="input-field w-full" value={form.tera.provenance} onChange={(e) => patch({ tera: { ...form.tera, provenance: e.target.value } })}>
                        <option value={INPUT_PROVENANCE.USER_ESTIMATE}>My understanding</option>
                        <option value={INPUT_PROVENANCE.USER_ENTERED_OFFICIAL}>From my official approval</option>
                      </select>
                    </Field>
                  )}
                </div>
              </div>
            )}

            {/* 2. System */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold navy-text">Retirement system</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="diems" label="DIEMS (date you first entered service)" hint="The date that decides which system applies. It is on your record, not your enlistment date if you had a delayed entry.">
                  <input id="diems" type="date" className="input-field w-full" value={form.diems} onChange={set('diems')} />
                </Field>
                <Field id="system" label="System">
                  <select id="system" className="input-field w-full" value={form.system} onChange={(e) => patch({ system: e.target.value, systemConfirmation: e.target.value ? SYSTEM_CONFIRMATION.USER_CONFIRMED : SYSTEM_CONFIRMATION.SUGGESTED })}>
                    <option value="">Not chosen</option>
                    {Object.values(RETIREMENT_SYSTEMS).map((s) => (
                      <option key={s} value={s}>{SYSTEM_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {suggestion?.suggested && (
                <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="system-suggestion">
                  Based on the dates you entered, {SYSTEM_LABELS[suggestion.suggested]} may apply. Confirm it from your official record before relying on this estimate.
                  {form.system !== suggestion.suggested && (
                    <button type="button" className="ml-2 underline underline-offset-2 navy-text" onClick={() => patch({ system: suggestion.suggested, systemConfirmation: SYSTEM_CONFIRMATION.USER_CONFIRMED })}>
                      Use {SYSTEM_LABELS[suggestion.suggested]}
                    </button>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.cbsElected} onChange={set('cbsElected')} /> I took the Career Status Bonus (REDUX)</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.brsOptIn} onChange={set('brsOptIn')} /> I opted into BRS in 2018</label>
                {form.system && form.mode !== 'quick' && (
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.systemConfirmation === SYSTEM_CONFIRMATION.OFFICIAL} onChange={(e) => patch({ systemConfirmation: e.target.checked ? SYSTEM_CONFIRMATION.OFFICIAL : SYSTEM_CONFIRMATION.USER_CONFIRMED })} /> Confirmed from my official record</label>
                )}
              </div>
            </div>

            {/* 3. Service or points */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold navy-text">{isReserve ? 'Retirement points' : 'Creditable service'}</h2>
              {isReserve ? (
                <>
                  <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="reserve-notice">{RESERVE_NOTICE}</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field id="points" label="Total creditable points" hint="From your retirement points statement.">
                      <input id="points" inputMode="numeric" className="input-field w-full" value={form.reserve.officialTotalPoints} onChange={setR('officialTotalPoints')} />
                    </Field>
                    <Field id="qualifyingYears" label="Qualifying years (50+ points)" hint="Twenty are required. Separate from the point total.">
                      <input id="qualifyingYears" inputMode="numeric" className="input-field w-full" value={form.reserve.officialQualifyingYears} onChange={setR('officialQualifyingYears')} />
                    </Field>
                    <Field id="birthDate" label="Birth month" hint="To turn the retired-pay age into a date. Month precision is enough.">
                      <input id="birthDate" type="date" className="input-field w-full" value={form.reserve.birthDate} onChange={setR('birthDate')} />
                    </Field>
                    <Field id="retirementDate" label="Transfer or discharge date" hint="When you leave a drilling status.">
                      <input id="retirementDate" type="date" className="input-field w-full" value={form.retirementDate} onChange={set('retirementDate')} />
                    </Field>
                    {form.mode !== 'quick' && (
                      <>
                        <Field id="pointsProvenance" label="These points are">
                          <select id="pointsProvenance" className="input-field w-full" value={form.reserve.pointsProvenance} onChange={setR('pointsProvenance')}>
                            <option value={INPUT_PROVENANCE.USER_ESTIMATE}>My estimate</option>
                            <option value={INPUT_PROVENANCE.USER_ENTERED_OFFICIAL}>From my official points statement</option>
                          </select>
                        </Field>
                        <Field id="retiredReserveStatus" label="After leaving drilling status" hint="Retired Reserve members keep accruing years of service for the pay table until pay begins.">
                          <select id="retiredReserveStatus" className="input-field w-full" value={form.reserve.retiredReserveStatus} onChange={setR('retiredReserveStatus')}>
                            <option value={RETIRED_RESERVE_STATUSES.UNKNOWN}>Not sure</option>
                            <option value={RETIRED_RESERVE_STATUSES.RETIRED_RESERVE}>Transferred to the Retired Reserve</option>
                            <option value={RETIRED_RESERVE_STATUSES.FORMER_MEMBER}>Discharged (former member)</option>
                          </select>
                        </Field>
                        <Field id="officialEligibilityDate" label="Official retired-pay eligibility date" hint="If your service has issued one, it controls.">
                          <input id="officialEligibilityDate" type="date" className="input-field w-full" value={form.reserve.officialEligibilityDate} onChange={setR('officialEligibilityDate')} />
                        </Field>
                      </>
                    )}
                  </div>

                  {form.mode !== 'quick' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-slate-900 dark:text-white">Qualifying duty since 28 January 2008 (reduced age)</h3>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => patchReserve({ reducedAgePeriods: [...form.reserve.reducedAgePeriods, { id: nextId('ra'), startDate: '', endDate: '', authority: '12302', verified: false }] })}>
                          Add period
                        </button>
                      </div>
                      {form.reserve.reducedAgePeriods.map((p, i) => (
                        <div key={p.id} className="grid sm:grid-cols-4 gap-2 items-end text-sm" data-testid={`reduced-age-${i}`}>
                          <Field id={`${p.id}-s`} label="Start"><input id={`${p.id}-s`} type="date" className="input-field w-full" value={p.startDate} onChange={(e) => patchReserve({ reducedAgePeriods: form.reserve.reducedAgePeriods.map((x) => (x.id === p.id ? { ...x, startDate: e.target.value } : x)) })} /></Field>
                          <Field id={`${p.id}-e`} label="End"><input id={`${p.id}-e`} type="date" className="input-field w-full" value={p.endDate} onChange={(e) => patchReserve({ reducedAgePeriods: form.reserve.reducedAgePeriods.map((x) => (x.id === p.id ? { ...x, endDate: e.target.value } : x)) })} /></Field>
                          <Field id={`${p.id}-a`} label="Order authority">
                            <select id={`${p.id}-a`} className="input-field w-full" value={p.authority} onChange={(e) => patchReserve({ reducedAgePeriods: form.reserve.reducedAgePeriods.map((x) => (x.id === p.id ? { ...x, authority: e.target.value } : x)) })}>
                              {REDUCED_AGE_AUTHORITIES.map((a) => <option key={a} value={a}>{a === 'title32_502f' ? '32 U.S.C. 502(f)' : `10 U.S.C. ${a}`}</option>)}
                              <option value="other">Other / not listed</option>
                            </select>
                          </Field>
                          <label className="inline-flex items-center gap-2 pb-2"><input type="checkbox" checked={p.verified} onChange={(e) => patchReserve({ reducedAgePeriods: form.reserve.reducedAgePeriods.map((x) => (x.id === p.id ? { ...x, verified: e.target.checked } : x)) })} /> Verified by my service</label>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-2">
                        <h3 className="font-medium text-slate-900 dark:text-white">Year-by-year points (optional audit)</h3>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => patchReserve({ retirementYears: [...form.reserve.retirementYears, { id: nextId('ry'), retirementYearEnd: '', activePoints: '0', inactivePoints: '0', membershipPoints: '15', officialTotal: '' }] })}>
                          Add retirement year
                        </button>
                      </div>
                      {form.reserve.retirementYears.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-slate-500"><th className="p-1">Year ends</th><th className="p-1">Active</th><th className="p-1">Inactive</th><th className="p-1">Membership</th><th className="p-1">Statement total</th></tr></thead>
                            <tbody>
                              {form.reserve.retirementYears.map((r, i) => {
                                const up = (k) => (e) => patchReserve({ retirementYears: form.reserve.retirementYears.map((x) => (x.id === r.id ? { ...x, [k]: e.target.value } : x)) });
                                return (
                                  <tr key={r.id} data-testid={`retirement-year-${i}`}>
                                    <td className="p-1"><input aria-label={`Retirement year ${i + 1} end`} type="date" className="input-field w-full" value={r.retirementYearEnd} onChange={up('retirementYearEnd')} /></td>
                                    <td className="p-1"><input aria-label={`Retirement year ${i + 1} active points`} inputMode="numeric" className="input-field w-20" value={r.activePoints} onChange={up('activePoints')} /></td>
                                    <td className="p-1"><input aria-label={`Retirement year ${i + 1} inactive points`} inputMode="numeric" className="input-field w-20" value={r.inactivePoints} onChange={up('inactivePoints')} /></td>
                                    <td className="p-1"><input aria-label={`Retirement year ${i + 1} membership points`} inputMode="numeric" className="input-field w-20" value={r.membershipPoints} onChange={up('membershipPoints')} /></td>
                                    <td className="p-1"><input aria-label={`Retirement year ${i + 1} statement total`} inputMode="numeric" className="input-field w-24" value={r.officialTotal} onChange={up('officialTotal')} /></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field id="serviceYears" label="Years"><input id="serviceYears" inputMode="numeric" className="input-field w-full" value={form.serviceYears} onChange={set('serviceYears')} /></Field>
                  <Field id="serviceMonths" label="Months"><input id="serviceMonths" inputMode="numeric" className="input-field w-full" value={form.serviceMonths} onChange={set('serviceMonths')} /></Field>
                  <Field id="serviceDays" label="Days" hint="Days are disregarded in the multiplier (10 U.S.C. 1405)."><input id="serviceDays" inputMode="numeric" className="input-field w-full" value={form.serviceDays} onChange={set('serviceDays')} /></Field>
                  <Field id="retirementDate" label="Retirement date" className="sm:col-span-2"><input id="retirementDate" type="date" className="input-field w-full" value={form.retirementDate} onChange={set('retirementDate')} /></Field>
                  <Field id="ageAtRetirement" label="Age at retirement"><input id="ageAtRetirement" inputMode="numeric" className="input-field w-full" value={form.ageAtRetirement} onChange={set('ageAtRetirement')} /></Field>
                  {form.mode !== 'quick' && (
                    <Field id="serviceProvenance" label="This service figure is" className="sm:col-span-3">
                      <select id="serviceProvenance" className="input-field w-full" value={form.serviceProvenance} onChange={set('serviceProvenance')}>
                        <option value={INPUT_PROVENANCE.USER_ESTIMATE}>My estimate</option>
                        <option value={INPUT_PROVENANCE.USER_ENTERED_OFFICIAL}>From my official record (DD 214, statement of service)</option>
                      </select>
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* 4. Grade / pay base */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold navy-text">Grade and pay history</h2>
              <Field id="pebd" label="Pay entry base date (PEBD)" hint="Sets the years-of-service column of the pay table. Without it every month is priced in the lowest column and flagged.">
                <input id="pebd" type="date" className="input-field w-full" value={form.payEntryBaseDate} onChange={set('payEntryBaseDate')} />
              </Field>
              {form.gradePeriods.map((g, i) => (
                <div key={g.id} className="grid sm:grid-cols-3 gap-3 items-end" data-testid={`grade-period-${i}`}>
                  <Field id={`${g.id}-grade`} label={i === 0 ? 'Grade' : `Earlier grade ${i}`}>
                    <select id={`${g.id}-grade`} className="input-field w-full" value={g.grade} onChange={(e) => patch({ gradePeriods: form.gradePeriods.map((x) => (x.id === g.id ? { ...x, grade: e.target.value } : x)) })}>
                      {GRADES.map((gr) => <option key={gr} value={gr}>{gradeLabel(gr)}</option>)}
                    </select>
                  </Field>
                  <Field id={`${g.id}-start`} label="Held from"><input id={`${g.id}-start`} type="date" className="input-field w-full" value={g.startDate} onChange={(e) => patch({ gradePeriods: form.gradePeriods.map((x) => (x.id === g.id ? { ...x, startDate: e.target.value } : x)) })} /></Field>
                  <Field id={`${g.id}-end`} label="Until (blank = retirement)"><input id={`${g.id}-end`} type="date" className="input-field w-full" value={g.endDate} onChange={(e) => patch({ gradePeriods: form.gradePeriods.map((x) => (x.id === g.id ? { ...x, endDate: e.target.value } : x)) })} /></Field>
                </div>
              ))}
              {form.mode !== 'quick' && (
                <div className="flex flex-wrap gap-4 text-sm">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => patch({ gradePeriods: [...form.gradePeriods, { id: nextId('g'), grade: 'E6', startDate: '', endDate: '' }] })}>Add an earlier grade</button>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.retiredGradeConfirmed} onChange={set('retiredGradeConfirmed')} /> The retired grade above is confirmed on my orders</label>
                </div>
              )}
              {form.mode !== 'quick' && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="basicPayGrowthPct" label="Future basic pay raises (%/yr)" hint="Used for months past the latest published pay table."><input id="basicPayGrowthPct" inputMode="decimal" className="input-field w-full" value={form.basicPayGrowthPct} onChange={set('basicPayGrowthPct')} /></Field>
                  <Field id="inflationPct" label="Future COLA assumption (%/yr)"><input id="inflationPct" inputMode="decimal" className="input-field w-full" value={form.inflationPct} onChange={set('inflationPct')} /></Field>
                </div>
              )}
            </div>

            {form.mode === 'reconcile' && (
              <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold navy-text">Official figure to reconcile against</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field id="officialMonthlyGross" label="Gross monthly retired pay on your statement or estimate"><input id="officialMonthlyGross" inputMode="decimal" className="input-field w-full" value={form.officialMonthlyGross} onChange={set('officialMonthlyGross')} /></Field>
                  <Field id="officialAsOfDate" label="Statement date"><input id="officialAsOfDate" type="date" className="input-field w-full" value={form.officialAsOfDate} onChange={set('officialAsOfDate')} /></Field>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">The official amount controls the projection. FireFed shows its own figure beside it and what explains the difference.</p>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="space-y-6" aria-live="polite">
            {result && <ResultPanel result={result} isReserve={isReserve} view={view} setView={setView} />}
            {result && result.status !== MILITARY_RESULT_STATUS.NOT_SUPPORTED && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn-secondary btn-sm" onClick={downloadPdf} disabled={pdfBusy}>
                  {pdfBusy ? 'Preparing PDF…' : 'Download this calculation (PDF)'}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">Same figures, status, warnings, sources, and rules version as this page. Generated in your browser; nothing is sent anywhere.</span>
              </div>
            )}

            {isAuthenticated ? (
              <div className="card p-6 bg-navy-50 dark:bg-slate-800" data-testid="connect-plan">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Connect to your plan</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{FEDERAL_CONNECTION}</p>
                {saved ? (
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    Saved as a linked income stream. <Link to="/plan/military" className="underline underline-offset-2 navy-text">Open the Military + Federal Plan</Link>
                  </p>
                ) : (
                  <button type="button" className="btn-primary" disabled={!canSave} onClick={saveToPlan}>
                    Use this result in my Military + Federal Plan
                  </button>
                )}
                {!canSave && !saved && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Available once the calculation has a figure and nothing is blocking it.</p>}
              </div>
            ) : (
              <div className="card p-6 bg-navy-50 dark:bg-slate-800">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Want to keep this?</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{FEDERAL_CONNECTION} A free account saves the calculation and puts it on the same timeline as your FERS annuity, TSP, and Social Security.</p>
                <Link to="/signin?mode=signup" onClick={() => trackEvent('calculator_signup_cta_clicked', { calculator: 'military_retirement', engaged: hasEngaged.current })} className="btn-primary inline-block">Create a free account</Link>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="disclaimer max-w-3xl mt-10">{INDEPENDENCE}</p>
      <p className="disclaimer max-w-3xl">
        Estimates only, from the figures you enter and the published pay tables in <Link to="/methodology" className="underline underline-offset-2">Methodology</Link>. Confirm anything you rely on with your service&rsquo;s retirement office or DFAS before making a decision.
      </p>
    </div>
  );
}

function ResultPanel({ result, isReserve, view, setView }) {
  const severance = result.special?.kind === 'severance';
  const noFigure = result.grossMonthly === null || severance;
  const startSource = isReserve
    ? result.reserve?.age?.method === 'official_date' ? 'official eligibility date' : result.reserve?.age?.method === 'reduced_age' ? 'reduced retired-pay age' : result.reserve ? 'age 60' : '—'
    : 'retirement date';
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold navy-text">Result</h2>
        <StatusBadge status={result.status} />
      </div>

      {severance ? (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="severance-cards">
          <Card title="Medical separation with severance" testId="card-severance">
            <span className="text-2xl font-bold tabular-nums">{money(result.special.severance.lumpSum)}</span>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">One-time payment: 2 × {money2(result.special.severance.monthlyBasicPay)} × {result.special.severance.years} years. Not retired pay.</div>
          </Card>
          <Card title="Years of service counted" testId="card-severance-years">
            <div className="text-lg font-semibold">{result.special.severance.yearsBeforeBounds} counted, {result.special.severance.years} used</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">At least 3 (6 if combat-related), at most 19.</div>
          </Card>
        </div>
      ) : noFigure ? (
        <div className="card p-6" data-testid="no-figure">
          <p className="text-sm text-slate-700 dark:text-slate-200">No figure yet. The items below say what is missing or what needs an official answer.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="result-cards">
          <Card title="Gross monthly retired pay" testId="card-gross">
            <HowCalculated ruleId="military.retired_pay_formula">
              <span className="text-2xl font-bold tabular-nums">{money(result.projectedMonthly)}</span>
            </HowCalculated>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{money(result.projectedMonthly * 12)} a year, in first-payment dollars.{result.reconciliation ? ' Official amount shown; FireFed computed ' + money(result.grossMonthly) + '.' : ''}</div>
          </Card>
          <Card title="Retired pay starts" testId="card-start">
            <div className="text-lg font-semibold">{result.retiredPayStartDate ?? '—'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Source: {startSource}.</div>
          </Card>
          <Card title="Retirement system" testId="card-system">
            <div className="text-lg font-semibold">{result.systemLabel ?? '—'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{result.systemConfirmed ? 'Confirmed from the record.' : 'Not yet confirmed from an official record.'}</div>
          </Card>
          <Card title="Retired-pay base" testId="card-paybase">
            <div className="text-lg font-semibold tabular-nums">{money2(result.payBase?.monthly)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {result.payBase?.method === 'high_36' ? `High-36 average from ${result.payBase.monthsUsed} months (${result.payBase.reliableMonths} from published tables).` : result.payBase?.method === 'final_pay' ? `Final Pay rate for ${result.payBase.gradeLabel}, ${result.payBase.band}.` : 'Official pay base entered.'}
            </div>
          </Card>
          <Card title={isReserve ? 'Service basis: points' : 'Service basis'} testId="card-service">
            {isReserve ? (
              <>
                <div className="text-lg font-semibold tabular-nums">{result.reserve.points.totalPoints.toLocaleString()} points = {result.reserve.equivalent.equivalentYears.toFixed(4)} years</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{result.reserve.points.qualifyingYears ?? '?'} qualifying years. {result.reserve.points.official ? 'Official statement.' : 'Estimated points.'}</div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold tabular-nums">{result.service?.years}y {(result.service?.months ?? 0) % 12}m</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{result.service?.months} whole months for the multiplier. {result.service?.official ? 'Official figure.' : 'User estimate.'}</div>
              </>
            )}
          </Card>
          <Card title="Multiplier" testId="card-multiplier">
            <div className="text-lg font-semibold tabular-nums">{pct(result.multiplier.multiplier)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {pct(result.multiplier.rate)} × {result.multiplier.serviceYears.toFixed(isReserve ? 4 : 2)} years{result.multiplier.reduxReduction > 0 ? `, less ${pct(result.multiplier.reduxReduction)} REDUX` : ''}{result.multiplier.capApplied ? ', capped' : ''}. Rounded down to {money(result.grossMonthly)} from {money2(result.grossMonthlyUnrounded)}.
            </div>
          </Card>
          <Card title="Cost-of-living adjustments" testId="card-cola">
            <div className="text-sm">{result.cola?.[1]?.colaSource === 'published' ? 'First adjustment published.' : 'First adjustment prorated by retirement quarter (pending verification).'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Future years at {pct(result.inputs.assumptions.inflation)}{result.system === RETIREMENT_SYSTEMS.REDUX ? ', less one point until the age-62 recomputation' : ''}.</div>
          </Card>
          <Card title="Data quality" testId="card-data-quality">
            <dl className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
              {['official', 'estimated', 'defaulted', 'missing'].map((k) => (
                <div key={k}><dt className="text-slate-500 dark:text-slate-400 capitalize">{k}</dt><dd>{result.dataQuality?.[k]?.length ? result.dataQuality[k].join(', ') : 'none'}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      <MilitaryIssues issues={result.issues} />

      {!noFigure && (
        <div className="card p-0 overflow-hidden">
          <div className="flex border-b border-slate-200 dark:border-slate-700" role="tablist" aria-label="Detailed views">
            {[['audit', 'Formula audit'], ['paybase', 'Pay-base table'], ['service', 'Service audit'], ...(result.reconciliation ? [['reconcile', 'Reconciliation']] : [])].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} className={`px-4 py-2 text-sm ${view === id ? 'border-b-2 border-navy-600 font-medium navy-text' : 'text-slate-600 dark:text-slate-300'}`} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="p-4 overflow-x-auto" role="tabpanel">
            {view === 'audit' && (
              <table className="w-full text-sm" data-testid="formula-audit">
                <thead><tr className="text-left text-xs text-slate-500"><th className="p-1">Step</th><th className="p-1">Displayed</th><th className="p-1">Unrounded</th><th className="p-1">Rule</th><th className="p-1">Note</th></tr></thead>
                <tbody>
                  {result.steps.map((s, i) => (
                    <tr key={`${s.id}-${i}`} className="border-t border-slate-100 dark:border-slate-800 align-top">
                      <td className="p-1">{s.label}</td>
                      <td className="p-1 tabular-nums">{formatStepValue(s)}</td>
                      <td className="p-1 tabular-nums text-slate-500">{s.unrounded !== undefined && s.unrounded !== null ? String(s.unrounded) : ''}</td>
                      <td className="p-1 text-xs">{s.ruleId ? <HowCalculated ruleId={s.ruleId}><span className="font-mono">{s.ruleId}</span></HowCalculated> : ''}</td>
                      <td className="p-1 text-xs text-slate-500">{s.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === 'paybase' && (
              result.payBase?.method === 'high_36' ? (
                <table className="w-full text-sm" data-testid="paybase-table">
                  <caption className="text-left text-xs text-slate-500 mb-2">The 36 highest months. Each month shows the table it was priced from.</caption>
                  <thead><tr className="text-left text-xs text-slate-500"><th className="p-1">Month</th><th className="p-1">Grade</th><th className="p-1">YOS</th><th className="p-1">Monthly</th><th className="p-1">Table</th><th className="p-1">Basis</th></tr></thead>
                  <tbody>
                    {result.payBase.months.map((m) => (
                      <tr key={m.month} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-1">{m.month}</td><td className="p-1">{m.gradeLabel}</td><td className="p-1 tabular-nums">{m.yearsOfService === null ? '?' : m.yearsOfService.toFixed(2)}</td><td className="p-1 tabular-nums">{money2(m.monthly)}</td><td className="p-1">{m.tableDate}</td>
                        <td className="p-1 text-xs">{m.assumed ? 'projected' : m.derived ? 'derived' : m.verified ? 'published' : 'unverified'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <dl className="text-sm grid grid-cols-2 gap-2" data-testid="paybase-table">
                  <dt>Method</dt><dd>{result.payBase?.method}</dd>
                  <dt>Monthly</dt><dd className="tabular-nums">{money2(result.payBase?.monthly)}</dd>
                  {result.payBase?.tableDate && <><dt>Table</dt><dd>{result.payBase.tableDate}</dd></>}
                  {result.payBase?.band && <><dt>Band</dt><dd>{result.payBase.band}</dd></>}
                </dl>
              )
            )}
            {view === 'service' && (
              isReserve ? (
                <div className="text-sm space-y-2" data-testid="service-audit">
                  <p>{result.reserve.points.totalPoints.toLocaleString()} creditable points ÷ 360 = {result.reserve.equivalent.equivalentYears.toFixed(4)} equivalent years. {result.reserve.points.qualifyingYears ?? '?'} qualifying years against the 20 required.</p>
                  <p>Retired-pay age: {result.reserve.age.method === 'official_date' ? `official date ${result.reserve.age.date}` : `${result.reserve.age.age} (${result.reserve.age.method === 'reduced_age' ? `${result.reserve.age.units} × 90-day units, ${result.reserve.age.reductionMonths} months earlier` : 'no reduction'})`}.</p>
                  {result.reserve.points.audit && (
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-slate-500"><th className="p-1">Year ends</th><th className="p-1">Active</th><th className="p-1">Inactive (credited)</th><th className="p-1">Cap</th><th className="p-1">Creditable</th><th className="p-1">Qualifying</th></tr></thead>
                      <tbody>
                        {result.reserve.points.audit.rows.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-1">{r.retirementYearEnd}</td><td className="p-1 tabular-nums">{r.activePoints}</td><td className="p-1 tabular-nums">{r.inactiveCreditable}</td><td className="p-1 tabular-nums">{r.cap}{r.capApplied ? ' (applied)' : ''}</td><td className="p-1 tabular-nums">{r.creditablePoints}</td><td className="p-1">{r.qualifying ? 'yes' : 'no'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <p className="text-sm" data-testid="service-audit">{result.service?.years}y {(result.service?.months ?? 0) % 12}m {result.service?.days ?? 0}d entered → {result.service?.months} whole months for the multiplier; days disregarded (10 U.S.C. 1405(b)). {result.service?.official ? 'Official figure.' : 'User estimate.'}</p>
              )
            )}
            {view === 'reconcile' && result.reconciliation && (
              <dl className="text-sm grid grid-cols-2 gap-2" data-testid="reconciliation">
                <dt>Official monthly</dt><dd className="tabular-nums">{money2(result.reconciliation.officialMonthly)}</dd>
                <dt>FireFed monthly</dt><dd className="tabular-nums">{money2(result.grossMonthly)}</dd>
                <dt>Difference</dt><dd className="tabular-nums">{money2(result.reconciliation.difference)} ({result.reconciliation.percentDifference !== null && result.reconciliation.percentDifference !== undefined ? pct(result.reconciliation.percentDifference) : ''})</dd>
                <dt>Within tolerance</dt><dd>{result.reconciliation.withinTolerance ? 'yes' : 'no'}</dd>
                <dt>Likely contributors</dt><dd>{(result.reconciliation.diagnostics ?? []).join(', ') || 'none identified'}</dd>
              </dl>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function formatStepValue(s) {
  if (s.value === null || s.value === undefined) return '—';
  if (s.unit === 'fraction') return pct(s.value);
  if (s.unit === 'monthly' || s.unit === 'usd') return money2(s.value);
  if (typeof s.value === 'number') return s.value.toLocaleString();
  return String(s.value);
}
