import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmtMoney } from './planFormat';

const COLUMNS = [
  { key: 'salary', label: 'Salary', pick: (r) => r.salary },
  { key: 'pension', label: 'Pension', pick: (r) => r.pension },
  { key: 'srs', label: 'SRS', pick: (r) => r.srs },
  { key: 'ss', label: 'Soc. Sec.', pick: (r) => r.socialSecurity },
  { key: 'withdrawals', label: 'Withdrawals', pick: (r) => r.withdrawals.total },
  { key: 'taxes', label: 'Taxes', pick: (r) => r.taxes.total },
  { key: 'healthcare', label: 'Healthcare', pick: (r) => r.healthcare.total },
  { key: 'spending', label: 'Spending', pick: (r) => r.spending },
  { key: 'balance', label: 'Ending balance', pick: (r) => r.balances.total },
];

const PHASE_STYLE = {
  working: 'bg-navy-50 dark:bg-navy-900/30 text-navy-700 dark:text-navy-300',
  bridge: 'bg-gold-50 dark:bg-gold-900/30 text-gold-700 dark:text-gold-300',
  retired: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
};

/** Collapsible year-by-year table of the timeline. */
export default function YearByYearTable({ rows, deflate, mode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-4">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="font-semibold navy-text">Year by year</span>
        <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {rows.length} rows · {mode === 'real' ? "today's dollars" : 'nominal'}
          {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="py-1.5 pr-2 font-medium">Age</th>
                <th className="py-1.5 pr-2 font-medium">Phase</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="py-1.5 pr-2 font-medium text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.age}
                  className={`border-b border-slate-100 dark:border-slate-800 ${r.shortfall > 0 ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                >
                  <td className="py-1 pr-2 font-medium text-slate-800 dark:text-slate-200">{r.age}</td>
                  <td className="py-1 pr-2">
                    <span className={`inline-block px-1.5 rounded ${PHASE_STYLE[r.phase] ?? ''}`}>{r.phase}</span>
                  </td>
                  {COLUMNS.map((c) => {
                    const v = deflate(c.pick(r), r);
                    return (
                      <td key={c.key} className="py-1 pr-2 text-right text-slate-700 dark:text-slate-300">
                        {v ? fmtMoney(v) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Rows shaded red record a shortfall: outflows the model could not fund from income or assets that year.
          </p>
        </div>
      )}
    </div>
  );
}
