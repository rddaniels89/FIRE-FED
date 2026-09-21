import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useScenario } from '../../contexts/ScenarioContext';
import { useAuth } from '../../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../../lib/entitlements';
import { resolveRetirementPlan } from '../../lib/projection/plan';
import { buildTimeline } from '../../lib/projection/timeline';
import { compareMilitaryDeposit } from '../../lib/military/depositComparison';
import { compareRetiredPayWaiver } from '../../lib/military/retiredPayComparison';
import { RETIRED_PAY_WAIVER_WARNING } from '../../lib/military/retiredPayWaiver';
import { ISSUE_SEVERITY } from '../../lib/military/status';
import { COVERAGE_LABELS } from '../../lib/military/coverage';
import { listRulesByCategory } from '../../lib/rules/registry';
import { trackEvent } from '../../lib/telemetry';
import HowCalculated from '../HowCalculated';
import ProjectionDisclaimer from '../ProjectionDisclaimer';
import PlanEmptyState from './PlanEmptyState';
import MilitaryIssues, { MilitaryNotice, StatusBadge } from './MilitaryIssues';
import { ProBadge, ProNotice } from './inputs/fields';
import { DUTY_STATUS_LABELS, FEDERAL_TAX_CLASS_LABELS, RETIRED_PAY_TYPE_LABELS, STREAM_TYPE_LABELS } from './inputs/militaryOptions';
import { fmtMoney } from './planFormat';

const yrs = (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)} years` : '—');
const ageOr = (v) => (v === null || v === undefined ? '—' : String(v));
const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`;

function View({ id, title, lede, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mb-10">
      <h2 id={`${id}-heading`} className="text-2xl font-bold navy-text mb-1">
        {title}
      </h2>
      {lede ? <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{lede}</p> : null}
      {children}
    </section>
  );
}

function Stat({ label, children, ruleId }) {
  const value = ruleId ? <HowCalculated ruleId={ruleId}>{children}</HowCalculated> : children;
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">{value}</div>
    </div>
  );
}

