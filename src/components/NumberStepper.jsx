/**
 * Small +/- stepper UI to sit next to an existing input.
 * Parent owns parsing/validation; this component only emits increment/decrement events.
 */
export default function NumberStepper({
  onIncrement,
  onDecrement,
  incrementLabel = 'Increase value',
  decrementLabel = 'Decrease value',
  disabledIncrement = false,
  disabledDecrement = false,
}) {
  return (
    <div className="flex flex-col shrink-0">
      <button
        type="button"
        aria-label={incrementLabel}
        onClick={onIncrement}
        disabled={disabledIncrement}
        className="focus-ring h-6 w-9 rounded-t-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        +
      </button>
      <button
        type="button"
        aria-label={decrementLabel}
        onClick={onDecrement}
        disabled={disabledDecrement}
        className="focus-ring h-6 w-9 -mt-px rounded-b-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        −
      </button>
    </div>
  );
}


