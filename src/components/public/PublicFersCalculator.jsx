import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../../lib/telemetry';
import { SURVIVOR_ELECTIONS, calculateFersResults } from '../../lib/calculations/fers';
import { calculateSrs } from '../../lib/calculations/srs';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const num = (v) => (v === '' ? 0 : Number.parseFloat(v) || 0);

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function PublicFersCalculator() {
  const [form, setForm] = useState({
    currentAge: '45',
    retirementAge: '60',
    yearsOfService: '20',
    monthsOfService: '0',
    high3Salary: '110000',
    unusedSickLeaveHours: '0',
    survivorElection: SURVIVOR_ELECTIONS.NONE,
    socialSecurityAt62Monthly: '0',
  });

  // Fires once. A pageview says they arrived; this says the tool was actually
  // used, which is the number that matters against signups.
  const hasEngaged = useRef(false);
  const markEngaged = () => {
    if (hasEngaged.current) return;
    hasEngaged.current = true;
    trackEvent('public_calculator_engaged', { calculator: 'fers_pension' });
  };

  const set = (k) => (e) => {
    markEngaged();
    setForm((p) => ({ ...p, [k]: e.target.value }));
  };

  const { fers, srs } = useMemo(() => {
    const f = calculateFersResults({
      yearsOfService: num(form.yearsOfService),
      monthsOfService: num(form.monthsOfService),
      high3Salary: num(form.high3Salary),
      currentAge: num(form.currentAge),
      retirementAge: num(form.retirementAge),
      showComparison: false,
      includeFutureService: true,
      unusedSickLeaveHours: num(form.unusedSickLeaveHours),
      survivorElection: form.survivorElection,
    });

    return {
      fers: f,
      srs: calculateSrs({
        retirementAge: num(form.retirementAge),
        creditableYearsOfService: f.service.eligibilityYears,
        socialSecurityAt62Monthly: num(form.socialSecurityAt62Monthly),
      }),
    };
  }, [form]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">FERS Pension Calculator</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl">
        Estimates your FERS annuity from your high-3, creditable service, and the age you plan to leave.
        Unused sick leave and your survivor election are included, because both change the number
        materially. Nothing is saved and no account is needed.
      </p>

      <div className="grid lg:grid-cols-2 gap-8 mt-10">
        <div className="card p-6 space-y-5">
          <h2 className="text-xl font-semibold navy-text">Your service</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field id="currentAge" label="Current age">
              <input className="input-field w-full" inputMode="numeric" value={form.currentAge} onChange={set('currentAge')} id="currentAge" />
            </Field>
            <Field id="retirementAge" label="Planned retirement age">
              <input className="input-field w-full" inputMode="numeric" value={form.retirementAge} onChange={set('retirementAge')} id="retirementAge" />
            </Field>
            <Field id="yearsOfService" label="Years of service (so far)">
              <input className="input-field w-full" inputMode="numeric" value={form.yearsOfService} onChange={set('yearsOfService')} id="yearsOfService" />
            </Field>
            <Field id="monthsOfService" label="Additional months">
              <input className="input-field w-full" inputMode="numeric" value={form.monthsOfService} onChange={set('monthsOfService')} id="monthsOfService" />
            </Field>
          </div>

          <Field id="high3Salary" label="High-3 average salary" hint="Average of your highest three consecutive years of basic pay.">
            <input className="input-field w-full" inputMode="decimal" value={form.high3Salary} onChange={set('high3Salary')} id="high3Salary" />
          </Field>

          <Field
            id="unusedSickLeaveHours"
            label="Unused sick leave (hours)"
            hint="Credited to the computation at 2,087 hours per year. It cannot make you eligible to retire."
          >
            <input className="input-field w-full" inputMode="numeric" value={form.unusedSickLeaveHours} onChange={set('unusedSickLeaveHours')} id="unusedSickLeaveHours" />
          </Field>

          <Field
            id="survivorElection"
            label="Survivor annuity election"
            hint="Electing none requires spousal consent if you are married, and ends your spouse&rsquo;s FEHB eligibility after your death."
          >
            <select id="survivorElection" className="input-field w-full" value={form.survivorElection} onChange={set('survivorElection')}>
              <option value={SURVIVOR_ELECTIONS.NONE}>None &mdash; no reduction, no survivor benefit</option>
              <option value={SURVIVOR_ELECTIONS.PARTIAL}>Partial &mdash; 5% cost, survivor receives 25%</option>
              <option value={SURVIVOR_ELECTIONS.FULL}>Full &mdash; 10% cost, survivor receives 50%</option>
            </select>
          </Field>

          <Field
            id="socialSecurityAt62Monthly"
            label="Estimated Social Security at 62 (monthly)"
            hint="From your Social Security statement. Used only to estimate the Special Retirement Supplement."
          >
            <input className="input-field w-full" inputMode="decimal" value={form.socialSecurityAt62Monthly} onChange={set('socialSecurityAt62Monthly')} id="socialSecurityAt62Monthly" />
          </Field>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold navy-text mb-5">Your annuity</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{money(fers.stayFed.annualPension)}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">per year</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{money(fers.stayFed.monthlyPension)}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">per month</div>
              </div>
            </div>

            <div className={`mt-5 text-sm font-medium ${fers.stayFed.isEligible ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {fers.stayFed.eligibilityMessage}
            </div>

            <dl className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Service for eligibility</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{fers.service.eligibilityYears.toFixed(2)} yrs</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Service for computation</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{fers.service.computationYears.toFixed(2)} yrs</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Multiplier</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{(fers.stayFed.multiplier * 100).toFixed(1)}%</dd>
              </div>
            </dl>
          </div>

          {fers.survivor.reductionPercent > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
                Survivor election &mdash; {fers.survivor.survivorPercent}% benefit
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Annuity before reduction</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{money(fers.stayFed.annualPensionBeforeSurvivorReduction)}/yr</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Cost of the election</dt>
                  <dd className="font-medium text-amber-700 dark:text-amber-400">&minus;{money(fers.survivor.annualReduction)}/yr</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Your survivor receives</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{money(fers.survivor.survivorAnnualBenefit)}/yr</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Special Retirement Supplement</h3>
            {srs.isEligible && num(form.socialSecurityAt62Monthly) <= 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                You would qualify for the supplement at this retirement age. Add your estimated Social
                Security at 62 above and it will be calculated &mdash; it is often over $1,000 a month.
              </p>
            ) : srs.isEligible ? (
              <>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{money(srs.monthlyBeforeEarningsTest)}/mo</div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Paid for about {srs.yearsPayable} years until you turn 62 &mdash; roughly {money(srs.lifetimeTotal)} in
                  total. It stops at 62 whether or not you claim Social Security, and is reduced if you earn
                  above the annual Social Security limit.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {srs.reason === 'age_62_or_over'
                  ? 'Not payable — the supplement bridges the gap to 62, and this retirement age is already 62 or later.'
                  : srs.reason === 'deferred_or_postponed'
                  ? 'Not payable on a deferred or postponed retirement.'
                  : 'Not payable. The supplement requires an immediate, unreduced annuity — your MRA with 30 years, or age 60 with 20. MRA+10 is a reduced annuity and does not qualify.'}
                {num(form.socialSecurityAt62Monthly) <= 0 &&
                  ' Add your Social Security estimate above to model it for ages where you would qualify.'}
              </p>
            )}
          </div>

          <div className="card p-6 bg-navy-50 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Want to keep this?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              A free account saves up to three scenarios, adds your TSP projection, and shows how far you are
              from covering your expenses.
            </p>
            <Link
              to="/signin?mode=signup"
              onClick={() => trackEvent('calculator_signup_cta_clicked', { calculator: 'fers_pension', engaged: hasEngaged.current })}
              className="btn-primary inline-block"
            >Create a free account</Link>
          </div>
        </div>
      </div>

      <p className="disclaimer max-w-3xl">
        Estimates only, based on the figures you enter. Confirm anything you rely on with your agency HR or
        OPM before making a retirement decision.
      </p>
    </div>
  );
}
