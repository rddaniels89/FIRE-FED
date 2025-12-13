import * as Sentry from '@sentry/react';

// Minimal Error Boundary to prevent a blank screen and surface the real error.
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
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 px-6 py-12">
          <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h1 className="text-2xl font-bold navy-text mb-2">App error</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              The app hit an unexpected error. This screen prevents a blank page so you can debug quickly.
            </p>
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap">
              {message}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              Open DevTools Console for the full stack trace.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;


