import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useScenario } from '../contexts/ScenarioContext';
import { FERS_HIRE_COHORT_LABELS } from '../lib/calculations/fers';

const STORAGE_KEY = 'firefed_onboarding_v2_dismissed';
const PREFS_KEY = 'firefed_onboarding_v2_prefs';

/**
 * Goal-first onboarding (ROADMAP 57). The question comes first, then only the
 * inputs that question needs, then one write to the scenario and a jump to the
 * page that answers it. Everything else lives on /plan/inputs.
 */
const GOALS = Object.freeze([
  {
    id: 'leave',
    title: 'When can I leave federal service?',
    description: 'Find the earliest age your pension, TSP, and savings hold together.',
    fields: ['currentAge', 'yearsOfService', 'annualSalary', 'tspBalance', 'monthlyIncomeGoal', 'separationAge'],
    to: '/plan',
  },
  {
    id: 'income',
    title: 'What will my retirement income look like?',
    description: 'Pension, supplement, Social Security, and withdrawals year by year.',
    fields: ['currentAge', 'yearsOfService', 'annualSalary', 'tspBalance', 'monthlyIncomeGoal', 'separationAge', 'socialSecurity'],
    to: '/plan',
  },
  {
    id: 'compare',
    title: 'Compare retirement ages',
    description: 'See what leaving at 55, 57, or 62 does to the numbers side by side.',
    fields: ['currentAge', 'yearsOfService', 'annualSalary', 'tspBalance'],
    to: '/scenarios/compare',
  },
  {
    id: 'pension',
    title: 'Estimate my FERS pension',
    description: 'The annuity formula with your service, High-3, and eligibility.',
    fields: ['currentAge', 'yearsOfService', 'high3Salary'],
    to: '/fers-pension',
  },
]);

const FIELD_DEFS = Object.freeze({
  currentAge: { label: 'Current age', min: 16, max: 100 },
  yearsOfService: { label: 'Years of federal service', min: 0, max: 50 },
  annualSalary: { label: 'Current salary', prefix: '$', min: 0 },
  high3Salary: { label: 'High-3 average salary', prefix: '$', min: 0, hint: 'Average of your highest three consecutive years of basic pay.' },
  tspBalance: { label: 'TSP balance', prefix: '$', min: 0 },
  monthlyIncomeGoal: { label: 'Monthly income goal in retirement', prefix: '$', min: 0, hint: "In today's dollars." },
  separationAge: { label: 'Separation age (a guess is fine)', min: 16, max: 100, hint: 'When you think you might leave. The plan will tell you if it holds.' },
  socialSecurity: { label: 'Social Security at full retirement age', prefix: '$', min: 0, hint: 'Monthly, from your SSA statement. Leave blank to estimate from salary.', optional: true },
});

const COHORT_OPTIONS = Object.entries(FERS_HIRE_COHORT_LABELS).map(([value, label]) => ({ value, label }));

const safeParseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const readStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const toText = (v) => (v === null || v === undefined ? '' : String(v));

/** The step-2 form values, seeded from the scenario so nothing is re-entered. */
function seedValues(scenario) {
  if (!scenario) return {};
  const ss = scenario.summary?.socialSecurity;
  return {
    currentAge: toText(scenario.profile?.currentAge),
    yearsOfService: toText(scenario.fers?.yearsOfService),
    annualSalary: toText(scenario.tsp?.annualSalary),
    high3Salary: toText(scenario.fers?.high3Salary),
    tspBalance: toText(scenario.tsp?.currentBalance),
    monthlyIncomeGoal: toText(scenario.fire?.monthlyFireIncomeGoal),
    separationAge: toText(scenario.profile?.separationAge),
    socialSecurity: ss?.mode === 'manual' && ss.monthlyBenefit > 0 ? toText(ss.monthlyBenefit) : '',
    hireCohort: scenario.profile?.hireCohort ?? '',
    fehbYearsEnrolled: toText(scenario.healthcare?.fehbYearsEnrolled),
  };
}

