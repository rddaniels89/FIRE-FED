/**
 * The one disclaimer, used on every screen that shows a projected figure.
 *
 * It was previously written five different ways across six screens and missing
 * from four others. One string in one place is both more honest and easier to
 * keep current.
 */
export default function ProjectionDisclaimer({ className = '', compact = false }) {
  if (compact) {
    return (
      <p className={`text-xs text-slate-500 dark:text-slate-400 ${className}`.trim()}>
        Educational projection under these assumptions, not advice.
      </p>
    );
  }

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800/60 ${className}`.trim()}
    >
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        This projection is educational and is not financial, tax or legal advice.
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Every figure depends on the assumptions you entered and on rules that change. Confirm eligibility and amounts
        with OPM, the TSP, the Social Security Administration and a qualified adviser before acting.
      </p>
    </div>
  );
}
