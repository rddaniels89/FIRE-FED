import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { FEATURES } from '../../../lib/entitlements';
import { CheckField, Field, Grid, NumberField, ProBadge, ProNotice, RadioField, Section, SelectField } from './fields';
import { militarySummary } from './summaries';
import {
  AMOUNT_STATUS_OPTIONS,
  BRANCH_OPTIONS,
  CHAPTER_61_OPTIONS,
  CHARACTER_OPTIONS,
  COLA_OPTIONS,
  COMPONENT_OPTIONS,
  CONNECTION_OPTIONS,
  COVERAGE_ENROLLMENT_OPTIONS,
  COVERAGE_RELATIONSHIP_OPTIONS,
  COVERAGE_SOURCE_OPTIONS,
  LUMP_SUM_OPTIONS,
  RCSBP_OPTION_OPTIONS,
  SBP_CATEGORY_OPTIONS,
  SBP_ELECTED_OPTIONS,
  TSP_CONTRIBUTION_KIND_OPTIONS,
  UNIFORMED_TSP_SYSTEM_OPTIONS,
  DEPOSIT_MODE_OPTIONS,
  DEPOSIT_STATUS_OPTIONS,
  DETERMINATION_OPTIONS,
  DISABILITY_RETIRED_PAY_TYPE,
  DOCUMENTATION_OPTIONS,
  DUTY_STATUS_OPTIONS,
  FREQUENCY_OPTIONS,
  OFFICIAL_ONLY_TYPES,
  OWNER_OPTIONS,
  PROVENANCE_OPTIONS,
  RECEIPT_OPTIONS,
  RELATIONSHIP_OPTIONS,
  RETIRED_PAY_TYPE_OPTIONS,
  STREAM_TYPE_OPTIONS,
  TAX_CLASS_OPTIONS,
  VA_DISABILITY_TYPE,
  VA_RATING_OPTIONS,
  WAIVER_MODE_OPTIONS,
} from './militaryOptions';
import { MILITARY_CONNECTIONS, createDefaultMilitary } from '../../../lib/scenarios/schema';
import { DUTY_STATUS, createServicePeriod, parseIsoDate } from '../../../lib/military/servicePeriods';
import { COLA_POLICIES, createIncomeStream } from '../../../lib/military/incomeStreams';
import { createCoveragePeriod } from '../../../lib/military/coverage';
import { MILITARY_RULES_VERSION, rulesStatus } from '../../../lib/military/status';
import { RETIRED_PAY_RECEIPT, RETIRED_PAY_TYPES, WAIVER_MODES } from '../../../lib/military/retiredPayWaiver';
import { resolveRetirementPlan } from '../../../lib/projection/plan';
import { trackEvent } from '../../../lib/telemetry';
import MilitaryIssues, { MilitaryNotice, StatusBadge } from '../MilitaryIssues';
import { money } from './format';

/** A native date input in the house style. The value is an ISO date or null. */
function DateField({ id, label, value, onChange, hint, min, max }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type="date"
        className="input-field w-full"
        value={value ?? ''}
        min={min}
        max={max}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </Field>
  );
}

function TextField({ id, label, value, onChange, hint, placeholder }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type="text"
        className="input-field w-full"
        value={value ?? ''}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </Field>
  );
}

