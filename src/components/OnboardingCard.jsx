import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'firefed_onboarding_v1_dismissed';

function OnboardingCard() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const val = localStorage.getItem(STORAGE_KEY);
    setDismissed(val === 'true');
  }, []);

  if (dismissed) return null;

  return (
    <div className="mb-8 p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold navy-text mb-2">Getting started</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            In a few minutes you can generate a complete retirement summary.
          </p>

          <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside">
            <li>Enter your TSP details</li>
            <li>Enter your FERS service and high-3 salary</li>
            <li>Set your FIRE income goal</li>
            <li>Review your Summary dashboard and export (Pro)</li>
          </ol>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/tsp-forecast" className="btn-primary">Start with TSP</Link>
            <Link to="/fers-pension" className="btn-secondary">Add FERS</Link>
            <Link to="/summary" className="btn-secondary">View Summary</Link>
          </div>
        </div>

        <button
          type="button"
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, 'true');
            setDismissed(true);
          }}
          aria-label="Dismiss onboarding"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default OnboardingCard;