const parseNumber = (text) => {
  if (text === '' || text === null || text === undefined) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/** Builds the single scenario patch the Finish button writes. */
function buildOnboardingUpdates(goal, values) {
  const n = (key) => parseNumber(values[key]);
  const has = (key) => goal.fields.includes(key) && n(key) !== null;

  const profile = {};
  const tsp = {};
  const fers = {};
  const fire = {};
  const summary = {};
  const healthcare = {};

  if (has('currentAge')) profile.currentAge = n('currentAge');
  if (has('separationAge')) profile.separationAge = n('separationAge');
  if (has('yearsOfService')) fers.yearsOfService = n('yearsOfService');
  if (has('annualSalary')) {
    tsp.annualSalary = n('annualSalary');
    // Without a High-3 of their own, the salary is the best available figure.
    if (!goal.fields.includes('high3Salary')) fers.high3Salary = n('annualSalary');
  }
  if (has('high3Salary')) fers.high3Salary = n('high3Salary');
  if (has('tspBalance')) tsp.currentBalance = n('tspBalance');
  if (has('monthlyIncomeGoal')) fire.monthlyFireIncomeGoal = n('monthlyIncomeGoal');
  if (goal.fields.includes('socialSecurity')) {
    const benefit = n('socialSecurity');
    summary.socialSecurity = benefit && benefit > 0
      ? { mode: 'manual', monthlyBenefit: benefit }
      : { mode: 'estimate' };
  }
  if (values.hireCohort) profile.hireCohort = values.hireCohort;
  const fehbYears = parseNumber(values.fehbYearsEnrolled);
  if (fehbYears !== null) healthcare.fehbYearsEnrolled = fehbYears;

  const updates = {};
  if (Object.keys(profile).length) updates.profile = profile;
  if (Object.keys(tsp).length) updates.tsp = tsp;
  if (Object.keys(fers).length) updates.fers = fers;
  if (Object.keys(fire).length) updates.fire = fire;
  if (Object.keys(summary).length) updates.summary = summary;
  if (Object.keys(healthcare).length) updates.healthcare = healthcare;
  updates.meta = { onboardingGoal: goal.id };
  return updates;
}

function StepDots({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding progress">
      {[1, 2, 3].map((s) => (
        <li
          key={s}
          aria-current={s === step ? 'step' : undefined}
          className={`h-2.5 w-2.5 rounded-full ${s <= step ? 'bg-navy-600 dark:bg-navy-400' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className="sr-only">Step {s}</span>
        </li>
      ))}
    </ol>
  );
}

function OnboardingCard() {
  const navigate = useNavigate();
  const { currentScenario, updateCurrentScenario } = useScenario();
  const [dismissed, setDismissed] = useState(() => readStorage(STORAGE_KEY) === 'true');
  const [step, setStep] = useState(1);
  const [goalId, setGoalId] = useState(() => safeParseJson(readStorage(PREFS_KEY), {})?.goalId ?? null);
  const [values, setValues] = useState({});
  const [seededFor, setSeededFor] = useState(null);
  const headingRef = useRef(null);
  const firstStepRef = useRef(true);

  // Seed the form once per scenario so the user never re-types a known value.
  useEffect(() => {
    if (!currentScenario || seededFor === currentScenario.id) return;
    setValues(seedValues(currentScenario));
    setSeededFor(currentScenario.id);
  }, [currentScenario, seededFor]);

  useEffect(() => {
    if (goalId) writeStorage(PREFS_KEY, JSON.stringify({ goalId }));
  }, [goalId]);

  // Moving between steps unmounts the control that had focus (the goal button,
  // the Next button), which would drop focus on <body>. Send it to the heading
  // of the step that just appeared instead, so the new step is announced and
  // tabbing continues from the top of it.
  useEffect(() => {
    if (firstStepRef.current) {
      firstStepRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  if (dismissed) return null;

  const goal = GOALS.find((g) => g.id === goalId) ?? null;
  const setValue = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const missingRequired = goal
    ? goal.fields.filter((key) => !FIELD_DEFS[key].optional && parseNumber(values[key]) === null)
    : [];

  const dismiss = () => {
    writeStorage(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  const finish = () => {
    if (!goal) return;
    updateCurrentScenario(buildOnboardingUpdates(goal, values));
    dismiss();
    navigate(goal.to);
  };

  const inputClass = 'input-field w-full';

  return (
    <section
      className="card p-6 mb-8"
      aria-labelledby="onboarding-heading"
      data-testid="onboarding"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            id="onboarding-heading"
            ref={headingRef}
            tabIndex={-1}
            className="focus-ring text-xl font-semibold navy-text"
          >
            {step === 1 ? 'What do you want to explore?' : step === 2 ? goal?.title : 'Two optional details'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {step === 1
              ? 'Pick a question. We only ask for the numbers that question needs.'
              : step === 2
                ? 'Rough numbers are fine. Everything can be changed later on one page.'
                : 'These sharpen the answer but are not required.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StepDots step={step} />
          <button
            type="button"
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
            onClick={dismiss}
            aria-label="Dismiss onboarding"
            title="Dismiss"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      {step === 1 ? (
        <div className="grid sm:grid-cols-2 gap-3" role="group" aria-label="Goals">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`focus-ring text-left p-4 rounded-lg border-2 transition-colors ${
                goalId === g.id
                  ? 'border-navy-600 bg-navy-50 dark:bg-navy-900/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-navy-400'
              }`}
              onClick={() => {
                setGoalId(g.id);
                setStep(2);
              }}
            >
              <span className="block font-medium text-slate-900 dark:text-white">{g.title}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-400 mt-1">{g.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 && goal ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!missingRequired.length) setStep(3);
          }}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goal.fields.map((key) => {
              const def = FIELD_DEFS[key];
              const id = `onboarding-${key}`;
              return (
                <div key={key}>
                  <label className="label" htmlFor={id}>
                    {def.label}
                    {def.optional ? <span className="text-slate-400 font-normal"> (optional)</span> : null}
                  </label>
                  <div className="relative">
                    {def.prefix ? (
                      <span className="absolute left-3 top-3 text-slate-500 dark:text-slate-400 pointer-events-none">{def.prefix}</span>
                    ) : null}
                    <input
                      id={id}
                      type="text"
                      inputMode="decimal"
                      className={`${inputClass} ${def.prefix ? 'pl-8' : ''}`}
                      value={values[key] ?? ''}
                      aria-describedby={def.hint ? `${id}-hint` : undefined}
                      onChange={(e) => setValue(key, e.target.value)}
                    />
                  </div>
                  {def.hint ? (
                    <p id={`${id}-hint`} className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {def.hint}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary text-sm inline-flex items-center gap-2" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            {/* aria-disabled rather than disabled: the button stays focusable,
                so a keyboard user can reach it and hear why it does nothing. */}
            <button
              type="submit"
              className={`btn-primary text-sm inline-flex items-center gap-2 ${
                missingRequired.length ? 'opacity-50' : ''
              }`}
              aria-disabled={missingRequired.length > 0}
              aria-describedby="onboarding-missing"
            >
              Next
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span id="onboarding-missing" role="status" className="text-xs text-slate-500 dark:text-slate-400">
              {missingRequired.length ? 'Fill in every field to continue.' : ''}
            </span>
          </div>
        </form>
      ) : null}

      {step === 3 && goal ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish();
          }}
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="onboarding-hireCohort">Hire cohort</label>
              <select
                id="onboarding-hireCohort"
                className={inputClass}
                value={values.hireCohort ?? ''}
                aria-describedby="onboarding-hireCohort-hint"
                onChange={(e) => setValue('hireCohort', e.target.value)}
              >
                {COHORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p id="onboarding-hireCohort-hint" className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sets your FERS contribution rate. It does not change the pension formula.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="onboarding-fehbYearsEnrolled">Years enrolled in FEHB</label>
              <input
                id="onboarding-fehbYearsEnrolled"
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={values.fehbYearsEnrolled ?? ''}
                aria-describedby="onboarding-fehbYearsEnrolled-hint"
                onChange={(e) => setValue('fehbYearsEnrolled', e.target.value)}
              />
              <p id="onboarding-fehbYearsEnrolled-hint" className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Five years before retiring keeps FEHB for life.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary text-sm inline-flex items-center gap-2" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <button type="submit" className="btn-primary text-sm inline-flex items-center gap-2" disabled={!currentScenario}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Finish
            </button>
            <button type="button" className="focus-ring text-sm text-slate-600 dark:text-slate-300 underline underline-offset-2" onClick={finish} disabled={!currentScenario}>
              Skip and finish
            </button>
          </div>
        </form>
      ) : null}

      <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
        Already set up? <Link to="/plan" className="underline underline-offset-2">Go to my plan</Link> or{' '}
        <Link to="/plan/inputs" className="underline underline-offset-2">edit every input</Link>. FireFed stores ages, not birth dates.
      </p>
    </section>
  );
}

export default OnboardingCard;
