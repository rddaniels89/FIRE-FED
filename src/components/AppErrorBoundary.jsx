import * as Sentry from '@sentry/react';

const STORAGE_KEYS_TO_CLEAR = Object.freeze([
  'retirement-scenarios',
  'auth-user',
  'pro-waitlist',
  'theme',
  'firefed_onboarding_v1_dismissed',
  'firefed_onboarding_v1_prefs',
  'firefed_onboarding_v1_checklist',
]);

const buildErrorDetailsText = (error) => {
  const safe = {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    url: typeof window !== 'undefined' ? window.location?.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    timestamp: new Date().toISOString(),
  };

  try {
    return JSON.stringify(safe, null, 2);
  } catch {
    return String(error?.message || 'Unknown error');
  }
};

const clearAppStorage = () => {
  for (const key of STORAGE_KEYS_TO_CLEAR) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
};

// Error Boundary to prevent a blank screen and provide recovery actions.
class AppErrorBoundary extends Sentry.ErrorBoundary {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state?.hasError) {
      const message = this.state?.error?.message || 'Unknown error';
      const detailsText = buildErrorDetailsText(this.state?.error);
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 px-6 py-12">
          <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h1 className="text-2xl font-bold navy-text mb-2">App error</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              The app hit an unexpected error. You can copy details for support/debugging, reload the app, or reset local
              app data (scenarios/auth/theme/onboarding) and reload.
            </p>
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap">
              {message}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(detailsText);
                  } catch {
                    // Clipboard may be blocked; fallback to a prompt.
                    window.prompt('Copy error details:', detailsText);
                  }
                }}
              >
                Copy error details
              </button>

              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => window.location.reload()}
              >
                Reload app
              </button>

              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  const confirmed = window.confirm(
                    'Reset app data stored on this device (scenarios/auth/theme/onboarding) and reload?'
                  );
                  if (!confirmed) return;
                  clearAppStorage();
                  window.location.reload();
                }}
              >
                Reset app data
              </button>
            </div>

            <details className="mt-6">
              <summary className="focus-ring cursor-pointer select-none text-sm text-slate-700 dark:text-slate-200">
                Show technical details
              </summary>
              <pre className="mt-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-xs whitespace-pre-wrap overflow-auto">
                {detailsText}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;


