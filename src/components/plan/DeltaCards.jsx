import { ArrowLeft, ArrowRight } from 'lucide-react';
import { fmtDelta, fmtMoney } from './planFormat';

const DELTA_ROWS = [
  { key: 'pensionAnnualAtStart', label: 'Pension at start (annual)' },
  { key: 'high3', label: 'High-3' },
  { key: 'balanceAtSeparation', label: 'Balance at separation' },
  { key: 'lifetimeSalary', label: 'Lifetime salary' },
  { key: 'minBalance', label: 'Lowest balance' },
];

function ThresholdBadge({ change }) {
  const gained = change.direction === 'gained';
  const isPath = change.key === 'path';
  const cls = isPath
    ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
    : gained
      ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700'
      : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700';
  const text = isPath
    ? `Path: ${change.from} → ${change.to}`
    : `${gained ? 'Gains' : 'Loses'} ${change.label}`;
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${cls}`}>{text}</span>;
}

function DeltaCard({ title, icon, shift, onUse }) {
  if (!shift) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-semibold navy-text">{title}</h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Not available: that age is before today.</p>
      </div>
    );
  }

  const { to, deltas, thresholdChanges } = shift;
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold navy-text">{title}</h3>
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">age {to.separationAge}</span>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {to.pathLabel} · {to.isSustainable ? 'sustainable' : `runs short at ${to.firstShortfallAge}`}
      </div>

      <dl className="space-y-1.5 text-sm flex-1">
        {DELTA_ROWS.map(({ key, label }) => {
          const d = deltas[key];
          const delta = Math.round(d.delta);
          const tone =
            delta > 0
              ? 'text-green-700 dark:text-green-300'
              : delta < 0
                ? 'text-red-700 dark:text-red-300'
                : 'text-slate-500';
          return (
            <div key={key} className="flex justify-between gap-3">
              <dt className="text-slate-600 dark:text-slate-400">{label}</dt>
              <dd className="text-right tabular-nums">
                <span className={`font-medium ${tone}`}>{fmtDelta(delta)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">→ {fmtMoney(d.to)}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {thresholdChanges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {thresholdChanges.map((c) => (
            <ThresholdBadge key={c.key} change={c} />
          ))}
        </div>
      )}

      {/* Both cards read "Use this age", so the age is appended for screen
          readers. An aria-label replacing the visible text would break the
          label-in-name rule for anyone using voice control. */}
      <button
        type="button"
        className="btn-secondary btn-sm mt-4"

        onClick={() => onUse(to.separationAge)}
      >
        Use this age
        <span className="sr-only"> {to.separationAge}</span>
      </button>
    </div>
  );
}

/** The pair of "one year earlier / one year later" cards. */
export default function DeltaCards({ deltas, onUseAge }) {
  if (!deltas) return null;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <DeltaCard
        title="Leave one year earlier"
        icon={<ArrowLeft className="h-4 w-4 text-slate-500" aria-hidden="true" />}
        shift={deltas.earlier}
        onUse={onUseAge}
      />
      <DeltaCard
        title="Leave one year later"
        icon={<ArrowRight className="h-4 w-4 text-slate-500" aria-hidden="true" />}
        shift={deltas.later}
        onUse={onUseAge}
      />
    </div>
  );
}
