import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScenario } from '../../contexts/ScenarioContext';
import { useAuth } from '../../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../../lib/entitlements';
import { buildTimeline } from '../../lib/projection/timeline';
import { findFireDate, withSeparationAge } from '../../lib/projection/fireDate';
import { oneYearDeltas, separationSweep } from '../../lib/projection/deltas';
import HowCalculated from '../HowCalculated';
import SeparationAgeSlider from './SeparationAgeSlider';
import DeltaCards from './DeltaCards';
import BridgeSection from './BridgeSection';
import IncomeSection from './IncomeSection';
import TimelineChart from './TimelineChart';
import YearByYearTable from './YearByYearTable';
import DurabilitySection from './DurabilitySection';
import { fmtMoney, fmtYears } from './planFormat';

const MAX_SEPARATION_AGE = 75;

function Section({ id, title, lede, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mb-10">
      <h2 id={`${id}-heading`} className="text-2xl font-bold navy-text mb-1">
        {title}
      </h2>
      {lede && <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{lede}</p>}
      {children}
    </section>
  );
}

function EmptyState({ loading }) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold navy-text mb-3">My Plan</h1>
      <div className="card p-8 text-center">
        {loading ? (
          <p className="text-slate-600 dark:text-slate-400">Loading your scenario…</p>
        ) : (
          <>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              No scenario is loaded yet. Create or select one to see your projected timeline.
            </p>
            <Link to="/scenarios" className="btn-primary inline-block">
              Go to scenarios
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The plan dashboard: four questions, one model.
 *
 * Everything shown here is a reading from `buildTimeline`. The slider drives a
 * preview scenario so the page repaints from a preview timeline while
 * dragging; the persisted scenario is only written on commit.
 */
export default function PlanDashboard() {
  const { currentScenario, updateCurrentScenario, isLoadingScenarios } = useScenario();
  const { entitlements } = useAuth();

  const committedAge = Number(currentScenario?.profile?.separationAge);
  const [sliderAge, setSliderAge] = useState(committedAge);
  const [mode, setMode] = useState('nominal');

  useEffect(() => {
    if (Number.isFinite(committedAge)) setSliderAge(committedAge);
  }, [committedAge]);

  const previewAge = Number.isFinite(sliderAge) ? sliderAge : committedAge;

  const viewScenario = useMemo(() => {
    if (!currentScenario) return null;
    if (previewAge === committedAge) return currentScenario;
    return withSeparationAge(currentScenario, previewAge);
  }, [currentScenario, previewAge, committedAge]);

  const timeline = useMemo(() => (viewScenario ? buildTimeline(viewScenario) : null), [viewScenario]);
  const fireDate = useMemo(() => (currentScenario ? findFireDate(currentScenario) : null), [currentScenario]);
  const deltas = useMemo(
    () => (viewScenario && timeline ? oneYearDeltas(viewScenario, { baseTimeline: timeline }) : null),
    [viewScenario, timeline]
  );
  const sweep = useMemo(
    () =>
      currentScenario
        ? separationSweep(currentScenario, {
            fromAge: currentScenario.profile.currentAge,
            toAge: MAX_SEPARATION_AGE,
          })
        : null,
    [currentScenario]
  );

  const deflate = useCallback(
    (value, row) => (mode === 'real' ? Number(value) / (row?.real?.deflator || 1) : Number(value)),
    [mode]
  );

  const setSeparationAge = useCallback(
    (age) => {
      setSliderAge(age);
      updateCurrentScenario({ profile: { separationAge: age } });
    },
    [updateCurrentScenario]
  );

  const toggleStrategy = useCallback(
    (key, enabled) => updateCurrentScenario({ strategies: { [key]: { enabled } } }),
    [updateCurrentScenario]
  );

  if (!currentScenario || !timeline) return <EmptyState loading={Boolean(isLoadingScenarios)} />;

  const { plan, summary, rows } = timeline;
  const profile = currentScenario.profile;
  const canStrategies = hasEntitlement(entitlements, FEATURES.BRIDGE_STRATEGIES);
  const isPreviewing = previewAge !== committedAge;

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold navy-text mb-2">My Plan</h1>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          One lifetime timeline, read four ways. Every figure is a projection under the assumptions on the{' '}
          <Link to="/plan/inputs" className="text-navy-600 dark:text-navy-300 hover:underline">
            Inputs
          </Link>{' '}
          page; nothing here is a recommendation.
        </p>
      </div>

      <Section
        id="when"
        title="When could I leave?"
        lede="The earliest separation age at which the projected timeline never runs short, and what one year either way changes."
      >
        <div className="grid lg:grid-cols-5 gap-6 mb-6">
          <div className="card p-6 lg:col-span-2 flex flex-col justify-center text-center">
            <div className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Projected sustainable separation age
            </div>
            {fireDate?.found ? (
              <>
                <div className="text-5xl font-bold gold-accent mb-2 tabular-nums">
                  <HowCalculated ruleId="fire.date">{fireDate.separationAge}</HowCalculated>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {fireDate.yearsFromNow === 0 ? 'this year' : `${fmtYears(fireDate.yearsFromNow)} from now`} via{' '}
                  {fireDate.timeline.plan.pathLabel}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                  <HowCalculated ruleId="fire.date">Not found before {MAX_SEPARATION_AGE}</HowCalculated>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  No separation age up to {MAX_SEPARATION_AGE} keeps the projection funded to the end age under these
                  assumptions.
                </div>
              </>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              Educational projection under these assumptions, not advice.
            </div>
          </div>

          <div className="card p-6 lg:col-span-3">
            <SeparationAgeSlider
              currentAge={profile.currentAge}
              maxAge={MAX_SEPARATION_AGE}
              committedAge={committedAge}
              value={previewAge}
              onPreview={setSliderAge}
              onCommit={setSeparationAge}
              sweep={sweep}
              fireAge={fireDate?.separationAge ?? null}
            />
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Path</div>
                <div className="font-medium text-slate-800 dark:text-slate-200">{plan.pathLabel}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Pension at start</div>
                <div className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                  <HowCalculated ruleId="fers.annuity">{fmtMoney(plan.annuity.annualAtStart)}/yr</HowCalculated>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Sustainable</div>
                <div className={`font-medium ${summary.isSustainable ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  <HowCalculated ruleId="timeline.sustainable">
                    {summary.isSustainable ? 'Yes, to end age' : `No, short at ${summary.firstShortfallAge}`}
                  </HowCalculated>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Lifetime taxes</div>
                <div className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                  <HowCalculated ruleId="tax.federal">{fmtMoney(summary.cumulativeTaxes, { compact: true })}</HowCalculated>
                </div>
              </div>
            </div>
            {isPreviewing && (
              <p className="text-xs text-gold-700 dark:text-gold-300 mt-3">
                Previewing age {previewAge}; release the slider to save it to the scenario.
              </p>
            )}
          </div>
        </div>

        <DeltaCards deltas={deltas} onUseAge={setSeparationAge} />
      </Section>

      <Section
        id="bridge"
        title="How do I bridge the gap?"
        lede="Between separation and the first guaranteed income, spending comes from assets. This is what that costs."
      >
        <div className="card p-6">
          <BridgeSection
            timeline={timeline}
            scenario={viewScenario}
            canUseStrategies={canStrategies}
            onToggleStrategy={toggleStrategy}
          />
        </div>
      </Section>

      <Section
        id="income"
        title="What income starts later?"
        lede="The guaranteed sources, when each begins, and the ages at which the rules change."
      >
        <div className="card p-6">
          <IncomeSection timeline={timeline} deflate={deflate} />
        </div>
      </Section>

      <div className="card p-6 mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-xl font-semibold navy-text">Lifetime timeline</h3>
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-sm" role="group" aria-label="Dollar basis">
            <button
              type="button"
              className={`px-3 py-1.5 ${mode === 'nominal' ? 'bg-navy-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              onClick={() => setMode('nominal')}
              aria-pressed={mode === 'nominal'}
            >
              Nominal
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 ${mode === 'real' ? 'bg-navy-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
              onClick={() => setMode('real')}
              aria-pressed={mode === 'real'}
            >
              Today's dollars
            </button>
          </div>
        </div>
        <TimelineChart rows={rows} mode={mode} separationAge={plan.separationAge} />
      </div>

      <div className="mb-10">
        <YearByYearTable rows={rows} deflate={deflate} mode={mode} />
      </div>

      <Section
        id="durability"
        title="How durable is the projection?"
        lede="The deterministic timeline assumes the expected return every year. These tools ask what happens when it does not."
      >
        <DurabilitySection scenario={viewScenario} timeline={timeline} entitlements={entitlements} />
      </Section>

      <div className="mt-8 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          This projection is educational and is not financial, tax or legal advice.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Every figure depends on the assumptions you entered and on rules that change. Confirm eligibility and amounts
          with OPM, the TSP, the Social Security Administration and a qualified adviser before acting.
        </p>
      </div>
    </div>
  );
}
