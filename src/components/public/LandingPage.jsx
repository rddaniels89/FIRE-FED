import { Link } from 'react-router-dom';
import { trackEvent } from '../../lib/telemetry';

const MODELS = [
  {
    title: 'Your FERS pension',
    body: 'High-3, creditable service, and the 1.1% rule at 62. Unused sick leave credited at 2,087 hours a year — for the computation only, never for eligibility. Survivor elections priced against what your survivor actually receives.',
  },
  {
    title: 'Your TSP',
    body: 'Traditional against Roth with the agency match, 2026 contribution limits, catch-up at 50 and the higher band at 60–63, and the SECURE 2.0 rule that forces catch-up to Roth above the wage threshold.',
  },
  {
    title: 'The years before 62',
    body: 'The Special Retirement Supplement, what it is worth, and — just as often — why it is not payable. MRA+10 does not qualify. Deferred and postponed retirement do not qualify. Most tools stay silent on that.',
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider gold-accent mb-3">
            For FERS employees
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight text-balance">
            Know what your federal retirement is actually worth.
          </h1>
          <p className="mt-5 text-lg text-slate-600 dark:text-slate-300">
            Most retirement calculators do not know what a GS-13 is. FireFed models the rules that
            decide your number — FERS service credit, the TSP match, and the gap between the day you
            leave and the day Social Security starts.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to="/calculators/fers-pension"
              className="btn-primary text-center"
              onClick={() => trackEvent('landing_cta_clicked', { target: 'fers_calculator', placement: 'hero' })}
            >
              Try the FERS calculator — no account
            </Link>
            <Link
              to="/signin?mode=signup"
              onClick={() => trackEvent('landing_cta_clicked', { target: 'signup', placement: 'hero' })}
              className="focus-ring text-center border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium py-3 px-6 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              Create a free account
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Free to use. Pro is <strong className="text-slate-700 dark:text-slate-200">$9.99/month</strong> or
            $99/year. No card needed to start.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold navy-text mb-2">What it models</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-2xl">
          The federal-specific rules, not a generic retirement projection with a pension field bolted on.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {MODELS.map((m) => (
            <div key={m.title} className="card p-6">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">{m.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold navy-text mb-2">Start without an account</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-2xl">
            Both calculators are free and complete. An account is for saving what you build and
            comparing it against alternatives.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <Link to="/calculators/fers-pension" className="card p-6 block hover:border-navy-400 dark:hover:border-navy-500">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-1">FERS Pension Calculator</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Your annuity, with sick leave credit and survivor elections included.
              </p>
              <span className="inline-block mt-4 text-sm font-medium navy-text">Open the calculator →</span>
            </Link>
            <Link to="/calculators/special-retirement-supplement" className="card p-6 block hover:border-navy-400 dark:hover:border-navy-500">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-1">Special Retirement Supplement</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                What the SRS pays you between retirement and 62 — and whether you qualify at all.
              </p>
              <span className="inline-block mt-4 text-sm font-medium navy-text">Open the calculator →</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card p-8">
          <h2 className="text-2xl font-bold navy-text mb-3">Correctness is free</h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            The free tier models the scenario you enter <em>correctly</em> — the supplement when it applies,
            sick leave credit, the survivor election you choose. A model that quietly leaves out a
            $1,200-a-month income stream is not a conservative estimate, it is a wrong answer, and you
            would have no way of knowing.
          </p>
          <p className="mt-4 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Pro is for comparing alternatives, stress-testing assumptions, exporting, and tracking how
            your plan changes over time.
          </p>
          <Link to="/pricing" className="inline-block mt-6 font-medium navy-text">
            See what Pro adds →
          </Link>
        </div>
      </section>
    </>
  );
}
