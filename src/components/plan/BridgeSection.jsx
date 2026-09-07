import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import HowCalculated from '../HowCalculated';
import { fmtMoney, fmtPercent, fmtYears, sumRows } from './planFormat';

function Stat({ label, children, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">{children}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function StrategyToggle({ id, label, description, enabled, canUse, onToggle }) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 ${canUse ? '' : 'opacity-60'}`}
    >
      {/* The wrapping <label> covers the description too, so an aria-label was
          used to trim the name — which suppressed the description entirely.
          Naming from the title and describing from the sentence keeps both. */}
      <input
        type="checkbox"
        className="mt-1 w-4 h-4"
        checked={Boolean(enabled)}
        disabled={!canUse}
        onChange={(e) => onToggle(e.target.checked)}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
      />
      <div>
        <div id={labelId} className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
          {label}
          {!canUse && <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
        </div>
        <div id={descriptionId} className="text-xs text-slate-500 dark:text-slate-400">
          {description}
        </div>
      </div>
    </label>
  );
}

/**
 * "How do I bridge the gap?": the years between separation and the first
 * guaranteed income, and what funds them.
 */
export default function BridgeSection({ timeline, scenario, canUseStrategies, onToggleStrategy }) {
  const { plan, summary, rows } = timeline;
  const bridge = summary.bridge;
  const hasBridge = bridge.years > 0;
  const funded = Math.max(0, Math.min(100, bridge.fundedPercent));
  const healthcareInBridge = sumRows(rows, bridge.startAge, bridge.endAge, (r) => r.healthcare.total);
  const strategies = scenario.strategies ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-semibold text-slate-900 dark:text-white">{plan.pathLabel}</span>
        {plan.reason && <span className="text-sm text-slate-500 dark:text-slate-400">{plan.reason}</span>}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Bridge"
          sub={hasBridge ? `age ${bridge.startAge} to ${bridge.endAge}` : 'guaranteed income covers spending from separation'}
        >
          <HowCalculated ruleId="timeline.bridge">{fmtYears(bridge.years)}</HowCalculated>
        </Stat>
        <Stat label="Withdrawals needed" sub="over the bridge, nominal">
          {fmtMoney(bridge.withdrawalsNeeded)}
        </Stat>
        <Stat label="Assets at separation" sub="TSP, IRA, taxable and cash">
          {fmtMoney(bridge.assetsAtSeparation)}
        </Stat>
        <Stat label="Penalties in bridge" sub="10% early-withdrawal penalties">
          {fmtMoney(bridge.penalties)}
        </Stat>
      </div>

      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-600 dark:text-slate-400">Bridge funded</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            <HowCalculated ruleId="timeline.sustainable">{fmtPercent(funded / 100)}</HowCalculated>
          </span>
        </div>
        <div
          className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
          role="progressbar"
          aria-label="Bridge funded"
          aria-valuenow={Math.round(funded)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${Math.round(funded)}% of bridge spending funded`}
        >
          <div
            className={`h-full rounded-full ${funded >= 100 ? 'bg-green-500' : funded >= 75 ? 'bg-gold-500' : 'bg-red-500'}`}
            style={{ width: `${funded}%` }}
          />
        </div>
        {bridge.shortfall > 0 && (
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            {fmtMoney(bridge.shortfall)} of bridge spending is unfunded under these assumptions.
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <div className="font-medium text-slate-800 dark:text-slate-200">
            <HowCalculated ruleId="tsp.access">TSP access</HowCalculated>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
            {plan.tspAccess.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-medium text-slate-800 dark:text-slate-200">
              <HowCalculated ruleId="fehb.five_year">FEHB</HowCalculated>
            </div>
            <p className={`mt-1 ${plan.fehb.continues ? 'text-slate-600 dark:text-slate-400' : 'text-red-700 dark:text-red-300'}`}>
              {plan.fehb.message}
            </p>
            {healthcareInBridge > 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Healthcare during the bridge:{' '}
                <HowCalculated ruleId="healthcare.fehb_premium">{fmtMoney(healthcareInBridge)}</HowCalculated>
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-medium text-slate-800 dark:text-slate-200">
              <HowCalculated ruleId="leave.lump_sum">Annual leave lump sum</HowCalculated>
            </div>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              {plan.annualLeave.hours > 0
                ? `${fmtMoney(plan.annualLeave.grossPayment)} gross for ${plan.annualLeave.hours} hours, paid after separation.`
                : 'No annual leave balance entered; add hours under Inputs to include the payout.'}
            </p>
          </div>
        </div>
      </div>

      {plan.annuity.nominalFreezeYears > 0 && (
        <div className="rounded-lg border border-gold-300 dark:border-gold-700 bg-gold-50 dark:bg-gold-900/20 p-4 text-sm">
          <div className="font-medium text-gold-800 dark:text-gold-200">
            <HowCalculated ruleId="fers.deferred_freeze">
              Annuity frozen for {fmtYears(plan.annuity.nominalFreezeYears)}
            </HowCalculated>
          </div>
          <p className="mt-1 text-gold-800/90 dark:text-gold-200/90">
            A {plan.isDeferred ? 'deferred' : 'postponed'} annuity is computed on the high-3 at separation and receives no
            adjustment until it starts at {plan.annuityStartAge}. At the assumed inflation rate that wait costs about{' '}
            <strong>{fmtPercent(plan.annuity.purchasingPowerLostToFreeze, 1)}</strong> of its purchasing power.
          </p>
        </div>
      )}

      {plan.refund && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm">
          <div className="font-medium text-slate-800 dark:text-slate-200">Refund of FERS contributions</div>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Taking the refund returns about {fmtMoney(plan.refund.refundAmount)} ({fmtMoney(plan.refund.totalContributions)}{' '}
            of contributions plus interest) and forfeits the annuity for that service.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium text-slate-800 dark:text-slate-200">Bridge strategies</div>
          {!canUseStrategies && (
            <Link
              to="/pro-features"
              state={{ reason: 'bridge_strategies_pro' }}
              className="text-sm text-navy-600 dark:text-navy-300 hover:underline"
            >
              Unlock with Pro
            </Link>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <StrategyToggle
            id="strategy-sepp"
            label="72(t) SEPP payments"
            description="Substantially equal periodic payments from Traditional TSP, penalty-free before 59½ for at least five years."
            enabled={strategies.sepp?.enabled}
            canUse={canUseStrategies}
            onToggle={(enabled) => onToggleStrategy('sepp', enabled)}
          />
          <StrategyToggle
            id="strategy-roth-conversion"
            label="Roth conversion ladder"
            description="Convert Traditional to Roth up to a target bracket each year; each conversion is penalty-free five tax years later."
            enabled={strategies.rothConversion?.enabled}
            canUse={canUseStrategies}
            onToggle={(enabled) => onToggleStrategy('rothConversion', enabled)}
          />
        </div>
      </div>
    </div>
  );
}
