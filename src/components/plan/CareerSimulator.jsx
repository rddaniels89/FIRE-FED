/**
 * GS career and High-3 simulator (ROADMAP.md item 60).
 *
 * The retirement decision turns on the High-3 at separation, and most people
 * only know their grade, step and duty station. This page projects the salary
 * path year by year using the three published mechanics in
 * lib/calculations/careerProjection.js (within-grade increases, the two-step
 * promotion rule, the January raise) and shows what the resulting High-3 does
 * to the FERS annuity.
 *
 * The inputs live in `scenario.career`; the "use in my plan" toggle flips
 * `career.enabled`, which is what makes lib/projection/plan.js derive the
 * High-3 from this path instead of from the flat salary-growth assumption.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { useScenario } from '../../contexts/ScenarioContext';
import { useAuth } from '../../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../../lib/entitlements';
import {
  DEFAULT_LOCALITY_CODE,
  GS_PAY_TABLE_YEAR,
  LOCALITY_AREAS,
  calculateGsSalary,
} from '../../lib/calculations/gsPay';
import {
  DEFAULT_ANNUAL_PAY_RAISE_PERCENT,
  WGI_WAITING_PERIOD_YEARS,
  projectCareerSalaries,
  whatIfOneMoreYear,
} from '../../lib/calculations/careerProjection';
import { applyScenarioUpdates, createDefaultCareer } from '../../lib/scenarios/schema';
import { resolveRetirementPlan } from '../../lib/projection/plan';
import HowCalculated from '../HowCalculated';
import NumberStepper from '../NumberStepper';
import { fmtDelta, fmtMoney } from './planFormat';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const GRADES = Array.from({ length: 15 }, (_, i) => i + 1);
const STEPS = Array.from({ length: 10 }, (_, i) => i + 1);

/** Locality areas alphabetised by name, with Rest of U.S. pinned to the top. */
const LOCALITY_OPTIONS = [
  ...LOCALITY_AREAS.filter((l) => l.code === DEFAULT_LOCALITY_CODE),
  ...LOCALITY_AREAS.filter((l) => l.code !== DEFAULT_LOCALITY_CODE).sort((a, b) => a.name.localeCompare(b.name)),
];

const SOURCES = Object.freeze({
  wgi: 'https://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/within-grade-increases/',
  promotion:
    'https://www.ecfr.gov/current/title-5/chapter-I/subchapter-B/part-531/subpart-B/section-531.214',
  raise: 'https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/',
});

const SERIES_COLOR = '#2e4a96';
const WGI_COLOR = '#0f766e';
const PROMOTION_COLOR = '#d88635';

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampInt = (v, min, max, fallback) => {
  const n = Math.trunc(num(v, fallback));
  return Math.min(max, Math.max(min, n));
};

/** Normalises the career block into the shape the projection expects. */
function readCareerInputs(career) {
  const defaults = createDefaultCareer();
  const c = career ?? defaults;
  return {
    enabled: Boolean(c.enabled),
    grade: clampInt(c.grade, 1, 15, defaults.grade),
    step: clampInt(c.step, 1, 10, defaults.step),
    localityCode: LOCALITY_AREAS.some((l) => l.code === c.localityCode) ? c.localityCode : DEFAULT_LOCALITY_CODE,
    annualRaisePercent: num(c.annualRaisePercent, DEFAULT_ANNUAL_PAY_RAISE_PERCENT),
    yearsInCurrentStep: Math.max(0, num(c.yearsInCurrentStep, 0)),
    promotions: Array.isArray(c.promotions)
      ? c.promotions.map((p) => ({ atAge: num(p?.atAge, 0), toGrade: clampInt(p?.toGrade, 1, 15, 1) }))
      : [],
  };
}

/** The plan resolver on a scenario copy. Returns null rather than throwing on a bad scenario. */
function safeResolvePlan(scenario, updates) {
  try {
    return resolveRetirementPlan(applyScenarioUpdates(scenario, updates));
  } catch {
    return null;
  }
}

function ResultCard({ label, value, detail, ruleId, tone = 'default' }) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-red-700 dark:text-red-400'
        : 'text-slate-900 dark:text-white';
  const labelNode = <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>;
  return (
    <div className="card p-4">
      {ruleId ? <HowCalculated ruleId={ruleId}>{labelNode}</HowCalculated> : labelNode}
      <div className={`text-2xl font-semibold mt-1 ${valueClass}`}>{value}</div>
      {detail && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{detail}</p>}
    </div>
  );
}

