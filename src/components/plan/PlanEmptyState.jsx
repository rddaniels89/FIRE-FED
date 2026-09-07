import { Link } from 'react-router-dom';

/**
 * The shared "nothing to show yet" state for the plan pages.
 *
 * Loading and empty are different states and have to be told apart: a page that
 * says "Loading…" when the load has already finished with no scenarios waits
 * forever, and a page that says "no scenarios" while they are still arriving is
 * simply wrong. Callers pass `loading` from the scenario context rather than
 * inferring it from a null scenario.
 */
export default function PlanEmptyState({ title, loading, message, error }) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold navy-text mb-3">{title}</h1>
      <div className="card p-8 text-center">
        {loading ? (
          <p className="text-slate-600 dark:text-slate-400" role="status">
            Loading your scenario…
          </p>
        ) : error ? (
          <>
            <p className="text-slate-700 dark:text-slate-200 mb-2">
              This projection could not be built from the current inputs.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{String(error)}</p>
            <Link to="/plan/inputs" className="btn-primary inline-block">
              Review your inputs
            </Link>
          </>
        ) : (
          <>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {message ?? 'No scenario is loaded yet. Create or select one to see your projected timeline.'}
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
