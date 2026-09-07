import { Link } from 'react-router-dom';

const ROWS = [
  ['One profile: every calculator reads the same person', 'Yes', 'Yes'],
  ['Every FERS path: MRA+30, 60+20, 62+5, MRA+10, postponed, deferred, VERA, special provisions', 'Yes', 'Yes'],
  ['FERS pension with sick leave, survivor election, diet COLA, and the deferred-annuity freeze', 'Yes', 'Yes'],
  ['Special Retirement Supplement with the earnings test', 'Yes', 'Yes'],
  ['Lifetime year-by-year timeline: salary, pension, SRS, Social Security, withdrawals, taxes, healthcare', 'Yes', 'Yes'],
  ['Projected sustainable separation age with a separation-age slider and one-year-earlier/later cards', 'Yes', 'Yes'],
  ['TSP access rules: age 55 separation rule, 59½, and the 10% penalty where it applies', 'Yes', 'Yes'],
  ['Social Security claiming ages 62–70 from your SSA estimate', 'Yes', 'Yes'],
  ['Federal and state income tax, Social Security taxation, FICA', 'Yes', 'Yes'],
  ['FEHB premiums, the five-year rule, marketplace bridge cover, Medicare at 65', 'Yes', 'Yes'],
  ['"How was this calculated" with sources on every number', 'Yes', 'Yes'],
  ['Saved scenarios', '3', 'Unlimited'],
  ['Household: spouse income, Social Security, pension; dual-fed couples', '—', 'Yes'],
  ['Monte Carlo durability with percentile bands and the most vulnerable age', '—', 'Yes'],
  ['Named stress tests: bad first decade, crash at separation, inflation, longevity, healthcare, Social Security cut', '—', 'Yes'],
  ['Bridge strategies: 72(t) schedule and Roth conversion ladder', '—', 'Yes'],
  ['GS career and High-3 simulator with step increases and promotions', '—', 'Yes'],
  ['Compare two to five scenarios with a delta view', '—', 'Yes'],
  ['Medicare IRMAA estimates', '—', 'Yes'],
  ['Federal Retirement Projection Report (PDF) and scenario import/export', '—', 'Yes'],
];

function Cell({ value }) {
  if (value === 'Yes') return <span className="text-green-600 dark:text-green-400 font-medium">✓</span>;
  if (value === '—') return <span className="text-slate-400 dark:text-slate-500">—</span>;
  return <span className="font-medium text-slate-900 dark:text-white">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
        Free gives you the right answer. Pro helps you choose between answers.
      </h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 max-w-3xl">
        Every federal rule that changes your number is in the free tier. Paying is for comparing
        alternatives, stress-testing them, and watching your plan change over time.
      </p>

      <div className="grid sm:grid-cols-2 gap-6 mt-10">
        <div className="card p-6">
          <div className="text-lg font-semibold text-slate-900 dark:text-white">Free</div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mt-2">$0</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">No card required</div>
          <Link to="/signin?mode=signup" className="btn-primary w-full text-center block mt-6">
            Create free account
          </Link>
        </div>

        <div className="card p-6 border-gold-400 dark:border-gold-600">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold text-slate-900 dark:text-white">Pro</div>
            <span className="text-xs font-semibold px-2 py-1 rounded bg-gold-100 dark:bg-gold-900/30 gold-accent">
              Best value annually
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mt-2">$9.99</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">per month, or $99/year — save 17%</div>
          <Link to="/signin?mode=signup" className="btn-primary w-full text-center block mt-6">
            Start free, upgrade anytime
          </Link>
        </div>
      </div>

      <div className="card mt-10 overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left font-semibold text-slate-700 dark:text-slate-200 px-6 py-4">What you get</th>
              <th className="font-semibold text-slate-700 dark:text-slate-200 px-6 py-4 w-24">Free</th>
              <th className="font-semibold text-slate-700 dark:text-slate-200 px-6 py-4 w-24">Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, free, pro]) => (
              <tr key={label} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0">
                <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{label}</td>
                <td className="px-6 py-3 text-center"><Cell value={free} /></td>
                <td className="px-6 py-3 text-center"><Cell value={pro} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
        Cancel any time from the billing portal. Payments are handled by Stripe; FireFed never sees your
        card details.
      </p>
    </div>
  );
}
