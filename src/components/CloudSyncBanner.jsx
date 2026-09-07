import { CloudOff, X } from 'lucide-react';
import { useScenario } from '../contexts/ScenarioContext';
import { describeCloudSyncError } from '../lib/scenarios/syncStatus';

/**
 * Shown whenever a scenario write was rejected by the database. Scenario edits
 * survive in local state either way, so without this the failure is invisible.
 */
export default function CloudSyncBanner() {
  const { cloudSyncError, dismissCloudSyncError } = useScenario();
  const described = describeCloudSyncError(cloudSyncError?.error);

  if (!described) return null;

  return (
    <div
      role="alert"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <CloudOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.75} aria-hidden="true" />
            {described.title}
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{described.detail}</p>
          {described.code && (
            <p className="mt-2 font-mono text-xs text-amber-700 dark:text-amber-400">
              Reference: {described.code}
            </p>
          )}
        </div>
        <button
          onClick={dismissCloudSyncError}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
          aria-label="Dismiss sync warning"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