function SubHeading({ children, hint }) {
  return (
    <div className="mt-6 mb-3">
      <h3 className="text-base font-semibold navy-text">{children}</h3>
      {hint ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

function RemoveButton({ label, onClick }) {
  return (
    <button type="button" className="focus-ring inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300 underline underline-offset-2" onClick={onClick}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Calendar years a period spans, for the basic-pay-by-year inputs. */
function yearsCovered(period) {
  const start = parseIsoDate(period.startDate);
  const end = parseIsoDate(period.endDate);
  if (!start || !end || end.getTime() < start.getTime()) return [];
  const years = [];
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y += 1) years.push(y);
  return years.length > 40 ? [] : years;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
/** Retired-pay gate, waiver, and Chapter 61 notes: shown beside the retired-pay fields. */
const RETIRED_PAY_ISSUE = /CH61|RETIRED_PAY|WAIVER/;

function incomeSummary(m) {
  const streams = (m.incomeStreams ?? []).length;
  const sbp = m.sbp?.elected === 'yes' ? 'SBP elected' : m.sbp?.elected === 'no' ? 'SBP declined' : 'SBP not recorded';
  return [m.retiredPay?.receives === 'yes' ? 'receives retired pay' : 'no retired pay', `${streams} income stream${streams === 1 ? '' : 's'}`, sbp].join(' · ');
}

function tspSummary(m) {
  const u = m.tsp?.uniformedServices ?? {};
  if (!u.enabled) return 'No uniformed-services TSP account recorded';
  return `Uniformed-services TSP on (${u.coverageSystem === 'brs' ? 'BRS' : u.coverageSystem === 'legacy' ? 'legacy' : 'system not recorded'})${u.contributing ? ', contributing' : ''}`;
}

function coverageSummary(m) {
  const n = (m.coverage ?? []).length;
  return n === 0 ? 'No coverage periods recorded' : `${n} coverage period${n === 1 ? '' : 's'}`;
}

/**
 * Everything the military sections share: the block, its writers, the live
 * plan resolution, and the per-entity issue lookups. One hook, four sections,
 * so the screens cannot disagree about what a fact does.
 */
function useMilitary({ scenario, write, canUse }) {
  const m = scenario.military;
  const writeMil = (patch) => write({ military: patch });
  const householdAllowed = canUse(FEATURES.HOUSEHOLD);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = m.connection !== MILITARY_CONNECTIONS.NONE;

  // The plan resolution is what tells the user what each entry does. It is
  // cheap (no timeline), so it runs on every change.
  const plan = useMemo(() => {
    if (!active) return null;
    try {
      return resolveRetirementPlan(scenario);
    } catch {
      return null;
    }
  }, [scenario, active]);
  const mil = plan?.military ?? null;
  const periodIssues = (id) => (mil?.issues ?? []).filter((i) => i.entity?.type === 'servicePeriod' && i.entity?.id === id);
  const streamIssues = (id) => (mil?.issues ?? []).filter((i) => i.entity?.type === 'incomeStream' && i.entity?.id === id);
  const generalIssues = (mil?.issues ?? []).filter(
    (i) =>
      (!i.entity || (i.entity.type !== 'servicePeriod' && i.entity.type !== 'incomeStream' && i.entity.type !== 'coveragePeriod' && i.entity.type !== 'tspAccount')) &&
      !String(i.code).startsWith('MIL_TSP') &&
      !String(i.code).startsWith('MIL_USERRA') &&
      !String(i.code).startsWith('MRT_BRS') &&
      !String(i.code).startsWith('MRT_SBP') &&
      !String(i.code).startsWith('MRT_RCSBP') &&
      i.code !== 'MRT_CONCURRENT_RECEIPT_MANUAL' &&
      i.code !== 'MRT_NET_NOT_RECONCILED' &&
      i.code !== 'MRT_SCENARIO_RULES_STALE' &&
      !RETIRED_PAY_ISSUE.test(String(i.code))
  );
  // The retired-pay gate and waiver notes belong beside the retired-pay fields, in the income section.
  const retiredPayIssues = (mil?.issues ?? []).filter((i) => (!i.entity || (i.entity.type !== 'servicePeriod' && i.entity.type !== 'incomeStream')) && RETIRED_PAY_ISSUE.test(String(i.code)));
  const classificationFor = (id) => mil?.normalizedPeriods?.find((p) => p.id === id)?.classification ?? null;

  const setConnection = (value) => {
    if (m.connection === MILITARY_CONNECTIONS.NONE && value !== MILITARY_CONNECTIONS.NONE) trackEvent('military_module_started');
    writeMil({ connection: value });
  };

  // ---- service periods
  const periods = m.servicePeriods ?? [];
  const writePeriods = (next) => writeMil({ servicePeriods: next });
  const updatePeriod = (id, patch) => writePeriods(periods.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPeriod = () => {
    writePeriods([...periods, createServicePeriod({ dutyStatus: DUTY_STATUS.ACTIVE_DUTY })]);
    trackEvent('service_period_saved');
  };
  const removePeriod = (id) => writePeriods(periods.filter((p) => p.id !== id));

  // ---- deposit
  const d = m.deposit;
  const writeDeposit = (patch) => writeMil({ deposit: patch });
  const payments = d.payments ?? [];
  const writePayments = (next) => writeDeposit({ payments: next });

  // ---- retired pay
  const rp = m.retiredPay;
  const writeRp = (patch) => writeMil({ retiredPay: patch });
  const needsWaiver = [RETIRED_PAY_TYPES.REGULAR_LONGEVITY, RETIRED_PAY_TYPES.TERA, RETIRED_PAY_TYPES.OTHER].includes(rp.type);
  const isReserve = rp.type === RETIRED_PAY_TYPES.RESERVE_NONREGULAR;
  const isCh61 = rp.type === RETIRED_PAY_TYPES.DISABILITY_CHAPTER_61;

  // ---- income streams
  const streams = m.incomeStreams ?? [];
  const writeStreams = (next) => writeMil({ incomeStreams: next });
  const updateStream = (id, patch) => writeStreams(streams.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const [newStreamType, setNewStreamType] = useState(STREAM_TYPE_OPTIONS[4].value);
  const addStream = () => {
    const s = createIncomeStream({ type: newStreamType });
    writeStreams([...streams, s]);
  };
  const removeStream = (id) => writeStreams(streams.filter((s) => s.id !== id));

  // ---- SBP and the gross-to-net ledger (pass 10)
  const sbp = m.sbp ?? {};
  const writeSbp = (patch) => writeMil({ sbp: patch });
  const net = m.netPay ?? {};
  const writeNet = (patch) => writeMil({ netPay: patch });

  // ---- uniformed-services TSP, BRS extras, coverage periods (pass 9)
  const uts = m.tsp?.uniformedServices ?? {};
  const writeUts = (patch) => writeMil({ tsp: { uniformedServices: patch } });
  const brs = m.brs ?? { continuationPay: {}, lumpSum: {} };
  const writeBrs = (patch) => writeMil({ brs: patch });
  const coverage = m.coverage ?? [];
  const writeCoverage = (next) => writeMil({ coverage: next });
  const updateCoverage = (id, patch) => writeCoverage(coverage.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCoverage = () => writeCoverage([...coverage, createCoveragePeriod({ source: 'fehb', ownerId: 'primary' })]);
  const removeCoverage = (id) => writeCoverage(coverage.filter((c) => c.id !== id));
  const coverageIssues = (id) => (mil?.issues ?? []).filter((i) => i.entity?.type === 'coveragePeriod' && i.entity?.id === id);

  const deleteAll = () => {
    writeMil(createDefaultMilitary());
    setConfirmDelete(false);
  };
  return { confirmDelete, setConfirmDelete, newStreamType, setNewStreamType, m, writeMil, householdAllowed, active, plan, mil, periodIssues, streamIssues, generalIssues, retiredPayIssues, classificationFor, setConnection, periods, writePeriods, updatePeriod, addPeriod, removePeriod, d, writeDeposit, payments, writePayments, rp, writeRp, needsWaiver, isReserve, isCh61, streams, writeStreams, updateStream, addStream, removeStream, sbp, writeSbp, net, writeNet, uts, writeUts, brs, writeBrs, coverage, writeCoverage, updateCoverage, addCoverage, removeCoverage, coverageIssues, deleteAll };
}

/**
 * Military service and benefits (spec §5.1–§5.7), split into four sections
 * so a Guard member who is also a fed is not scrolling one accordion:
 *
 *   MilitarySection          the connection, service periods, the deposit
 *   MilitaryIncomeSection    retired pay, income streams, SBP and net pay, survivor ages
 *   MilitaryTspSection       the uniformed-services TSP account and BRS extras
 *   MilitaryCoverageSection  health coverage periods per person
 *
 * The last three appear only once a connection is recorded. Every field is
 * a fact the user reads off a record; nothing here infers a status, and every
 * consequence is shown on /plan/military.
 */
export default function MilitarySection({ scenario, write, open, onToggle, canUse }) {
  const { confirmDelete, setConfirmDelete, m, writeMil, active, mil, periodIssues, generalIssues, classificationFor, setConnection, periods, updatePeriod, addPeriod, removePeriod, d, writeDeposit, payments, writePayments, deleteAll } = useMilitary({ scenario, write, canUse });
  return (
    <Section id="military" title="Military service and benefits" summary={militarySummary(scenario)} open={open} onToggle={onToggle}>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Enter dates and amounts from your DD 214, award letters, and statements. FireFed does not ask for a DoD ID, VA file
        number, unit, duty location, or any medical information, and it does not need a document upload.
      </p>

      <RadioField
        name="mil-connection"
        label="Does anyone in this household have current or prior uniformed service, or receive a military- or VA-connected benefit?"
        value={m.connection}
        options={CONNECTION_OPTIONS}
        onChange={setConnection}
      />

      {active ? (
        <>
          <Grid className="mt-4">
            <SelectField
              id="mil-relationship"
              label="Your current relationship to the uniformed services"
              value={m.relationship ?? ''}
              options={RELATIONSHIP_OPTIONS}
              onChange={(v) => writeMil({ relationship: v || null })}
            />
          </Grid>
          <MilitaryNotice className="mt-3" />
          {rulesStatus(m).stale ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100" role="status" data-testid="rules-stale-banner">
              Newer military rules are available ({MILITARY_RULES_VERSION}; this scenario was last resolved under {m.rulesVersion}). Saved calculations keep their own version and are not changed.{' '}
              <button type="button" className="underline underline-offset-2 font-medium" onClick={() => writeMil({ rulesVersion: MILITARY_RULES_VERSION })}>
                Apply current rules to this scenario
              </button>
            </div>
          ) : null}

          {/* ------------------------------------------------ service periods */}
          <SubHeading hint="One entry per period of service as it appears on your DD 214 or orders. Weekend drill and state active duty can be recorded; they are shown but never credited.">
            Service periods
          </SubHeading>
          {periods.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">No service periods yet.</p>
          ) : null}
          <div className="space-y-4">
            {periods.map((p, index) => {
              const years = yearsCovered(p);
              const classified = classificationFor(p.id);
              const others = periods.filter((o) => o.id !== p.id);
              return (
                <fieldset key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4" data-testid={`service-period-${index}`}>
                  <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    Period {index + 1}
                    {classified ? <StatusBadge status={classified.status} /> : null}
                  </legend>
                  <Grid>
                    <SelectField id={`sp-${p.id}-owner`} label="Whose service" value={p.ownerId ?? 'primary'} options={OWNER_OPTIONS} onChange={(v) => updatePeriod(p.id, { ownerId: v })} />
                    <SelectField id={`sp-${p.id}-branch`} label="Branch or service" value={p.branch} options={BRANCH_OPTIONS} onChange={(v) => updatePeriod(p.id, { branch: v })} />
                    <SelectField id={`sp-${p.id}-component`} label="Component" value={p.component} options={COMPONENT_OPTIONS} onChange={(v) => updatePeriod(p.id, { component: v })} />
                    <SelectField id={`sp-${p.id}-duty`} label="Duty status" value={p.dutyStatus} options={DUTY_STATUS_OPTIONS} onChange={(v) => updatePeriod(p.id, { dutyStatus: v })} />
                    <DateField id={`sp-${p.id}-start`} label="Start date" value={p.startDate} onChange={(v) => updatePeriod(p.id, { startDate: v })} />
                    <DateField id={`sp-${p.id}-end`} label="End date" value={p.endDate} onChange={(v) => updatePeriod(p.id, { endDate: v })} hint="The last day of the period, as on the record." />
                    <SelectField id={`sp-${p.id}-character`} label="Character of service" value={p.characterStatus} options={CHARACTER_OPTIONS} onChange={(v) => updatePeriod(p.id, { characterStatus: v })} hint="Read from the record; FireFed does not infer it." />
                    <SelectField id={`sp-${p.id}-doc`} label="Record you have" value={p.documentationStatus} options={DOCUMENTATION_OPTIONS} onChange={(v) => updatePeriod(p.id, { documentationStatus: v })} />
                    <SelectField id={`sp-${p.id}-prov`} label="These dates are" value={p.inputProvenance} options={PROVENANCE_OPTIONS} onChange={(v) => updatePeriod(p.id, { inputProvenance: v })} />
                    {p.dutyStatus === DUTY_STATUS.TITLE32_FULL_TIME ? (
                      <TextField id={`sp-${p.id}-authority`} label="Title 32 section on the orders" value={p.authoritySection} placeholder="e.g. 502" onChange={(v) => updatePeriod(p.id, { authoritySection: v })} hint="Full-time Guard duty is creditable only under sections 316, 502, 503, 504 or 505, and only when it interrupted federal service." />
                    ) : null}
                    <div className="sm:col-span-2 lg:col-span-3">
                      <CheckField id={`sp-${p.id}-userra`} label="This period interrupted my federal civilian employment (I returned under reemployment rights)" checked={p.interruptedFederalService} onChange={(v) => updatePeriod(p.id, { interruptedFederalService: v })} />
                    </div>
                    {others.length > 0 ? (
                      <>
                        <SelectField
                          id={`sp-${p.id}-parent`}
                          label="Sub-period of"
                          value={p.parentPeriodId ?? ''}
                          options={[{ value: '', label: 'Not a sub-period' }, ...others.map((o) => ({ value: o.id, label: `Period ${periods.indexOf(o) + 1}${o.startDate ? ` (${o.startDate})` : ''}` }))]}
                          onChange={(v) => updatePeriod(p.id, { parentPeriodId: v || null, excludedFromDuplicateTotals: Boolean(v) })}
                          hint="For an order that sits inside a longer one, so the days are counted once."
                        />
                      </>
                    ) : null}
                  </Grid>
                  {years.length > 0 ? (
                    <div className="mt-4">
                      <div className="label">Military basic pay by calendar year</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        From your DFAS estimated-earnings statement. Basic pay only, in the dollars of the time; not allowances or bonuses. The deposit is a percentage of these figures.
                      </p>
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
                        {years.map((y) => (
                          <NumberField
                            key={y}
                            id={`sp-${p.id}-pay-${y}`}
                            label={`Basic pay ${y}`}
                            prefix="$"
                            min={0}
                            step={100}
                            allowBlank
                            placeholder="—"
                            value={p.earningsByYear?.[y] ?? null}
                            onCommit={(v) => updatePeriod(p.id, { earningsByYear: { ...(p.earningsByYear ?? {}), [y]: v } })}
                          />
                        ))}
                      </div>
                      {p.interruptedFederalService ? (
                        <div className="mt-3">
                          <div className="label">Civilian basic pay you would have earned, by year</div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">For the reemployment (USERRA) rule: the deposit is the lesser of the military figure and the FERS deductions on this pay.</p>
                          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
                            {years.map((y) => (
                              <NumberField
                                key={y}
                                id={`sp-${p.id}-civ-${y}`}
                                label={`Civilian pay ${y}`}
                                prefix="$"
                                min={0}
                                step={100}
                                allowBlank
                                placeholder="—"
                                value={p.civilianBasicPayByYear?.[y] ?? null}
                                onCommit={(v) => updatePeriod(p.id, { civilianBasicPayByYear: { ...(p.civilianBasicPayByYear ?? {}), [y]: v } })}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <MilitaryIssues issues={periodIssues(p.id)} compact className="mt-3" />
                  <div className="mt-3 flex justify-end">
                    <RemoveButton label={`Remove period ${index + 1}`} onClick={() => removePeriod(p.id)} />
                  </div>
                </fieldset>
              );
            })}
          </div>
          <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1 mt-3" onClick={addPeriod}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add service period
          </button>

          {/* ------------------------------------------------ deposit */}
          <SubHeading hint="Post-1956 service counts toward FERS only once its deposit is paid in full, before you separate. Your agency's figure controls.">
            Military service deposit
          </SubHeading>
          <RadioField name="mil-deposit-mode" label="How do you want to track the deposit?" value={d.mode} options={DEPOSIT_MODE_OPTIONS} onChange={(v) => writeDeposit({ mode: v })} />
          <Grid className="mt-4">
            <SelectField id="mil-deposit-status" label="Where the deposit stands" value={d.status} options={DEPOSIT_STATUS_OPTIONS} onChange={(v) => writeDeposit({ status: v })} />
            <DateField id="mil-deposit-coverage" label="Date first covered by FERS" value={d.firstFersCoverageDate} onChange={(v) => writeDeposit({ firstFersCoverageDate: v })} hint="Interest starts two years after this date. For a return from military service, use the reemployment date." />
            {d.mode === 'official_balance' ? (
              <>
                <NumberField id="mil-deposit-official" label="Official balance from your agency" prefix="$" min={0} step={10} allowBlank placeholder="—" value={d.officialBalance} onCommit={(v) => writeDeposit({ officialBalance: v })} />
                <DateField id="mil-deposit-official-date" label="Balance good through" value={d.officialBalanceThroughDate} onChange={(v) => writeDeposit({ officialBalanceThroughDate: v })} />
              </>
            ) : (
              <DateField id="mil-deposit-iad" label="Interest-accrual date stated by your agency (optional)" value={d.interestAccrualDate} onChange={(v) => writeDeposit({ interestAccrualDate: v })} hint="Overrides the date FireFed derives." />
            )}
            <DateField id="mil-deposit-planned" label="Planned date to pay the balance (optional)" value={d.plannedPaymentDate} onChange={(v) => writeDeposit({ plannedPaymentDate: v })} hint="Must be before you separate. The plan then assumes the payment is made, and labels the credit an estimate." />
          </Grid>

          <div className="mt-4">
            <div className="label">Payments made</div>
            {payments.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">None recorded.</p> : null}
            <div className="space-y-2">
              {payments.map((pay, i) => (
                <div key={pay.id ?? i} className="grid gap-3 sm:grid-cols-3 items-end" data-testid={`deposit-payment-${i}`}>
                  <DateField id={`mil-pay-${i}-date`} label={`Payment ${i + 1} date`} value={pay.date} onChange={(v) => writePayments(payments.map((x, k) => (k === i ? { ...x, date: v } : x)))} />
                  <NumberField id={`mil-pay-${i}-amount`} label={`Payment ${i + 1} amount`} prefix="$" min={0} step={10} value={pay.amount ?? 0} onCommit={(v) => writePayments(payments.map((x, k) => (k === i ? { ...x, amount: v } : x)))} />
                  <div className="pb-2">
                    <RemoveButton label={`Remove payment ${i + 1}`} onClick={() => writePayments(payments.filter((_, k) => k !== i))} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1 mt-2" onClick={() => writePayments([...payments, { id: `pay_${Date.now().toString(36)}`, date: todayIso(), amount: 0, official: true }])}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add payment
            </button>
          </div>

          {mil ? (
            <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm" data-testid="deposit-summary">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Service FireFed modeled</div>
                  <div className="font-medium tabular-nums">
                    {mil.creditYears > 0 ? `${mil.creditYears.toFixed(2)} years` : 'None credited'}{' '}
                    {mil.status ? <StatusBadge status={mil.status} /> : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{mil.deposit.mode === 'official_balance' ? 'Official balance' : 'Estimated principal'}</div>
                  <div className="font-medium tabular-nums">{mil.deposit.mode === 'official_balance' ? money(mil.deposit.officialBalance?.balance) : mil.deposit.principal === null ? '—' : money(mil.deposit.principal)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Estimated interest</div>
                  <div className="font-medium tabular-nums">{mil.deposit.interest === null ? '—' : money(mil.deposit.interest)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Balance as of {mil.deposit.projectionDate}</div>
                  <div className="font-medium tabular-nums">{money(mil.deposit.balance)}</div>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                This is not an official service-credit determination. Your employing agency and OPM control the final credit and
                deposit amount. Next steps: request your estimated earnings from DFAS, submit SF 3108 through your agency, and keep
                the paid-in-full notice with your retirement records. The deposit generally must be completed before separation.
              </p>
              {mil.deposit.interestAccrualDate ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Interest accrues from {mil.deposit.interestAccrualDate}; the next posting is {mil.deposit.nextPostingDate}.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ------------------------------------------------ general issues, links, delete */}
          <MilitaryIssues issues={generalIssues} className="mt-6" />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link to="/plan/military" className="btn-primary btn-sm">
              See the military results
            </Link>
            {confirmDelete ? (
              <span className="inline-flex items-center gap-3 text-sm">
                <span>Delete every service period, deposit entry, retired-pay fact, and income stream?</span>
                <button type="button" className="focus-ring text-red-700 dark:text-red-300 font-medium underline underline-offset-2" onClick={deleteAll}>
                  Yes, delete all military data
                </button>
                <button type="button" className="focus-ring underline underline-offset-2" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <RemoveButton label="Delete all military data" onClick={() => setConfirmDelete(true)} />
            )}
          </div>
        </>
      ) : null}
    </Section>
  );
}

export function MilitaryIncomeSection({ scenario, write, open, onToggle, canUse }) {
  const { newStreamType, setNewStreamType, m, householdAllowed, mil, streamIssues, retiredPayIssues, rp, writeRp, needsWaiver, isReserve, isCh61, streams, updateStream, addStream, removeStream, sbp, writeSbp, net, writeNet, active } = useMilitary({ scenario, write, canUse });
  if (!active) return null;
  return (
    <Section id="military-income" title="Military retired pay, VA, and survivor income" summary={incomeSummary(m)} open={open} onToggle={onToggle}>
          {/* ------------------------------------------------ retired pay */}
          <SubHeading hint="Whether your service can count toward FERS depends on the kind of retired pay you draw. FireFed cannot tell from the amount; you read the type from your retirement orders.">
            Military retired pay
          </SubHeading>
          <RadioField name="mil-rp-receives" label="Do you receive, or expect to receive, military retired pay?" value={rp.receives} options={RECEIPT_OPTIONS} onChange={(v) => writeRp({ receives: v })} />
          {rp.receives === RETIRED_PAY_RECEIPT.YES ? (
            <Grid className="mt-4">
              <SelectField id="mil-rp-type" label="Type of retirement" value={rp.type ?? ''} options={RETIRED_PAY_TYPE_OPTIONS} onChange={(v) => writeRp({ type: v || null })} />
              <SelectField id="mil-rp-determination" label="Agency or OPM determination on crediting the service" value={rp.officialDeterminationStatus} options={DETERMINATION_OPTIONS} onChange={(v) => writeRp({ officialDeterminationStatus: v })} />
              {isCh61 ? (
                <SelectField id="mil-rp-ch61" label="Combat or instrumentality-of-war finding" value={rp.chapter61Exception} options={CHAPTER_61_OPTIONS} onChange={(v) => writeRp({ chapter61Exception: v })} hint="An official finding on the award, not a self-assessment." />
              ) : null}
              {isReserve || isCh61 ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <CheckField id="mil-rp-ack" label="I understand my agency and OPM decide whether this exception applies; FireFed models the consequence of that decision." checked={rp.exceptionAcknowledged} onChange={(v) => writeRp({ exceptionAcknowledged: v })} />
                </div>
              ) : null}
              {needsWaiver ? (
                <>
                  <SelectField id="mil-rp-waiver" label="Waiver of retired pay" value={rp.waiver?.mode ?? WAIVER_MODES.NONE} options={WAIVER_MODE_OPTIONS} onChange={(v) => writeRp({ waiver: { ...(rp.waiver ?? {}), mode: v } })} hint="FireFed never prepares or submits a waiver. Record it here only once you have elected it with your agency." />
                  {rp.waiver?.mode === WAIVER_MODES.ELECTED ? (
                    <NumberField id="mil-rp-waiver-age" label="Waiver effective at age" min={40} max={80} allowBlank placeholder="FERS annuity start" value={rp.waiver?.effectiveAge ?? null} onCommit={(v) => writeRp({ waiver: { ...(rp.waiver ?? {}), effectiveAge: v } })} hint="Leave blank to use the age your FERS annuity begins." />
                  ) : null}
                </>
              ) : null}
            </Grid>
          ) : null}

          {/* ------------------------------------------------ income streams */}
          <SubHeading hint="One card per stream, never one combined figure: each has its own tax treatment and adjustment. Enter the gross amount from the award letter or statement.">
            Military and VA income
          </SubHeading>
          {streams.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">No income streams yet.</p> : null}
          <div className="space-y-4">
            {streams.map((s, index) => {
              const isVa = s.type === VA_DISABILITY_TYPE;
              const isDisabilityRp = s.type === DISABILITY_RETIRED_PAY_TYPE;
              const officialOnly = OFFICIAL_ONLY_TYPES.has(s.type);
              const va = s.vaEstimate ?? {};
              const writeVa = (patch) => updateStream(s.id, { vaEstimate: { ...va, ...patch }, amountStatus: 'estimated' });
              return (
                <fieldset key={s.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4" data-testid={`income-stream-${index}`}>
                  <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-200">{s.label}</legend>
                  <Grid>
                    <SelectField id={`is-${s.id}-owner`} label="Whose income" value={s.ownerId ?? 'primary'} options={OWNER_OPTIONS} onChange={(v) => updateStream(s.id, { ownerId: v })} />
                    <NumberField id={`is-${s.id}-amount`} label="Gross amount" prefix="$" min={0} step={10} allowBlank placeholder={isVa ? 'From your award letter' : '—'} value={s.grossAmount} onCommit={(v) => { updateStream(s.id, { grossAmount: v }); if (v && s.amountStatus === 'official') trackEvent('official_amount_used'); }} />
                    <SelectField id={`is-${s.id}-freq`} label="Frequency" value={s.frequency} options={FREQUENCY_OPTIONS} onChange={(v) => updateStream(s.id, { frequency: v })} />
                    <SelectField id={`is-${s.id}-status`} label="This amount is" value={s.amountStatus} options={AMOUNT_STATUS_OPTIONS} onChange={(v) => updateStream(s.id, { amountStatus: v })} hint={officialOnly ? 'CRDP and CRSC are projected only from an official amount.' : undefined} />
                    <DateField id={`is-${s.id}-asof`} label="Amount as of" value={s.officialAmountAsOfDate} onChange={(v) => updateStream(s.id, { officialAmountAsOfDate: v })} hint="The date on the letter or statement." />
                    <NumberField id={`is-${s.id}-start`} label="Starts at age" min={17} max={100} allowBlank placeholder="Already paying" value={s.startAge} onCommit={(v) => updateStream(s.id, { startAge: v })} />
                    <NumberField id={`is-${s.id}-end`} label="Ends at age" min={17} max={110} allowBlank placeholder="For life" value={s.endAge} onCommit={(v) => updateStream(s.id, { endAge: v })} />
                    <SelectField id={`is-${s.id}-cola`} label="Cost-of-living adjustment" value={s.colaPolicy} options={COLA_OPTIONS} onChange={(v) => updateStream(s.id, { colaPolicy: v })} />
                    {s.colaPolicy === COLA_POLICIES.USER_RATE ? (
                      <NumberField id={`is-${s.id}-cola-rate`} label="Annual adjustment" suffix="%" min={0} max={10} step={0.1} value={s.colaRate === null || s.colaRate === undefined ? 2 : s.colaRate * 100} onCommit={(v) => updateStream(s.id, { colaRate: v / 100 })} />
                    ) : null}
                    {isDisabilityRp ? (
                      <SelectField id={`is-${s.id}-tax`} label="Federal tax treatment on your 1099-R" value={s.federalTaxClassOverride ?? ''} options={TAX_CLASS_OPTIONS} onChange={(v) => updateStream(s.id, { federalTaxClassOverride: v || null })} />
                    ) : null}
                  </Grid>
                  {isVa && !(Number(s.grossAmount) > 0) ? (
                    <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
                      <div className="label">No award letter to hand? Estimate from the rate table</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Enter the monthly amount from your current VA award if available. FireFed does not estimate conditions, advise on
                        claims, or predict future ratings. This reads the published table for the rating and dependents you enter and is
                        labelled an estimate.
                      </p>
                      <Grid>
                        <SelectField id={`is-${s.id}-va-rating`} label="Combined rating" value={va.rating ? String(va.rating) : ''} options={VA_RATING_OPTIONS} onChange={(v) => writeVa({ rating: v ? Number(v) : null })} />
                        <div className="sm:col-span-2 lg:col-span-1">
                          <CheckField id={`is-${s.id}-va-spouse`} label="Spouse" checked={va.spouse} onChange={(v) => writeVa({ spouse: v })} />
                          <CheckField id={`is-${s.id}-va-aa`} label="Spouse receives aid and attendance" checked={va.spouseAidAttendance} onChange={(v) => writeVa({ spouseAidAttendance: v })} />
                        </div>
                        <NumberField id={`is-${s.id}-va-kids`} label="Children under 18" min={0} max={12} stepper value={va.childrenUnder18 ?? 0} onCommit={(v) => writeVa({ childrenUnder18: v })} />
                        <NumberField id={`is-${s.id}-va-school`} label="Children over 18 in school" min={0} max={12} stepper value={va.childrenInSchool ?? 0} onCommit={(v) => writeVa({ childrenInSchool: v })} />
                        <NumberField id={`is-${s.id}-va-parents`} label="Dependent parents" min={0} max={2} stepper value={va.parents ?? 0} onCommit={(v) => writeVa({ parents: v })} />
                      </Grid>
                    </div>
                  ) : null}
                  <MilitaryIssues issues={streamIssues(s.id)} compact className="mt-3" />
                  <div className="mt-3 flex justify-end">
                    <RemoveButton label={`Remove ${s.label}`} onClick={() => removeStream(s.id)} />
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem]">
              <SelectField id="mil-new-stream-type" label="Add income" value={newStreamType} options={STREAM_TYPE_OPTIONS} onChange={setNewStreamType} />
            </div>
            <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1" onClick={addStream}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>

          {/* ------------------------------------------------ SBP and gross-to-net */}
          {m.retiredPay?.receives === 'yes' || streams.some((s) => ['longevity_retired_pay', 'reserve_retired_pay', 'disability_retired_pay'].includes(s.type)) ? (
            <div data-testid="sbp-panel">
              <SubHeading hint="The Survivor Benefit Plan election as it appears on your retirement orders or Retiree Account Statement. FireFed models the election you record; it never recommends one.">
                Survivor Benefit Plan and net pay
              </SubHeading>
              <Grid>
                <SelectField id="mil-sbp-elected" label="SBP coverage" value={sbp.elected ?? 'unknown'} options={SBP_ELECTED_OPTIONS} onChange={(v) => writeSbp({ elected: v })} />
                {sbp.elected === 'yes' ? (
                  <>
                    <SelectField id="mil-sbp-category" label="Beneficiary category" value={sbp.category ?? 'unknown'} options={SBP_CATEGORY_OPTIONS} onChange={(v) => writeSbp({ category: v })} />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <CheckField id="mil-sbp-fullbase" label="Covered base is full gross retired pay" checked={sbp.fullBase !== false} onChange={(v) => writeSbp({ fullBase: v })} />
                    </div>
                    {sbp.fullBase === false ? <NumberField id="mil-sbp-base" label="Elected base per month" prefix="$" min={0} step={10} allowBlank placeholder="—" value={sbp.electedBase ?? null} onCommit={(v) => writeSbp({ electedBase: v })} hint="At least $300." /> : null}
                    <DateField id="mil-sbp-date" label="Election date" value={sbp.electionDate} onChange={(v) => writeSbp({ electionDate: v })} />
                    <NumberField id="mil-sbp-premium" label="Official premium per month (optional)" prefix="$" min={0} step={1} allowBlank placeholder="6.5% of base" value={sbp.officialPremiumMonthly ?? null} onCommit={(v) => writeSbp({ officialPremiumMonthly: v })} />
                    <NumberField id="mil-sbp-annuity" label="Official survivor annuity per month (optional)" prefix="$" min={0} step={1} allowBlank placeholder="55% of base" value={sbp.officialAnnuityMonthly ?? null} onCommit={(v) => writeSbp({ officialAnnuityMonthly: v })} />
                    <NumberField id="mil-sbp-paid" label="Premiums paid so far (months)" min={0} max={600} stepper value={sbp.premiumsPaidToDate ?? 0} onCommit={(v) => writeSbp({ premiumsPaidToDate: v })} hint="Paid up at age 70 with 360 payments." />
                    <SelectField id="mil-sbp-prov" label="These figures are" value={sbp.provenance ?? 'user_estimate'} options={PROVENANCE_OPTIONS} onChange={(v) => writeSbp({ provenance: v })} />
                  </>
                ) : null}
                <div className="sm:col-span-2 lg:col-span-3">
                  <CheckField id="mil-rcsbp" label="Reserve Component SBP (RCSBP) election in place" checked={Boolean(sbp.rcsbp?.elected)} onChange={(v) => writeSbp({ rcsbp: { ...(sbp.rcsbp ?? {}), elected: v } })} />
                </div>
                {sbp.rcsbp?.elected ? (
                  <>
                    <SelectField id="mil-rcsbp-option" label="RCSBP option" value={sbp.rcsbp.option ?? ''} options={RCSBP_OPTION_OPTIONS} onChange={(v) => writeSbp({ rcsbp: { ...sbp.rcsbp, option: v || null } })} />
                    <NumberField id="mil-rcsbp-premium" label="Official RCSBP premium per month" prefix="$" min={0} step={1} allowBlank placeholder="—" value={sbp.rcsbp.officialPremiumMonthly ?? null} onCommit={(v) => writeSbp({ rcsbp: { ...sbp.rcsbp, officialPremiumMonthly: v } })} />
                    <NumberField id="mil-rcsbp-annuity" label="Official RCSBP annuity per month" prefix="$" min={0} step={1} allowBlank placeholder="—" value={sbp.rcsbp.officialAnnuityMonthly ?? null} onCommit={(v) => writeSbp({ rcsbp: { ...sbp.rcsbp, officialAnnuityMonthly: v } })} />
                    <SelectField id="mil-rcsbp-prov" label="These RCSBP figures are" value={sbp.rcsbp.provenance ?? 'user_estimate'} options={PROVENANCE_OPTIONS} onChange={(v) => writeSbp({ rcsbp: { ...sbp.rcsbp, provenance: v } })} />
                  </>
                ) : null}
              </Grid>
              <div className="mt-4">
                <div className="label">Gross to net: official adjustments and withholding assumptions</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">From your Retiree Account Statement and VA award letter. FireFed does not compute concurrent receipt.</p>
                <Grid>
                  <NumberField id="mil-net-va" label="VA waiver / offset per month" prefix="$" min={0} step={1} value={net.vaWaiverMonthly ?? 0} onCommit={(v) => writeNet({ vaWaiverMonthly: v })} />
                  <NumberField id="mil-net-crdp" label="CRDP restored per month" prefix="$" min={0} step={1} value={net.crdpMonthly ?? 0} onCommit={(v) => writeNet({ crdpMonthly: v })} />
                  <NumberField id="mil-net-crsc" label="CRSC per month" prefix="$" min={0} step={1} value={net.crscMonthly ?? 0} onCommit={(v) => writeNet({ crscMonthly: v })} />
                  <NumberField id="mil-net-fed" label="Federal withholding assumption" suffix="%" min={0} max={50} step={0.5} value={(net.federalWithholdingRate ?? 0) * 100} onCommit={(v) => writeNet({ federalWithholdingRate: (v ?? 0) / 100 })} />
                  <NumberField id="mil-net-state" label="State withholding assumption" suffix="%" min={0} max={20} step={0.5} value={(net.stateWithholdingRate ?? 0) * 100} onCommit={(v) => writeNet({ stateWithholdingRate: (v ?? 0) / 100 })} />
                  <NumberField id="mil-net-other" label="Other official deductions per month" prefix="$" min={0} step={1} value={net.otherDeductionsMonthly ?? 0} onCommit={(v) => writeNet({ otherDeductionsMonthly: v })} />
                  <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-x-6 gap-y-2">
                    <CheckField id="mil-net-official" label="These adjustments are from official statements" checked={Boolean(net.adjustmentsOfficial)} onChange={(v) => writeNet({ adjustmentsOfficial: v })} />
                    <CheckField id="mil-net-ras" label="This ledger matches my Retiree Account Statement" checked={Boolean(net.reconciledToRas)} onChange={(v) => writeNet({ reconciledToRas: v })} />
                  </div>
                </Grid>
              </div>
              {mil?.ledger ? (
                <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm" data-testid="ledger-summary">
                  {mil.ledger.label}: {money(mil.ledger.net)} per month from {money(mil.retiredPayMonthly)} gross{mil.sbp?.applies ? `; SBP premium ${money(mil.sbp.premiumMonthly)}, survivor annuity ${money(mil.sbp.annuityMonthly)}` : ''}. Details on the results page.
                </div>
              ) : null}
              <MilitaryIssues issues={(mil?.issues ?? []).filter((i) => String(i.code).startsWith('MRT_SBP') || String(i.code).startsWith('MRT_RCSBP') || i.code === 'MRT_CONCURRENT_RECEIPT_MANUAL' || i.code === 'MRT_NET_NOT_RECONCILED')} className="mt-3" compact />
            </div>
          ) : null}

          {/* ------------------------------------------------ survivor scenario */}
          <SubHeading hint="Optional. Only the military and VA streams follow these ages today: a stream stops on its owner's death and survivor streams (SBP, DIC) start.">
            <span className="inline-flex items-center gap-2">Survivor scenario {householdAllowed ? null : <ProBadge />}</span>
          </SubHeading>
          {!householdAllowed ? <ProNotice reason="military_survivor_pro">Model a death and the survivor streams with Pro.</ProNotice> : null}
          <fieldset disabled={!householdAllowed} className="min-w-0 disabled:opacity-60">
            <Grid>
              <NumberField id="mil-death-primary" label="Your age at death (optional)" min={40} max={110} allowBlank placeholder="Not modeled" value={scenario.household?.deathAges?.primary ?? null} disabled={!householdAllowed} onCommit={(v) => write({ household: { deathAges: { primary: v } } })} />
              <NumberField id="mil-death-spouse" label="Spouse age at death (optional)" min={40} max={110} allowBlank placeholder="Not modeled" value={scenario.household?.deathAges?.spouse ?? null} disabled={!householdAllowed} onCommit={(v) => write({ household: { deathAges: { spouse: v } } })} />
            </Grid>
          </fieldset>

          <MilitaryIssues issues={[...retiredPayIssues, ...(mil?.issues ?? []).filter((i) => i.entity?.type === 'incomeStream' && !streams.some((s) => s.id === i.entity.id))]} className="mt-6" />
          <div className="mt-6">
            <Link to="/plan/military" className="btn-primary btn-sm">
              See the military results
            </Link>
          </div>
    </Section>
  );
}

export function MilitaryTspSection({ scenario, write, open, onToggle, canUse }) {
  const { m, writeMil, mil, uts, writeUts, brs, writeBrs, active } = useMilitary({ scenario, write, canUse });
  if (!active) return null;
  return (
    <Section id="military-tsp" title="Uniformed-services TSP and BRS" summary={tspSummary(m)} open={open} onToggle={onToggle}>
          {/* ------------------------------------------------ uniformed-services TSP */}
          <SubHeading hint="A second TSP account, kept apart from your civilian one. Your own contributions to both share one yearly limit; service and agency contributions do not. Balances from your TSP statement.">
            Uniformed-services TSP
          </SubHeading>
          <div data-testid="uniformed-tsp">
            <CheckField id="mil-utsp-enabled" label="I have a uniformed-services TSP account" checked={Boolean(uts.enabled)} onChange={(v) => writeUts({ enabled: v })} />
            {uts.enabled ? (
              <>
                <Grid className="mt-3">
                  <SelectField id="mil-utsp-system" label="Retirement system for this account" value={uts.coverageSystem ?? 'neither'} options={UNIFORMED_TSP_SYSTEM_OPTIONS} onChange={(v) => writeUts({ coverageSystem: v })} hint="Read from your record. BRS members receive service automatic and matching contributions; legacy members do not." />
                  <NumberField id="mil-utsp-months" label="Months of uniformed service" min={0} max={600} allowBlank placeholder="—" value={uts.monthsOfService ?? null} onCommit={(v) => writeUts({ monthsOfService: v })} hint="Decides when BRS contributions start and when the 1% vests. Civilian service never counts here." />
                  <NumberField id="mil-utsp-trad" label="Traditional balance (taxable)" prefix="$" min={0} step={100} value={uts.traditionalTaxableBalance ?? 0} onCommit={(v) => writeUts({ traditionalTaxableBalance: v })} />
                  <NumberField id="mil-utsp-exempt" label="Tax-exempt (combat-zone) balance" prefix="$" min={0} step={100} allowBlank placeholder="None" value={uts.traditionalTaxExemptBasis ?? null} onCommit={(v) => writeUts({ traditionalTaxExemptBasis: v })} hint="Shown separately on the TSP statement. Returned tax-free, pro rata, on withdrawal." />
                  <NumberField id="mil-utsp-roth" label="Roth balance" prefix="$" min={0} step={100} value={uts.rothBalance ?? 0} onCommit={(v) => writeUts({ rothBalance: v })} />
                  <NumberField id="mil-utsp-unvested" label="Unvested automatic (1%) balance" prefix="$" min={0} step={100} value={uts.unvestedAutomaticBalance ?? 0} onCommit={(v) => writeUts({ unvestedAutomaticBalance: v })} hint="Forfeited if service ends before it vests." />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <CheckField id="mil-utsp-cz" label="This account has received tax-exempt combat-zone contributions" checked={Boolean(uts.hasCombatZoneContributions)} onChange={(v) => writeUts({ hasCombatZoneContributions: v })} />
                  </div>
                  {uts.coverageSystem === 'brs' ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <CheckField id="mil-utsp-optin" label="I opted into BRS in 2018 (rather than being enrolled on entry)" checked={Boolean(uts.brsOptedIn)} onChange={(v) => writeUts({ brsOptedIn: v })} />
                    </div>
                  ) : null}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <CheckField id="mil-utsp-contributing" label="I am contributing from military pay now" checked={Boolean(uts.contributing)} onChange={(v) => writeUts({ contributing: v })} />
                  </div>
                  {uts.contributing ? (
                    <>
                      <NumberField id="mil-utsp-basicpay" label="Monthly basic pay" prefix="$" min={0} step={50} value={uts.monthlyBasicPay ?? 0} onCommit={(v) => writeUts({ monthlyBasicPay: v })} hint="Drill pay for Guard and Reserve; the monthly rate for active orders." />
                      <NumberField id="mil-utsp-pct" label="My contribution" suffix="%" min={0} max={100} step={1} value={uts.employeePercent ?? 0} onCommit={(v) => writeUts({ employeePercent: v })} />
                      <SelectField id="mil-utsp-kind" label="Contribution type" value={uts.contributionType ?? 'traditional'} options={TSP_CONTRIBUTION_KIND_OPTIONS} onChange={(v) => writeUts({ contributionType: v })} />
                      <NumberField id="mil-utsp-end" label="Contributing until age" min={18} max={75} allowBlank placeholder="Federal separation" value={uts.contributionEndAge ?? null} onCommit={(v) => writeUts({ contributionEndAge: v })} hint="Blank runs to your federal separation, or through this year if you have already separated. Guard and Reserve members often use 60." />
                      <NumberField id="mil-utsp-czannual" label="Of which from tax-exempt combat-zone pay, per year" prefix="$" min={0} step={100} value={uts.combatZoneTaxExemptAnnual ?? 0} onCommit={(v) => writeUts({ combatZoneTaxExemptAnnual: v })} hint="Outside the elective-deferral limit, inside the annual-additions limit." />
                      <NumberField id="mil-utsp-ytd" label="Contributed so far this year (this account)" prefix="$" min={0} step={100} value={uts.ytdEmployeeDeferrals ?? 0} onCommit={(v) => writeUts({ ytdEmployeeDeferrals: v })} />
                      <NumberField id="mil-utsp-periods" label="Pay periods per year (this account)" min={1} max={53} stepper value={uts.payPeriodsPerYear ?? 12} onCommit={(v) => writeUts({ payPeriodsPerYear: v })} />
                    </>
                  ) : null}
                  <NumberField id="mil-ctsp-ytd" label="Contributed so far this year (civilian account)" prefix="$" min={0} step={100} value={m.tsp?.civilian?.ytdEmployeeDeferrals ?? 0} onCommit={(v) => writeMil({ tsp: { civilian: { ...(m.tsp?.civilian ?? {}), ytdEmployeeDeferrals: v } } })} />
                  <NumberField id="mil-tsp-other" label="Other plans sharing the limit this year" prefix="$" min={0} step={100} value={m.tsp?.otherSharedPlanDeferrals ?? 0} onCommit={(v) => writeMil({ tsp: { otherSharedPlanDeferrals: v } })} hint="A 401(k) or 403(b) from another employer counts against the same limit." />
                </Grid>
                {mil?.tsp ? (
                  <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm" data-testid="tsp-coordination-summary">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>Shared limit {money(mil.tsp.limits.total)}{mil.tsp.limits.catchUpApplies ? ' (with catch-up)' : ''}</span>
                      <span>Planned this year {money(mil.tsp.sharedDeferrals.total)}</span>
                      <span>Room left {money(mil.tsp.remainingRoom)}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Matches are computed separately for each account. Details on the results page.</p>
                  </div>
                ) : null}
                <MilitaryIssues issues={(mil?.issues ?? []).filter((i) => i.entity?.type === 'tspAccount' || String(i.code).startsWith('MIL_TSP') || String(i.code).startsWith('MIL_USERRA'))} className="mt-3" compact />
              </>
            ) : null}
          </div>

          {/* ------------------------------------------------ BRS extras */}
          {uts.coverageSystem === 'brs' ? (
            <div data-testid="brs-extras">
              <SubHeading hint="Continuation pay is modeled only from your service's official offer; there is no standard multiple. The lump sum needs the DoD discount rate for the year, entered from the memorandum.">
                BRS: continuation pay and lump sum
              </SubHeading>
              <CheckField id="mil-brs-cp" label="I have an official continuation-pay offer" checked={Boolean(brs.continuationPay?.offered)} onChange={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, offered: v } })} />
              {brs.continuationPay?.offered ? (
                <Grid className="mt-3">
                  <NumberField id="mil-brs-cp-mult" label="Multiple of monthly basic pay" min={0} max={13} step={0.5} allowBlank placeholder="—" value={brs.continuationPay.multiple ?? null} onCommit={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, multiple: v } })} />
                  <NumberField id="mil-brs-cp-pay" label="Monthly basic pay on the offer" prefix="$" min={0} step={50} allowBlank placeholder="—" value={brs.continuationPay.monthlyBasicPay ?? null} onCommit={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, monthlyBasicPay: v } })} />
                  <DateField id="mil-brs-cp-date" label="Payment date" value={brs.continuationPay.paymentDate} onChange={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, paymentDate: v } })} />
                  <NumberField id="mil-brs-cp-inst" label="Installments" min={1} max={4} stepper value={brs.continuationPay.installments ?? 1} onCommit={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, installments: v } })} />
                  <NumberField id="mil-brs-cp-oblig" label="Additional service owed (years)" min={0} max={10} stepper value={brs.continuationPay.obligationYears ?? 4} onCommit={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, obligationYears: v } })} />
                  <SelectField id="mil-brs-cp-prov" label="These figures are" value={brs.continuationPay.provenance ?? 'user_estimate'} options={PROVENANCE_OPTIONS} onChange={(v) => writeBrs({ continuationPay: { ...brs.continuationPay, provenance: v } })} hint="Only an official offer is included in the total." />
                </Grid>
              ) : null}
              <Grid className="mt-3">
                <SelectField id="mil-brs-ls" label="Lump-sum scenario" value={String(brs.lumpSum?.electionPercent ?? 0)} options={LUMP_SUM_OPTIONS} onChange={(v) => writeBrs({ lumpSum: { ...brs.lumpSum, electionPercent: Number(v) } })} hint="Uses the current BRS calculation saved from the Military Retirement Calculator." />
                {Number(brs.lumpSum?.electionPercent) > 0 ? (
                  <>
                    <NumberField id="mil-brs-ls-rate" label="DoD lump-sum discount rate" suffix="%" min={0} max={20} step={0.01} allowBlank placeholder="—" value={brs.lumpSum.officialDiscountRate === null || brs.lumpSum.officialDiscountRate === undefined ? null : brs.lumpSum.officialDiscountRate * 100} onCommit={(v) => writeBrs({ lumpSum: { ...brs.lumpSum, officialDiscountRate: v === null ? null : v / 100 } })} hint="From the annual DoD memorandum. FireFed does not substitute a rate." />
                    <NumberField id="mil-brs-ls-year" label="Rate year" min={2018} max={2100} allowBlank placeholder="—" value={brs.lumpSum.discountRateYear ?? null} onCommit={(v) => writeBrs({ lumpSum: { ...brs.lumpSum, discountRateYear: v } })} />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <CheckField id="mil-brs-ls-va" label="My VA waiver / offset facts are recorded (otherwise the scenario is gross only)" checked={Boolean(brs.lumpSum.vaOffsetKnown)} onChange={(v) => writeBrs({ lumpSum: { ...brs.lumpSum, vaOffsetKnown: v } })} />
                    </div>
                  </>
                ) : null}
              </Grid>
              <MilitaryIssues issues={(mil?.issues ?? []).filter((i) => String(i.code).startsWith('MRT_BRS'))} className="mt-3" compact />
            </div>
          ) : null}
    </Section>
  );
}

export function MilitaryCoverageSection({ scenario, write, open, onToggle, canUse }) {
  const { coverage, updateCoverage, addCoverage, removeCoverage, coverageIssues, active, m } = useMilitary({ scenario, write, canUse });
  if (!active) return null;
  return (
    <Section id="military-coverage" title="Health coverage by person" summary={coverageSummary(m)} open={open} onToggle={onToggle}>
          {/* ------------------------------------------------ health coverage periods */}
          <SubHeading hint="One row per person per period of coverage. FireFed costs the coverage you confirm; it does not decide who is eligible. A combination that breaks a current rule is flagged, never silently replaced.">
            Health coverage by person
          </SubHeading>
          <div className="space-y-4" data-testid="coverage-periods">
            {coverage.map((c, index) => {
              const cIssues = coverageIssues(c.id);
              const isTricareTable = ['trs', 'trr', 'chcbp', 'tricare_prime', 'tricare_select'].includes(c.source);
              return (
                <fieldset key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4" data-testid={`coverage-period-${index}`}>
                  <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-200">Coverage {index + 1}</legend>
                  <Grid>
                    <SelectField id={`cov-${c.id}-owner`} label="Who is covered" value={c.ownerId ?? 'primary'} options={OWNER_OPTIONS} onChange={(v) => updateCoverage(c.id, { ownerId: v })} />
                    <SelectField id={`cov-${c.id}-source`} label="Coverage" value={c.source} options={COVERAGE_SOURCE_OPTIONS} onChange={(v) => updateCoverage(c.id, { source: v })} />
                    <SelectField id={`cov-${c.id}-rel`} label="Relationship to the sponsor" value={c.relationship ?? 'sponsor'} options={COVERAGE_RELATIONSHIP_OPTIONS} onChange={(v) => updateCoverage(c.id, { relationship: v })} />
                    <SelectField id={`cov-${c.id}-enroll`} label="Enrollment type" value={c.enrollmentType ?? 'self'} options={COVERAGE_ENROLLMENT_OPTIONS} onChange={(v) => updateCoverage(c.id, { enrollmentType: v })} />
                    <DateField id={`cov-${c.id}-start`} label="Coverage starts" value={c.startDate} onChange={(v) => updateCoverage(c.id, { startDate: v })} />
                    <DateField id={`cov-${c.id}-end`} label="Coverage ends (blank = ongoing)" value={c.endDate} onChange={(v) => updateCoverage(c.id, { endDate: v })} />
                    <NumberField id={`cov-${c.id}-prem`} label="Monthly premium" prefix="$" min={0} step={5} allowBlank placeholder={isTricareTable ? 'Program table' : '0'} value={c.monthlyPremium ?? null} onCommit={(v) => updateCoverage(c.id, { monthlyPremium: v })} hint={isTricareTable ? 'Blank uses the TRICARE table for the last verified year.' : undefined} />
                    <NumberField id={`cov-${c.id}-oop`} label="Expected out-of-pocket per year" prefix="$" min={0} step={100} value={c.outOfPocketAnnual?.base ?? 0} onCommit={(v) => updateCoverage(c.id, { outOfPocketAnnual: { ...(c.outOfPocketAnnual ?? {}), base: v } })} />
                    <DateField id={`cov-${c.id}-pa`} label="Medicare Part A from" value={c.medicare?.partADate} onChange={(v) => updateCoverage(c.id, { medicare: { ...(c.medicare ?? {}), partADate: v } })} />
                    <DateField id={`cov-${c.id}-pb`} label="Medicare Part B from" value={c.medicare?.partBDate} onChange={(v) => updateCoverage(c.id, { medicare: { ...(c.medicare ?? {}), partBDate: v } })} hint="TRICARE For Life and CHAMPVA at 65 need Part B; its premium stays in the projection." />
                    <NumberField id={`cov-${c.id}-pbprem`} label="Part B premium per month" prefix="$" min={0} step={1} allowBlank placeholder="Standard" value={c.medicare?.partBPremiumMonthly ?? null} onCommit={(v) => updateCoverage(c.id, { medicare: { ...(c.medicare ?? {}), partBPremiumMonthly: v } })} />
                    <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-x-6 gap-y-2">
                      <CheckField id={`cov-${c.id}-enr`} label="Enrollment confirmed" checked={Boolean(c.enrollmentConfirmed)} onChange={(v) => updateCoverage(c.id, { enrollmentConfirmed: v })} />
                      <CheckField id={`cov-${c.id}-elig`} label="Eligibility confirmed by the program" checked={Boolean(c.eligibilityConfirmed)} onChange={(v) => updateCoverage(c.id, { eligibilityConfirmed: v })} />
                    </div>
                  </Grid>
                  <MilitaryIssues issues={cIssues} className="mt-3" compact />
                  <div className="mt-3 flex justify-end">
                    <RemoveButton label={`Remove coverage ${index + 1}`} onClick={() => removeCoverage(c.id)} />
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="mt-3">
            <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1" onClick={addCoverage}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add coverage period
            </button>
          </div>
    </Section>
  );
}
