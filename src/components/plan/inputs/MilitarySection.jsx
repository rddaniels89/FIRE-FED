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

/**
 * Military service and benefits (spec §5.1–§5.7). One section, five panels:
 * the connection, service periods, the deposit, retired pay, and income
 * streams. Every field is a fact the user reads off a record; nothing here
 * infers a status, and every consequence is shown on /plan/military.
 */
export default function MilitarySection({ scenario, write, open, onToggle, canUse }) {
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
  const generalIssues = (mil?.issues ?? []).filter((i) => !i.entity || (i.entity.type !== 'servicePeriod' && i.entity.type !== 'incomeStream'));
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

  const deleteAll = () => {
    writeMil(createDefaultMilitary());
    setConfirmDelete(false);
  };

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
