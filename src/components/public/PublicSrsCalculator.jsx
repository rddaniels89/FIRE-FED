import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_MRA } from '../../lib/calculations/fers';
import { calculateSrs, getSrsEarningsTestExemptAmount } from '../../lib/calculations/srs';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const num = (v) => (v === '' ? 0 : Number.parseFloat(v) || 0);

const EXEMPT = getSrsEarningsTestExemptAmount();

const REASON_COPY = {
  age_62_or_over:
    'The supplement exists to bridge the gap until Social Security becomes available at 62. Retiring at 62 or later means there is no gap for it to fill.',
  deferred_or_postponed:
    'Deferred and postponed retirements do not carry the supplement. It is payable only on an immediate annuity.',
  not_immediate_unreduced:
    'The supplement requires an immediate, unreduced annuity: your MRA with 30 years of service, or age 60 with 20. MRA+10 is a reduced annuity, so it does not qualify — a common and expensive assumption to get wrong.',
};

export default function PublicSrsCalculator() {
  const [form, setForm] = useState({
    retirementAge: '57',
    yearsOfService: '30',
    socialSecurityAt62Monthly: '2000',
    annualEarnedIncome: '0',
    isVoluntaryEarlyRetirement: false,
  });

  const set = (k) => (e) =>
    setForm((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const srs = useMemo(
    () =>
      calculateSrs({
        retirementAge: num(form.retirementAge),
        creditableYearsOfService: num(form.yearsOfService),
        socialSecurityAt62Monthly: num(form.socialSecurityAt62Monthly),
        annualEarnedIncome: num(form.annualEarnedIncome),
        isVoluntaryEarlyRetirement: form.isVoluntaryEarlyRetirement,
        mra: DEFAULT_MRA,
      }),
    [form]
  );

  const reduced = srs.isEligible && srs.earningsTest && srs.earningsTest.withheld > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
        Special Retirement Supplement Calculator
      </h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl">
        The SRS approximates the Social Security you earned during federal service and pays it between
        the day you retire and the day you turn 62. For someone leaving at their MRA with 30 years it is
        frequently over $1,000 a month &mdash; and it is left out of most retirement calculators entirely.
      </p>

      <div className="grid lg:grid-cols-2 gap-8 mt-10">
        <div className="card p-6 space-y-5">
          <div>
            <label className="label" htmlFor="retirementAge">Retirement age</label>
            <input className="input-field w-full" inputMode="numeric" value={form.retirementAge} onChange={set('retirementAge')} id="retirementAge" />
          </div>

          <div>
            <label className="label" htmlFor="yearsOfService">Years of creditable civilian service</label>
            <input className="input-field w-full" inputMode="numeric" value={form.yearsOfService} onChange={set('yearsOfService')} id="yearsOfService" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Civilian service only. Military time does not count toward the supplement even if you paid a
              deposit, and unused sick leave never counts.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="socialSecurityAt62Monthly">Estimated Social Security at 62 (monthly)</label>
            <input className="input-field w-full" inputMode="decimal" value={form.socialSecurityAt62Monthly} onChange={set('socialSecurityAt62Monthly')} id="socialSecurityAt62Monthly" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              From your statement at ssa.gov. The supplement is a share of this figure.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="annualEarnedIncome">Expected earned income after retiring (annual)</label>
            <input className="input-field w-full" inputMode="decimal" value={form.annualEarnedIncome} onChange={set('annualEarnedIncome')} id="annualEarnedIncome" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Wages and self-employment only. Your pension, TSP withdrawals and investment income are not
              counted by the earnings test.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isVoluntaryEarlyRetirement}
              onChange={set('isVoluntaryEarlyRetirement')}
              className="mt-1 w-4 h-4"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              This is a VERA (early out)
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                VERA qualifies, but the supplement is not paid until you reach your MRA.
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            {srs.isEligible ? (
              <>
                <h2 className="text-xl font-semibold navy-text mb-4">Your estimated supplement</h2>
                <div className="text-4xl font-bold text-green-700 dark:text-green-400">
                  {money(reduced ? srs.monthlyAfterEarningsTest : srs.monthlyBeforeEarningsTest)}
                  <span className="text-lg font-medium text-slate-500 dark:text-slate-400">/mo</span>
                </div>

                <dl className="mt-6 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600 dark:text-slate-400">Paid until age 62</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{srs.yearsPayable} years</dd>
                  </div>
                  {!srs.isPayableNow && srs.payableFromAge && (
                    <div className="flex justify-between">
                      <dt className="text-slate-600 dark:text-slate-400">Payments begin at</dt>
                      <dd className="font-medium text-slate-900 dark:text-white">age {srs.payableFromAge}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-600 dark:text-slate-400">Total over that period</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{money(srs.lifetimeTotal)}</dd>
                  </div>
                </dl>

                {reduced && (
                  <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Reduced by the earnings test
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      Earning above {money(EXEMPT)} withholds $1 of supplement for every $2 over. That is
                      {' '}{money(srs.earningsTest.withheld)} a year here, leaving{' '}
                      {money(srs.annualAfterEarningsTest)} instead of {money(srs.annualBeforeEarningsTest)}.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-400 mb-3">
                  No supplement for this scenario
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {REASON_COPY[srs.reason] ?? REASON_COPY.not_immediate_unreduced}
                </p>
              </>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">How it is calculated</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              OPM prorates your age-62 Social Security benefit by whole years of civilian service over 40:
            </p>
            <p className="mt-3 font-mono text-sm text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 rounded-lg px-4 py-3">
              benefit at 62 &times; years of service &divide; 40
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              It ends the month you turn 62 whether or not you claim Social Security, and it is not reduced
              by a survivor election.
            </p>
          </div>

          <div className="card p-6 bg-navy-50 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">See it against your whole plan</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              A free account adds your FERS annuity, TSP projection, and the gap between your income and
              your expenses.
            </p>
            <Link to="/signin?mode=signup" className="btn-primary inline-block">Create a free account</Link>
          </div>
        </div>
      </div>

      <p className="disclaimer max-w-3xl">
        Estimates only. The {new Date().getFullYear()} earnings-test exempt amount used here is {money(EXEMPT)};
        confirm current figures at ssa.gov and your eligibility with your agency HR or OPM.
      </p>
    </div>
  );
}
