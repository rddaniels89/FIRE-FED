import { useState } from 'react';
import HowCalculated from '../HowCalculated';
import { fmtAge, fmtMoney, fmtPercent } from './planFormat';

const RULE_BY_SOURCE = {
  'FERS annuity': 'fers.annuity',
  'Special Retirement Supplement': 'srs.amount',
  'Social Security': 'ss.claiming_factor',
};

function annualAtStart(rows, source, age) {
  const row = rows.find((r) => r.age === age);
  if (!row) return null;
  switch (source) {
    case 'FERS annuity':
      return row.pension;
    case 'Special Retirement Supplement':
      return row.srs;
    case 'Social Security':
      return row.socialSecurity;
    case 'Spouse Social Security':
      return row.spouseSocialSecurity;
    case 'Spouse pension':
      return row.spousePension;
    default:
      return null;
  }
}

/** Horizontal strip of milestones from now to the end of the plan. */
function MilestoneStrip({ milestones, currentAge, endAge }) {
  const [selected, setSelected] = useState(null);
  const span = Math.max(1, endAge - currentAge);

  // Several milestones often land on one age (separation, MRA and the annuity
  // start at 57, say). One marker per age keeps the labels legible.
  const byAge = new Map();
  const add = (m) => {
    if (m.age > endAge) return;
    const key = String(m.age);
    const group = byAge.get(key) ?? { age: m.age, key, labels: [], details: [] };
    group.labels.push(m.label);
    group.details.push(m.detail);
    byAge.set(key, group);
  };
  add({ age: currentAge, label: 'Now', detail: `Today, age ${currentAge}.` });
  milestones.forEach(add);
  const items = [...byAge.values()]
    .sort((a, b) => a.age - b.age)
    .map((g) => ({ ...g, label: g.labels.join(' · '), detail: g.details.join(' ') }));

  return (
    <div>
      {/* The track scrolls sideways rather than crushing the labels together:
          at 375px the card is only ~295px wide, which overlapped every pair of
          adjacent labels and painted the first and last markers past the edge. */}
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="relative h-36 mt-2 min-w-[36rem]">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-300 dark:bg-slate-600" />
          {items.map((m, i) => {
            const pct = ((m.age - currentAge) / span) * 100;
            const above = i % 2 === 0;
            const isSelected = selected?.key === m.key;
            // The end markers hug their edge instead of centring, so nothing
            // paints outside the track.
            const isFirst = i === 0;
            const isLast = i === items.length - 1;
            const shift = isFirst ? 'translate-x-0' : isLast ? '-translate-x-full' : '-translate-x-1/2';
            return (
              <button
                key={m.key}
                type="button"
                title={m.detail}
                onClick={() => setSelected(isSelected ? null : m)}
                className={`focus-ring absolute group ${shift}`}
                style={{ left: `${pct}%`, top: above ? '0' : 'auto', bottom: above ? 'auto' : '0' }}
                aria-label={`${m.label} at age ${fmtAge(m.age)}: ${m.detail}`}
              >
                <div className={`flex flex-col items-center ${above ? '' : 'flex-col-reverse'}`}>
                  <span
                    className={`text-[11px] leading-tight max-w-[5.5rem] text-center ${
                      isSelected ? 'font-semibold navy-text' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{fmtAge(m.age)}</span>
                  <span
                    className={`block w-2.5 h-2.5 rounded-full border-2 ${above ? 'mt-1' : 'mb-1'} ${
                      isSelected
                        ? 'bg-navy-600 border-navy-600'
                        : 'bg-white dark:bg-slate-800 border-navy-500 group-hover:bg-navy-200'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-[2.5rem] mt-1 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
        {selected ? (
          <span>
            <strong className="text-slate-800 dark:text-slate-200">
              {selected.label} (age {fmtAge(selected.age)}):
            </strong>{' '}
            {selected.detail}
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">
            Tap or hover a milestone to see what changes at that age.
          </span>
        )}
      </div>
    </div>
  );
}

/** "What income starts later?": the guaranteed-income sources and the milestone strip. */
export default function IncomeSection({ timeline, deflate }) {
  const { plan, summary, rows } = timeline;
  const starts = summary.bridge.incomeStarts;
  const endAge = rows[rows.length - 1]?.age ?? 95;

  return (
    <div className="space-y-6">
      {starts.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No guaranteed income is projected to start under this path. {plan.reason ?? ''}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Guaranteed income sources, when each starts and ends, and the first-year amount</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th scope="col" className="py-2 pr-3 font-medium">Source</th>
                <th scope="col" className="py-2 pr-3 font-medium">Starts</th>
                <th scope="col" className="py-2 pr-3 font-medium">Ends</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">First-year amount</th>
                <th scope="col" className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {starts.map((s) => {
                const amount = annualAtStart(rows, s.source, s.age);
                const ruleId = RULE_BY_SOURCE[s.source];
                let note = '';
                if (s.source === 'FERS annuity') {
                  note = `${fmtPercent(plan.annuity.multiplier, 1)} × ${plan.service.computationYears.toFixed(1)} years × high-3 ${fmtMoney(plan.high3.high3AtSeparation)}`;
                  if (plan.annuity.ageReductionPercent > 0) note += `, reduced ${plan.annuity.ageReductionPercent}% for age`;
                } else if (s.source === 'Special Retirement Supplement') {
                  note = 'Ends at 62; subject to the earnings test.';
                } else if (s.source === 'Social Security') {
                  note = `Claimed at ${plan.socialSecurity.claimAge}; FRA ${fmtAge(plan.socialSecurity.fra?.decimal)}.`;
                }
                return (
                  <tr key={s.source} className="border-b border-slate-100 dark:border-slate-800">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800 dark:text-slate-200">
                      {s.source}
                    </th>
                    <td className="py-2 pr-3 tabular-nums">{fmtAge(s.age)}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.endAge ? fmtAge(s.endAge) : 'for life'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {ruleId ? (
                        <HowCalculated ruleId={ruleId} align="right">
                          {fmtMoney(deflate(amount, s.age))}
                        </HowCalculated>
                      ) : (
                        fmtMoney(deflate(amount, s.age))
                      )}
                    </td>
                    <td className="py-2 text-xs text-slate-500 dark:text-slate-400">{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="stat-tile p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Multiplier</div>
          <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
            <HowCalculated ruleId="fers.multiplier">{fmtPercent(plan.annuity.multiplier, 1)}</HowCalculated>
          </div>
        </div>
        <div className="stat-tile p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Age reduction</div>
          <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
            <HowCalculated ruleId="fers.mra10_reduction">
              {plan.annuity.ageReductionPercent > 0 ? `−${plan.annuity.ageReductionPercent}%` : 'none'}
            </HowCalculated>
          </div>
        </div>
        <div className="stat-tile p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">FERS COLA</div>
          <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
            <HowCalculated ruleId="cola.diet">from age {plan.annuity.colaStartAge}</HowCalculated>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">the diet COLA: CPI minus up to 1 point</div>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Milestones</div>
        <MilestoneStrip milestones={summary.milestones} currentAge={plan.currentAge} endAge={endAge} />
      </div>
    </div>
  );
}