export default function CareerSimulator() {
  const { currentScenario, updateCurrentScenario } = useScenario();
  const { entitlements } = useAuth();
  const isPro = hasEntitlement(entitlements, FEATURES.CAREER_SIMULATOR);

  const profile = currentScenario?.profile ?? {};
  const currentAge = clampInt(profile.currentAge, 16, 100, 42);
  const separationAge = Math.max(currentAge, clampInt(profile.separationAge, 16, 100, 55));

  // Free users see a worked sample so the page teaches even when it cannot edit.
  const inputs = useMemo(
    () => (isPro ? readCareerInputs(currentScenario?.career) : { ...readCareerInputs(createDefaultCareer()), enabled: false }),
    [isPro, currentScenario?.career],
  );

  const todayPay = useMemo(
    () => calculateGsSalary({ grade: inputs.grade, step: inputs.step, localityCode: inputs.localityCode }),
    [inputs.grade, inputs.step, inputs.localityCode],
  );

  const projectionArgs = useMemo(
    () => ({
      grade: inputs.grade,
      step: inputs.step,
      localityCode: inputs.localityCode,
      currentAge,
      separationAge,
      annualRaisePercent: inputs.annualRaisePercent,
      promotions: inputs.promotions,
      yearsInCurrentStep: inputs.yearsInCurrentStep,
    }),
    [inputs, currentAge, separationAge],
  );

  const projection = useMemo(() => projectCareerSalaries(projectionArgs), [projectionArgs]);
  const oneMoreYear = useMemo(() => whatIfOneMoreYear(projectionArgs), [projectionArgs]);

  // The annuity is resolved on a copy of the scenario with this path switched
  // on, so the figure is exactly what the plan would show once the user opts in.
  const careerPatch = useMemo(() => ({ ...inputs, enabled: true }), [inputs]);
  const plan = useMemo(
    () => (currentScenario ? safeResolvePlan(currentScenario, { career: careerPatch }) : null),
    [currentScenario, careerPatch],
  );
  const planOneMoreYear = useMemo(
    () =>
      currentScenario
        ? safeResolvePlan(currentScenario, { career: careerPatch, profile: { separationAge: separationAge + 1 } })
        : null,
    [currentScenario, careerPatch, separationAge],
  );
  const annuityAtStart = plan?.annuity?.annualAtStart ?? null;
  const annuityDelta =
    annuityAtStart != null && planOneMoreYear?.annuity?.annualAtStart != null
      ? planOneMoreYear.annuity.annualAtStart - annuityAtStart
      : null;

  const chartData = useMemo(() => {
    const years = projection?.years ?? [];
    return {
      labels: years.map((r) => `Age ${r.age}`),
      datasets: [
        {
          label: 'Salary (locality-adjusted)',
          data: years.map((r) => r.salary),
          borderColor: SERIES_COLOR,
          backgroundColor: 'rgba(46, 74, 150, 0.12)',
          fill: true,
          tension: 0.2,
          pointRadius: years.map((r) => (r.isPromotionYear ? 6 : r.isWgiYear ? 4 : 2)),
          pointBackgroundColor: years.map((r) =>
            r.isPromotionYear ? PROMOTION_COLOR : r.isWgiYear ? WGI_COLOR : SERIES_COLOR,
          ),
          pointBorderColor: years.map((r) =>
            r.isPromotionYear ? PROMOTION_COLOR : r.isWgiYear ? WGI_COLOR : SERIES_COLOR,
          ),
        },
      ],
    };
  }, [projection]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const row = projection?.years?.[ctx.dataIndex];
              const note = row?.isPromotionYear ? ' (promotion)' : row?.isWgiYear ? ' (step increase)' : '';
              return `GS-${row?.grade} step ${row?.step}: ${fmtMoney(ctx.parsed.y)}${note}`;
            },
          },
        },
      },
      scales: {
        y: { ticks: { callback: (v) => fmtMoney(v, { compact: true }) } },
      },
    }),
    [projection],
  );

  // --- Writes -------------------------------------------------------------

  /** Salary the rest of the app should use for this grade/step/locality today. */
  const salarySyncFor = (career) => {
    const pay = calculateGsSalary({ grade: career.grade, step: career.step, localityCode: career.localityCode });
    return pay ? { tsp: { annualSalary: pay.salary }, fers: { high3Salary: pay.salary } } : {};
  };

  const writeCareer = (patch) => {
    if (!isPro) return;
    const next = { ...inputs, ...patch };
    const updates = { career: patch };
    // While the path is in use, keep the app's salary in step with the grade.
    if (inputs.enabled && ('grade' in patch || 'step' in patch || 'localityCode' in patch)) {
      Object.assign(updates, salarySyncFor(next));
    }
    updateCurrentScenario(updates);
  };

  const setEnabled = (enabled) => {
    if (!isPro) return;
    if (!enabled) {
      updateCurrentScenario({ career: { enabled: false } });
      return;
    }
    updateCurrentScenario({ career: { ...inputs, enabled: true }, ...salarySyncFor(inputs) });
  };

  const addPromotion = () => {
    const atAge = Math.min(separationAge - 1, currentAge + 2);
    const toGrade = Math.min(15, inputs.grade + 1);
    writeCareer({ promotions: [...inputs.promotions, { atAge: Math.max(currentAge, atAge), toGrade }] });
  };

  const updatePromotion = (index, patch) => {
    writeCareer({ promotions: inputs.promotions.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  };

  const removePromotion = (index) => {
    writeCareer({ promotions: inputs.promotions.filter((_, i) => i !== index) });
  };

  const disabled = !isPro;
  const yearsRemaining = Math.max(0, separationAge - currentAge);
  const years = projection?.years ?? [];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold navy-text">Career and High-3 simulator</h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
          Your FERS annuity is built on your High-3: the average of your highest three consecutive years of basic
          pay. Start from your grade, step and locality, and this page projects each year&rsquo;s salary through
          age {separationAge} using the published within-grade, promotion and January-raise rules, then shows the
          High-3 and annuity that path produces. Educational only; your agency&rsquo;s SF-50s are the record.
        </p>
      </header>

      {!isPro && (
        <div className="card p-4 border-l-4 border-navy-600 dark:border-navy-400 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">
              This is a sample projection for a GS-12 step 5 in the Rest of U.S. locality.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              The career simulator is a Pro feature. Upgrade to enter your own grade, step, locality and promotions
              and to use the projected High-3 across your plan.
            </p>
          </div>
          <Link to="/pro-features" state={{ reason: 'career_simulator_pro' }} className="btn-primary text-sm py-2 px-4">
            See Pro features
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- Inputs ---- */}
        <section className="card p-6 space-y-5 lg:col-span-1" aria-label="Career inputs">
          <h2 className="text-xl font-semibold navy-text">Where you are today</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="careerGrade">
                Grade
              </label>
              <select
                id="careerGrade"
                className="input-field w-full"
                value={inputs.grade}
                disabled={disabled}
                onChange={(e) => writeCareer({ grade: Number(e.target.value) })}
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    GS-{g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="careerStep">
                Step
              </label>
              <select
                id="careerStep"
                className="input-field w-full"
                value={inputs.step}
                disabled={disabled}
                onChange={(e) => writeCareer({ step: Number(e.target.value) })}
              >
                {STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="careerLocality">
              Locality
            </label>
            <select
              id="careerLocality"
              className="input-field w-full"
              value={inputs.localityCode}
              disabled={disabled}
              onChange={(e) => writeCareer({ localityCode: e.target.value })}
            >
              {LOCALITY_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.percent}%)
                </option>
              ))}
            </select>
          </div>

          {todayPay && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
              <span className="font-semibold text-slate-900 dark:text-white">{fmtMoney(todayPay.salary)}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {' '}
                today &mdash; {fmtMoney(todayPay.basePay)} base plus {todayPay.locality.percent}% locality (
                {GS_PAY_TABLE_YEAR} table)
              </span>
              {todayPay.wasCapped && (
                <span className="block text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Held at the Executive Schedule Level IV cap of {fmtMoney(todayPay.cappedAt)}.
                </span>
              )}
            </div>
          )}

          <div>
            <label className="label" htmlFor="careerYearsInStep">
              Years already at this step
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="careerYearsInStep"
                type="number"
                min={0}
                max={10}
                step={1}
                className="input-field w-full"
                value={inputs.yearsInCurrentStep}
                disabled={disabled}
                onChange={(e) => writeCareer({ yearsInCurrentStep: clampInt(e.target.value, 0, 10, 0) })}
              />
              <NumberStepper
                disabledIncrement={disabled || inputs.yearsInCurrentStep >= 10}
                disabledDecrement={disabled || inputs.yearsInCurrentStep <= 0}
                onIncrement={() => writeCareer({ yearsInCurrentStep: Math.min(10, inputs.yearsInCurrentStep + 1) })}
                onDecrement={() => writeCareer({ yearsInCurrentStep: Math.max(0, inputs.yearsInCurrentStep - 1) })}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Step {inputs.step}
              {WGI_WAITING_PERIOD_YEARS[inputs.step]
                ? ` advances after ${WGI_WAITING_PERIOD_YEARS[inputs.step]} year${
                    WGI_WAITING_PERIOD_YEARS[inputs.step] === 1 ? '' : 's'
                  }; time already served counts.`
                : ' is the top of the grade; only promotions and raises move it.'}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="careerRaise">
              Assumed January raise (% per year)
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="careerRaise"
                type="number"
                min={0}
                max={10}
                step={0.1}
                className="input-field w-full"
                value={inputs.annualRaisePercent}
                disabled={disabled}
                onChange={(e) =>
                  writeCareer({ annualRaisePercent: Math.min(10, Math.max(0, num(e.target.value, 0))) })
                }
              />
              <NumberStepper
                disabledIncrement={disabled}
                disabledDecrement={disabled}
                onIncrement={() =>
                  writeCareer({ annualRaisePercent: Math.min(10, Math.round((inputs.annualRaisePercent + 0.5) * 10) / 10) })
                }
                onDecrement={() =>
                  writeCareer({ annualRaisePercent: Math.max(0, Math.round((inputs.annualRaisePercent - 0.5) * 10) / 10) })
                }
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Recent raises ranged from 1.0% to 4.7%; {DEFAULT_ANNUAL_PAY_RAISE_PERCENT}% is the planning default.
              Locality percentages are held fixed.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <HowCalculated ruleId="career.promotion">
                <span className="label mb-0">Promotions</span>
              </HowCalculated>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-3"
                disabled={disabled || yearsRemaining < 1 || inputs.grade >= 15}
                onClick={addPromotion}
              >
                + Add promotion
              </button>
            </div>
            {inputs.promotions.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                None modelled. Add one to see the two-step rule place you in the new grade.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {inputs.promotions.map((p, index) => (
                  <li key={index} className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label text-xs" htmlFor={`promoAge-${index}`}>
                        At age
                      </label>
                      <input
                        id={`promoAge-${index}`}
                        type="number"
                        min={currentAge}
                        max={separationAge}
                        step={1}
                        className="input-field w-full"
                        value={p.atAge}
                        disabled={disabled}
                        onChange={(e) =>
                          updatePromotion(index, { atAge: clampInt(e.target.value, currentAge, separationAge, currentAge) })
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <label className="label text-xs" htmlFor={`promoGrade-${index}`}>
                        To grade
                      </label>
                      <select
                        id={`promoGrade-${index}`}
                        className="input-field w-full"
                        value={p.toGrade}
                        disabled={disabled}
                        onChange={(e) => updatePromotion(index, { toGrade: Number(e.target.value) })}
                      >
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            GS-{g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="focus-ring h-10 px-3 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                      aria-label={`Remove promotion ${index + 1}`}
                      disabled={disabled}
                      onClick={() => removePromotion(index)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                className="mt-1 h-4 w-4"
                checked={inputs.enabled}
                disabled={disabled}
                aria-checked={inputs.enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <span className="font-medium text-slate-900 dark:text-white">Use this career path in my plan</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Your plan will take its High-3 from this projection instead of the flat salary-growth assumption,
                  and today&rsquo;s salary and High-3 will be set to {todayPay ? fmtMoney(todayPay.salary) : 'the table figure'}{' '}
                  so every page agrees.
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* ---- Results ---- */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ResultCard
              label={`Salary at ${separationAge}`}
              value={fmtMoney(projection?.salaryAtSeparation)}
              detail={
                years.length
                  ? `GS-${years[years.length - 1].grade} step ${years[years.length - 1].step} in the final year`
                  : null
              }
            />
            <ResultCard
              label="High-3 at separation"
              ruleId="career.wgi"
              value={fmtMoney(projection?.high3AtSeparation)}
              detail="Best three consecutive years on this path"
            />
            <ResultCard
              label="Projected FERS annuity at start"
              value={annuityAtStart != null ? fmtMoney(annuityAtStart) : '—'}
              detail={
                plan
                  ? plan.annuity?.annualAtStart > 0
                    ? `Per year from age ${plan.annuityStartAge ?? separationAge}, on this High-3`
                    : 'No annuity on the current path; see the plan for eligibility'
                  : 'Could not resolve the plan'
              }
            />
          </div>

          {oneMoreYear && (
            <div className="card p-4">
              <h3 className="font-semibold navy-text">
                What one more year would do (separate at {oneMoreYear.oneMoreYear.separationAge} instead of{' '}
                {oneMoreYear.baseline.separationAge})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Final salary</div>
                  <div className={`text-xl font-semibold ${oneMoreYear.salaryDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                    {fmtDelta(oneMoreYear.salaryDelta)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">High-3</div>
                  <div className={`text-xl font-semibold ${oneMoreYear.high3Delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                    {fmtDelta(oneMoreYear.high3Delta)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Annuity per year</div>
                  <div className={`text-xl font-semibold ${annuityDelta == null ? 'text-slate-900 dark:text-white' : annuityDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                    {annuityDelta == null ? '—' : fmtDelta(annuityDelta)}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                The annuity change includes the extra year of service and any change in eligibility or age reduction,
                not just the higher High-3.
              </p>
            </div>
          )}

          <section className="card p-4" aria-label="Salary path chart">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold navy-text">Salary by age</h3>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: WGI_COLOR }} /> Step
                  increase
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: PROMOTION_COLOR }} />{' '}
                  Promotion
                </span>
              </div>
            </div>
            <div className="h-64 sm:h-80">
              <Line data={chartData} options={chartOptions} />
            </div>
          </section>

          <section className="card p-4" aria-label="Salary path table">
            <h3 className="font-semibold navy-text mb-2">Year by year</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-3">Age</th>
                    <th className="py-2 pr-3">Year</th>
                    <th className="py-2 pr-3">Grade / step</th>
                    <th className="py-2 pr-3 text-right">Base pay</th>
                    <th className="py-2 pr-3 text-right">Locality</th>
                    <th className="py-2 pr-3 text-right">Salary</th>
                    <th className="py-2">Event</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((r) => (
                    <tr key={r.age} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-3">{r.age}</td>
                      <td className="py-1.5 pr-3">{r.year}</td>
                      <td className="py-1.5 pr-3">
                        GS-{r.grade} / {r.step}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMoney(r.basePay)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.localityPercent}%</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                        {fmtMoney(r.salary)}
                      </td>
                      <td className="py-1.5 text-xs">
                        {r.isPromotionYear && (
                          <span className="text-amber-700 dark:text-amber-400">Promotion</span>
                        )}
                        {r.isWgiYear && <span className="text-teal-700 dark:text-teal-400">Step increase</span>}
                        {r.wasCapped && (
                          <span className="block text-slate-500 dark:text-slate-400">EX-IV cap applied</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Salaries in future dollars, from the {projection?.payTableYear ?? GS_PAY_TABLE_YEAR} OPM table scaled by the
              assumed raise. Cumulative earnings on this path: {fmtMoney(projection?.cumulativeEarnings)}.
            </p>
          </section>
        </div>
      </div>

      {/* ---- Explanation strip ---- */}
      <section className="card p-6" aria-label="How the projection works">
        <h2 className="text-xl font-semibold navy-text mb-4">The rules behind the path</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-600 dark:text-slate-400">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Within-grade increases</h3>
            <p>
              A step advances after a waiting period at the current step: 52 weeks for steps 1&ndash;3, 104 weeks
              for steps 4&ndash;6 and 156 weeks for steps 7&ndash;9, given an acceptable level of performance.
              Step 10 is the top of the grade.
            </p>
            <a
              href={SOURCES.wgi}
              target="_blank"
              rel="noreferrer"
              className="text-navy-600 dark:text-navy-400 hover:underline text-xs"
            >
              OPM within-grade increase fact sheet
            </a>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">The two-step promotion rule</h3>
            <p>
              On promotion you are placed at the lowest step of the new grade that pays at least two steps above
              your old rate (5 CFR 531.214). A GS-12 step 5 promoted to GS-13 lands at step 3, not step 5. The
              refinement for steps 9 and 10 is not modelled; it can only move the result up a step.
            </p>
            <a
              href={SOURCES.promotion}
              target="_blank"
              rel="noreferrer"
              className="text-navy-600 dark:text-navy-400 hover:underline text-xs"
            >
              5 CFR 531.214 on eCFR
            </a>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">The January raise and the EX-IV cap</h3>
            <p>
              The across-the-board adjustment is set each year by the President or Congress; 2026 was 1.0%. Locality
              pay cannot lift a salary above Level IV of the Executive Schedule ({fmtMoney(todayPay?.cappedAt)} in{' '}
              {GS_PAY_TABLE_YEAR}), which is why senior grades in expensive areas earn less than the percentage
              implies, and why their High-3 is capped with them.
            </p>
            <a
              href={SOURCES.raise}
              target="_blank"
              rel="noreferrer"
              className="text-navy-600 dark:text-navy-400 hover:underline text-xs"
            >
              OPM salaries and wages
            </a>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
          The model is annual: one row per year of age, with the High-3 taken as the best three consecutive annual
          salaries. A real High-3 uses the highest 36 consecutive months of basic pay and your actual step history.
        </p>
      </section>
    </div>
  );
}