function Table({ caption, columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left border-b border-slate-200 dark:border-slate-700">
            {columns.map((c) => (
              <th key={c} scope="col" className="py-2 pr-3 font-medium text-slate-600 dark:text-slate-400">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
              {r.map((cell, j) => (
                <td key={j} className={`py-2 pr-3 ${j === 0 ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300 tabular-nums'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The military results (spec §5.8): what was recorded, what the plan
 * credited and why, what the deposit and the waiver change across the whole
 * plan, the military income year by year, and the rules behind it all. Every
 * number on this page is a reading from the same plan and timeline the
 * dashboard uses; nothing here is a recommendation.
 */
export default function MilitaryPlanPage() {
  const { currentScenario, isLoadingScenarios } = useScenario();
  const { entitlements } = useAuth();
  const canScenarios = hasEntitlement(entitlements, FEATURES.MILITARY_SCENARIOS);
  const canAnalysis = hasEntitlement(entitlements, FEATURES.MILITARY_ANALYSIS);

  const derived = useMemo(() => {
    if (!currentScenario) return null;
    try {
      const plan = resolveRetirementPlan(currentScenario);
      const timeline = buildTimeline(currentScenario, { plan });
      let deposit = null;
      let waiver = null;
      try {
        deposit = compareMilitaryDeposit(currentScenario);
      } catch (e) {
        console.error('Deposit comparison failed', e);
      }
      if (canScenarios) {
        try {
          waiver = compareRetiredPayWaiver(currentScenario);
        } catch (e) {
          console.error('Waiver comparison failed', e);
        }
      }
      return { plan, timeline, deposit, waiver, error: null };
    } catch (e) {
      console.error('Military plan failed', e);
      return { plan: null, timeline: null, deposit: null, waiver: null, error: e?.message || 'Unknown error' };
    }
  }, [currentScenario, canScenarios]);

  const mil = derived?.plan?.military ?? null;
  const blocking = (mil?.issues ?? []).filter((i) => i.severity === ISSUE_SEVERITY.BLOCK).length;
  useEffect(() => {
    if (blocking > 0) trackEvent('unsupported_case_shown');
  }, [blocking]);

  if (!currentScenario || !derived?.plan) {
    return <PlanEmptyState title="Military + Federal Plan" loading={Boolean(isLoadingScenarios)} error={currentScenario ? derived?.error : null} />;
  }

  const { plan, timeline, deposit, waiver } = derived;
  const military = currentScenario.military ?? {};
  const connected = military.connection && military.connection !== 'none';

  if (!connected) {
    return (
      <div className="animate-fade-in max-w-3xl">
        <h1 className="text-3xl font-bold navy-text mb-2">Military + Federal Plan</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Add military service, military retired pay, VA income, and military-connected benefits to your federal retirement plan.
          FireFed compares scenarios using the facts you enter and current published rules. Official agencies make eligibility and
          payment decisions.
        </p>
        <Link to="/plan/inputs#military" className="btn-primary">
          Add a military connection
        </Link>
      </div>
    );
  }

  const periods = mil.normalizedPeriods ?? [];
  const streams = mil.incomeStreams ?? [];
  const incomeRows = timeline.rows.filter((r) => (r.militaryIncome?.total ?? 0) > 0);
  const streamColumns = [...new Map(incomeRows.flatMap((r) => r.militaryIncome.byStream).map((s) => [s.id, s])).values()];
  const militaryRules = listRulesByCategory().find((g) => g.category === 'military')?.rules ?? [];
  const rp = mil.retiredPay;

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold navy-text mb-2">Military + Federal Plan</h1>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          What you recorded, what the plan credited and why, and what the deposit and retired-pay choices change across the whole
          timeline. Edit the facts on the{' '}
          <Link to="/plan/inputs#military" className="text-navy-600 dark:text-navy-300 hover:underline">
            Inputs
          </Link>{' '}
          page. Nothing here is a recommendation.
        </p>
        <MilitaryNotice className="mt-2" />
      </div>

      {/* ------------------------------------------------ 1. snapshot */}
      <View id="mil-snapshot" title="Military snapshot" lede="Service periods, their status, the deposit, retired pay, and every income stream.">
        <div className="card p-6 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Stat label="Service FireFed modeled" ruleId="military.fers_credit">
              {mil.creditYears > 0 ? yrs(mil.creditYears) : 'None credited'} {mil.status ? <StatusBadge status={mil.status} /> : null}
            </Stat>
            <Stat label="Service recorded">{yrs(mil.recordedYears)}</Stat>
            <Stat label={mil.deposit.mode === 'official_balance' ? 'Official deposit balance' : mil.deposit.principalComplete ? 'Deposit balance (estimate)' : 'Deposit balance (incomplete)'} ruleId="military.deposit_interest">
              {fmtMoney(mil.deposit.balance)} <span className="text-xs text-slate-500">as of {mil.deposit.projectionDate}</span>
            </Stat>
            <Stat label="Retired pay" ruleId="military.retired_pay_credit">
              {rp.receives === 'yes' ? RETIRED_PAY_TYPE_LABELS[rp.type] ?? 'Type not recorded' : rp.receives === 'unknown' ? 'Not sure' : 'None'}
            </Stat>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
            FireFed modeled <strong>{yrs(mil.creditYears)}</strong> of service in this scenario. This is not an official service-credit
            determination. Your employing agency and OPM control the final credit and deposit amount.
          </p>
        </div>

        {periods.length > 0 ? (
          <div className="card p-6 mb-4">
            <h3 className="text-lg font-semibold navy-text mb-3">Service periods</h3>
            <Table
              caption="Service periods and their modelling status"
              columns={['Period', 'Duty status', 'Dates', 'Status']}
              rows={periods.map((p, i) => [
                `Period ${i + 1}`,
                DUTY_STATUS_LABELS[p.dutyStatus] ?? p.dutyStatus,
                p.startDate && p.endDate ? `${p.startDate} to ${p.endDate}` : p.approximateYears ? `${p.approximateYears} years, no dates` : 'Dates missing',
                <StatusBadge key="s" status={p.classification.status} />,
              ])}
            />
          </div>
        ) : null}

        {streams.length > 0 ? (
          <div className="card p-6 mb-4">
            <h3 className="text-lg font-semibold navy-text mb-3">Income streams</h3>
            <Table
              caption="Military and VA income streams"
              columns={['Stream', 'Whose', 'Per year', 'Federal tax', 'Included']}
              rows={streams.map((s) => [
                STREAM_TYPE_LABELS[s.type] ?? s.type,
                s.ownerId === 'spouse' ? 'Spouse' : 'Me',
                s.resolved.annualGross > 0 ? fmtMoney(s.resolved.annualGross) : '—',
                FEDERAL_TAX_CLASS_LABELS[s.resolved.federalTaxClass] ?? s.resolved.federalTaxClass,
                s.resolved.included ? (s.resolved.estimate ? 'Yes (estimate)' : 'Yes') : 'No',
              ])}
            />
          </div>
        ) : null}

        <div className="card p-6">
          <h3 className="text-lg font-semibold navy-text mb-3">Official-status checklist</h3>
          {mil.issues.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">Nothing outstanding.</p>
          ) : (
            <MilitaryIssues issues={mil.issues} />
          )}
        </div>
      </View>

      {/* ------------------------------------------------ 2. service-credit comparison */}
      <View id="mil-deposit" title="Service-credit comparison" lede="The plan without the deposit against the plan with it paid and the service credited. Both runs use the same timeline.">
        {!deposit ? (
          <div className="card p-6 text-sm text-slate-600 dark:text-slate-400">
            No creditable service to compare yet. Record a period of active duty with its dates, character of service, and basic pay, and
            check the retired-pay section if you draw a military pension.
          </div>
        ) : (
          <div className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                <HowCalculated ruleId="military.deposit_comparison">{deposit.label}</HowCalculated>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {deposit.deposit.amountIncomplete
                  ? 'Deposit amount incomplete: basic pay is missing for some years'
                  : `Deposit ${fmtMoney(deposit.deposit.amount)} paid at ${ageOr(deposit.deposit.paymentAge)}${deposit.deposit.paidAfterSeparation ? ' (after separation: not payable)' : ''}`}
              </span>
            </div>
            {deposit.deposit.amountIncomplete ? (
              <MilitaryIssues issues={mil.issues.filter((i) => i.code === 'MIL_DEPOSIT_EARNINGS_MISSING')} compact className="mb-3" />
            ) : null}
            <Table
              caption="Baseline versus credited scenario"
              columns={['', 'Without the deposit', 'With the deposit paid', 'Difference']}
              rows={[
                ['Retirement path', deposit.baseline.pathLabel, deposit.credit.pathLabel, deposit.delta.pathChanged ? 'Changes' : 'Same'],
                ['Annuity starts at', ageOr(deposit.baseline.annuityStartAge), ageOr(deposit.credit.annuityStartAge), deposit.delta.annuityStartAge == null ? '—' : `${deposit.delta.annuityStartAge > 0 ? '+' : ''}${deposit.delta.annuityStartAge} yrs`],
                ['Service for eligibility', yrs(deposit.baseline.eligibilityYears), yrs(deposit.credit.eligibilityYears), `+${yrs(deposit.creditYears)}`],
                ['Multiplier', pct(deposit.baseline.multiplier), pct(deposit.credit.multiplier), deposit.delta.multiplierChanged ? 'Changes' : 'Same'],
                ['Age reduction', pct(deposit.baseline.ageReductionPercent / 100), pct(deposit.credit.ageReductionPercent / 100), `${deposit.delta.ageReductionPercent.toFixed(1)} pts`],
                ['Annuity at start (per year)', fmtMoney(deposit.baseline.annuityAnnualAtStart), fmtMoney(deposit.credit.annuityAnnualAtStart), fmtMoney(deposit.delta.annuityAnnualAtStart)],
                ['Supplement (per year)', fmtMoney(deposit.baseline.srs.annual), fmtMoney(deposit.credit.srs.annual), fmtMoney(deposit.delta.srsAnnual)],
                ['Survivor annuity (per year)', fmtMoney(deposit.baseline.survivorAnnual), fmtMoney(deposit.credit.survivorAnnual), fmtMoney(deposit.delta.survivorAnnual)],
                ['Simple break-even age', '—', '—', ageOr(deposit.delta.simpleBreakEvenAge)],
              ]}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              {deposit.deposit.amountIncomplete
                ? 'The eligibility and annuity rows do not depend on the deposit amount and stand. Break-even and present value are withheld until basic pay is entered for every year, or the official balance is entered.'
                : `Estimated deposit ${fmtMoney(deposit.deposit.amount)} as of ${deposit.deposit.projectionDate}. Your agency's official balance may differ because earnings, interest-accrual dates, payments, rounding, or service credit can change the calculation.`}
            </p>

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-semibold navy-text">Present value, discounted break-even, and year by year</h3>
                {canAnalysis ? null : <ProBadge />}
              </div>
              {canAnalysis ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <Stat label={`Net present value at ${pct(deposit.discountRate)}`}>{deposit.delta.netPresentValue == null ? '—' : fmtMoney(deposit.delta.netPresentValue)}</Stat>
                    <Stat label="Discounted break-even age">{ageOr(deposit.delta.discountedBreakEvenAge)}</Stat>
                    <Stat label="Lifetime after-tax difference">{fmtMoney(deposit.delta.lifetimeAfterTaxNominal)}</Stat>
                    <Stat label="Balance at end age, difference">{fmtMoney(deposit.delta.balanceAtEnd)}</Stat>
                  </div>
                  <div className="mt-4">
                    <Table
                      caption="After-tax difference by age"
                      columns={['Age', 'Pension difference', 'Supplement difference', 'Tax difference', 'After-tax difference', 'Cumulative']}
                      rows={deposit.byAge.filter((b, i) => i % 5 === 0 || b.age === deposit.byAge[deposit.byAge.length - 1].age).map((b) => [String(b.age), fmtMoney(b.pensionDelta), fmtMoney(b.srsDelta), fmtMoney(b.taxDelta), fmtMoney(b.afterTaxDelta), fmtMoney(b.cumulativeAfterTax)])}
                    />
                  </div>
                </>
              ) : (
                <ProNotice reason="military_analysis_pro">Present value, the discounted break-even, sensitivity to payment date and discount rate, and the year-by-year table are Pro.</ProNotice>
              )}
            </div>
          </div>
        )}
      </View>

      {/* ------------------------------------------------ 3. retired-pay waiver */}
      {rp.receives === 'yes' ? (
        <View id="mil-waiver" title="Retired-pay waiver comparison" lede="Keep the military pension and leave the service uncredited, or waive it when the FERS annuity begins and credit the service. Chapter 1223 and certain disability awards may do both.">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100 mb-4" role="note">
            {RETIRED_PAY_WAIVER_WARNING}
          </div>
          <MilitaryIssues issues={mil.issues.filter((i) => i.entity?.type === 'retiredPay')} className="mb-4" />
          {!canScenarios ? (
            <ProNotice reason="military_scenarios_pro">The keep, waive, and exception scenarios, run through the whole plan, are Pro. The warnings above are always shown.</ProNotice>
          ) : !waiver ? (
            <div className="card p-6 text-sm text-slate-600 dark:text-slate-400">Record the type of retired pay to compare the scenarios.</div>
          ) : (
            <div className="card p-6">
              <Table
                caption="Keep, waive, and exception scenarios"
                columns={['', 'Keep retired pay', waiver.waive ? 'Waive (hypothetical)' : null, waiver.exception ? 'Exception: keep and credit' : null].filter(Boolean)}
                rows={[
                  ['Retirement path', waiver.keep.pathLabel, waiver.waive?.pathLabel, waiver.exception?.pathLabel],
                  ['Military service credited', yrs(waiver.keep.militaryCreditYears), waiver.waive ? yrs(waiver.waive.militaryCreditYears) : null, waiver.exception ? yrs(waiver.exception.militaryCreditYears) : null],
                  ['Annuity starts at', ageOr(waiver.keep.annuityStartAge), waiver.waive ? ageOr(waiver.waive.annuityStartAge) : null, waiver.exception ? ageOr(waiver.exception.annuityStartAge) : null],
                  ['FERS annuity at start (per year)', fmtMoney(waiver.keep.annuityAnnualAtStart), waiver.waive ? fmtMoney(waiver.waive.annuityAnnualAtStart) : null, waiver.exception ? fmtMoney(waiver.exception.annuityAnnualAtStart) : null],
                  ['Supplement (per year)', fmtMoney(waiver.keep.srsAnnual), waiver.waive ? fmtMoney(waiver.waive.srsAnnual) : null, waiver.exception ? fmtMoney(waiver.exception.srsAnnual) : null],
                  ['FERS survivor annuity (per year)', fmtMoney(waiver.keep.survivorAnnual), waiver.waive ? fmtMoney(waiver.waive.survivorAnnual) : null, waiver.exception ? fmtMoney(waiver.exception.survivorAnnual) : null],
                  ['Lifetime military income', fmtMoney(waiver.keep.lifetime.militaryIncomeNominal), waiver.waive ? fmtMoney(waiver.waive.lifetime.militaryIncomeNominal) : null, waiver.exception ? fmtMoney(waiver.exception.lifetime.militaryIncomeNominal) : null],
                  ['Lifetime after-tax income', fmtMoney(waiver.keep.lifetime.afterTaxNominal), waiver.waive ? fmtMoney(waiver.waive.lifetime.afterTaxNominal) : null, waiver.exception ? fmtMoney(waiver.exception.lifetime.afterTaxNominal) : null],
                  ["Lifetime after-tax, today's dollars", fmtMoney(waiver.keep.lifetime.afterTaxReal), waiver.waive ? fmtMoney(waiver.waive.lifetime.afterTaxReal) : null, waiver.exception ? fmtMoney(waiver.exception.lifetime.afterTaxReal) : null],
                  ['Balance at end age', fmtMoney(waiver.keep.balanceAtEnd), waiver.waive ? fmtMoney(waiver.waive.balanceAtEnd) : null, waiver.exception ? fmtMoney(waiver.exception.balanceAtEnd) : null],
                  ['Sustainable to end age', waiver.keep.isSustainable ? 'Yes' : `No, short at ${waiver.keep.firstShortfallAge}`, waiver.waive ? (waiver.waive.isSustainable ? 'Yes' : `No, short at ${waiver.waive.firstShortfallAge}`) : null, waiver.exception ? (waiver.exception.isSustainable ? 'Yes' : `No, short at ${waiver.exception.firstShortfallAge}`) : null],
                ].map((r) => r.filter((c) => c !== null))}
              />
              {waiver.waive ? <MilitaryIssues issues={waiver.waive.issues.filter((i) => i.code === 'MIL_WAIVER_HYPOTHETICAL')} compact className="mt-3" /> : null}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                The waive scenario stops retired pay and CRDP the year before the FERS annuity begins, records the deposit as paid, and
                credits the service. CRSC, VA compensation, SBP premiums, and healthcare are left as entered; each may require separate
                confirmation. FireFed does not prepare or submit a waiver.
              </p>
            </div>
          )}
        </View>
      ) : null}

      {/* ------------------------------------------------ 4. income timeline */}
      <View id="mil-income" title="Military income timeline" lede="Every military and VA stream by age, with its tax character. Amounts are nominal.">
        {incomeRows.length === 0 ? (
          <div className="card p-6 text-sm text-slate-600 dark:text-slate-400">No military or VA income is projected. Add a stream on the Inputs page.</div>
        ) : (
          <div className="card p-6">
            <Table
              caption="Military and VA income by age"
              columns={['Age', ...streamColumns.map((s) => `${s.label} (${FEDERAL_TAX_CLASS_LABELS[s.federalTaxClass] ?? ''})`), 'Taxable', 'Not taxable', 'Total']}
              rows={incomeRows
                .filter((r, i) => i % 5 === 0 || i === incomeRows.length - 1 || r.age === plan.annuityStartAge || r.age === plan.separationAge)
                .map((r) => [
                  String(r.age),
                  ...streamColumns.map((c) => {
                    const s = r.militaryIncome.byStream.find((x) => x.id === c.id);
                    return s ? fmtMoney(s.amount) : '—';
                  }),
                  fmtMoney(r.militaryIncome.taxableWages + r.militaryIncome.militaryRetiredPay + r.militaryIncome.taxablePension),
                  fmtMoney(r.militaryIncome.taxExempt),
                  fmtMoney(r.militaryIncome.total),
                ])}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Every fifth year is shown, plus separation and the annuity start. The year-by-year table on My Plan carries every year.</p>
          </div>
        )}
      </View>

      {/* ------------------------------------------------ 4b. TSP coordination and BRS value stack */}
      {mil.tsp ? (
        <View id="mil-tsp" title="TSP coordination" lede="Two accounts, one elective-deferral limit. Matches and vesting are figured separately for each; nothing here says what to contribute.">
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
              <Stat label={`Shared limit ${mil.tsp.year}`} ruleId="military.tsp_coordination">
                {fmtMoney(mil.tsp.limits.total)}
                {mil.tsp.limits.catchUpApplies ? <span className="block text-xs font-normal text-slate-500">incl. {fmtMoney(mil.tsp.limits.catchUpLimit)} catch-up</span> : null}
              </Stat>
              <Stat label="Planned deferrals this year">{fmtMoney(mil.tsp.sharedDeferrals.total)}</Stat>
              <Stat label="Room left">{fmtMoney(mil.tsp.remainingRoom)}</Stat>
              <Stat label="Over the limit">{mil.tsp.electiveExcess > 0 ? fmtMoney(mil.tsp.electiveExcess) : 'No'}</Stat>
            </div>
            <Table
              caption="TSP accounts"
              columns={['Account', 'System', 'Employee deferrals', 'Tax-exempt', 'Service / agency', 'Annual additions', 'Match at risk']}
              rows={mil.tsp.byAccount.map((a) => [
                a.context === 'civilian' ? 'Civilian' : 'Uniformed services',
                a.system.toUpperCase(),
                fmtMoney(a.employeeDeferrals),
                fmtMoney(a.taxExemptDeferrals),
                `${fmtMoney(a.employerContributions)} (${a.contributionPercents.automatic}% + ${a.contributionPercents.matching}%)`,
                `${fmtMoney(a.annualAdditions)}${a.annualAdditionsExcess > 0 ? ` (over by ${fmtMoney(a.annualAdditionsExcess)})` : ''}`,
                a.match.lost > 0 ? `${fmtMoney(a.match.lost)} over ${a.match.periodsWithoutMatch} period${a.match.periodsWithoutMatch === 1 ? '' : 's'}` : 'None',
              ])}
            />
            {timeline.rows[0]?.uniformedTsp?.merged ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">The uniformed-services account has joined the household TSP pool for withdrawals; its tax-exempt basis is tracked there.</p>
            ) : timeline.rows[0]?.balances?.uniformedTsp ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Uniformed-services account at the end of this year: {fmtMoney(timeline.rows[0].balances.uniformedTsp.total)}
                {timeline.rows[0].balances.uniformedTsp.traditionalTaxExemptBasis > 0 ? `, of which ${fmtMoney(timeline.rows[0].balances.uniformedTsp.traditionalTaxExemptBasis)} tax-exempt basis` : ''}
                {timeline.rows[0].balances.uniformedTsp.unvestedAutomatic > 0 ? `; ${fmtMoney(timeline.rows[0].balances.uniformedTsp.unvestedAutomatic)} not yet vested` : ''}.
              </p>
            ) : null}
            <MilitaryIssues issues={mil.issues.filter((i) => i.entity?.type === 'tspAccount' || String(i.code).startsWith('MIL_TSP') || String(i.code).startsWith('MIL_USERRA'))} className="mt-4" />
          </div>
          {mil.brs ? (
            <div className="card p-6 mt-4" data-testid="brs-value-stack">
              <h3 className="text-base font-semibold navy-text mb-2">BRS value stack</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Four components, shown apart. Different units are never added into one number.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Stat label="Defined benefit (first-year retired pay)" ruleId="military.retired_pay_formula">
                  {(() => {
                    const linked = (military.retirementScenarios ?? []).map((sc) => (sc.calculations ?? []).find((c) => c.id === sc.currentCalculationId)).find((c) => c && c.system === 'brs');
                    return linked ? fmtMoney(linked.projectedMonthly * 12) : 'No saved BRS calculation';
                  })()}
                </Stat>
                <Stat label="Defined contribution (uniformed TSP today)" ruleId="military.brs_tsp">
                  {timeline.rows[0]?.uniformedTsp?.merged ? 'In the household TSP pool' : fmtMoney(timeline.rows[0]?.balances?.uniformedTsp?.total ?? 0)}
                </Stat>
                <Stat label="Continuation pay (official offer)" ruleId="military.brs_continuation_pay">{mil.brs.continuationPay?.included ? fmtMoney(mil.brs.continuationPay.gross) : 'Not included'}</Stat>
                <Stat label={`Lump sum (${mil.brs.lumpSum?.electionPercent ?? 0}%)`} ruleId="military.brs_lump_sum">
                  {mil.brs.lumpSum && !mil.brs.lumpSum.blocked && mil.brs.lumpSum.elected ? fmtMoney(mil.brs.lumpSum.lumpSum) : mil.brs.lumpSum?.blocked ? 'Blocked' : 'Not elected'}
                </Stat>
              </div>
              {mil.brs.lumpSum && !mil.brs.lumpSum.blocked && mil.brs.lumpSum.elected ? (
                canAnalysis ? (
                  <div className="mt-4 text-sm text-slate-700 dark:text-slate-300">
                    <p>
                      Reduced pension {fmtMoney(mil.brs.lumpSum.reducedMonthlyAtStart)} a month for {mil.brs.lumpSum.coveredMonths} months, restored in full from {mil.brs.lumpSum.restorationDate}. Nominal through the horizon:{' '}
                      {fmtMoney(mil.brs.lumpSum.nominal.withLumpSum)} with the lump sum against {fmtMoney(mil.brs.lumpSum.nominal.withoutLumpSum)} without.
                      {mil.brs.lumpSum.breakEvenMonthsFromStart !== null ? ` The cumulative totals cross ${Math.round(mil.brs.lumpSum.breakEvenMonthsFromStart / 12)} years after the start.` : ''}
                    </p>
                  </div>
                ) : (
                  <ProNotice reason="brs_lump_sum_pro">
                    <span className="inline-flex items-center gap-2">The nominal and present-value comparison of the lump sum is Pro <ProBadge /></span>
                  </ProNotice>
                )
              ) : null}
              <MilitaryIssues issues={mil.issues.filter((i) => String(i.code).startsWith('MRT_BRS'))} className="mt-4" />
            </div>
          ) : null}
        </View>
      ) : null}

      {/* ------------------------------------------------ 4c. health coverage by person */}
      {(mil.coverage ?? []).length > 0 ? (
        <View id="mil-coverage" title="Health coverage by person" lede="Each person's confirmed coverage, its cost by year, and any combination that breaks a current rule. Costs are compared, not ranked.">
          <div className="card p-6">
            <Table
              caption="Coverage periods"
              columns={['Who', 'Coverage', 'From', 'To', 'Monthly premium', 'Confirmed', 'Status']}
              rows={mil.coverage.map((c) => [
                c.ownerId === 'spouse' ? 'Spouse' : 'Me',
                COVERAGE_LABELS[c.source] ?? c.source,
                c.startDate ?? '—',
                c.endDate ?? 'ongoing',
                `${fmtMoney(c.resolved.premium.monthly)}${c.resolved.premium.source === 'table' ? ` (table ${c.resolved.premium.tableYear})` : ''}`,
                c.enrollmentConfirmed ? 'Enrolled' : c.eligibilityConfirmed ? 'Eligible' : 'Not confirmed',
                c.resolved.blocked ? 'Blocked' : c.resolved.issues.length > 0 ? 'Check' : 'OK',
              ])}
            />
            <div className="mt-4">
              <Table
                caption="Expected health cost by year and person"
                columns={['Age', 'Year', 'Me', 'Spouse', 'Household']}
                rows={timeline.rows.filter((_, i) => i % 5 === 0).slice(0, 9).map((r) => [String(r.age), String(r.year), fmtMoney(r.healthcare.primaryTotal ?? r.healthcare.total), r.healthcare.spouse ? fmtMoney(r.healthcare.spouse.total) : '—', fmtMoney(r.healthcare.total)])}
              />
            </div>
            <MilitaryIssues issues={mil.issues.filter((i) => i.entity?.type === 'coveragePeriod')} className="mt-4" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              <HowCalculated ruleId="healthcare.coverage_periods">How coverage periods are costed</HowCalculated>. FireFed does not declare eligibility; the program does.
            </p>
          </div>
        </View>
      ) : null}

      {/* ------------------------------------------------ 5. assumptions and sources */}
      <View id="mil-sources" title="Assumptions and sources" lede="Every military rule the plan applies, its source, and when it was last verified. Rules version in this scenario:">
        <div className="card p-6">
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
            Military rules version <code className="text-xs">{military.rulesVersion}</code>. Unresolved items are listed in the checklist above.
          </p>
          <ul className="space-y-3 text-sm">
            {militaryRules.map((r) => (
              <li key={r.id} className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  <HowCalculated ruleId={r.id}>{r.title}</HowCalculated>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {r.statute ? <span>{r.statute} · </span> : null}
                  <a href={r.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {r.source.name}
                  </a>{' '}
                  · verified {r.lastVerified}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
            Educational planning estimate: not legal, tax, investment, benefits, or claims advice. FireFed is not affiliated with or
            endorsed by any government agency. Official records and agency determinations control.
          </p>
        </div>
      </View>

      <ProjectionDisclaimer className="mt-8" />
    </div>
  );
}
