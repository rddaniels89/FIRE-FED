import { useEffect, useRef, useState } from 'react';

/**
 * The separation-age slider with the sustainability strip beneath it.
 *
 * The slider is bound to local state so dragging repaints the page from a
 * preview timeline; the scenario is only written on commit (release, key up,
 * or a 300 ms pause), which keeps the persisted scenario from thrashing.
 */
export default function SeparationAgeSlider({
  currentAge,
  maxAge = 75,
  committedAge,
  value,
  onPreview,
  onCommit,
  sweep,
  fireAge,
}) {
  const [pending, setPending] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const commit = (age) => {
    clearTimeout(debounceRef.current);
    setPending(false);
    if (age !== committedAge) onCommit(age);
  };

  const handleChange = (e) => {
    const age = Number(e.target.value);
    onPreview(age);
    setPending(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(age), 300);
  };

  const min = Math.ceil(currentAge);
  const max = Math.max(min, maxAge);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label htmlFor="separation-age-slider" className="label mb-0">
          Separation age
        </label>
        <div className="text-2xl font-bold navy-text tabular-nums">
          {value}
          {pending && <span className="ml-2 text-xs font-normal text-slate-500">previewing…</span>}
        </div>
      </div>
      <input
        id="separation-age-slider"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={handleChange}
        onMouseUp={() => commit(value)}
        onTouchEnd={() => commit(value)}
        onKeyUp={() => commit(value)}
        className="w-full accent-navy-600"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label="Separation age"
      />
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
        <span>{min} (now)</span>
        <span>{max}</span>
      </div>

      {Array.isArray(sweep) && sweep.length > 0 && (
        <div className="mt-3">
          <div className="flex gap-px" role="img" aria-label="Sustainability by separation age">
            {sweep.map((s) => {
              const isSelected = s.separationAge === value;
              const isFire = s.separationAge === fireAge;
              return (
                <div
                  key={s.separationAge}
                  title={`Age ${s.separationAge}: ${s.isSustainable ? 'sustainable' : 'not sustainable'} · ${s.pathLabel}`}
                  className={`h-3 flex-1 rounded-sm ${
                    s.isSustainable ? 'bg-green-500 dark:bg-green-400' : 'bg-red-400 dark:bg-red-500'
                  } ${isSelected ? 'ring-2 ring-navy-700 dark:ring-white ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''} ${
                    isFire ? 'outline outline-2 outline-gold-500' : ''
                  }`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-green-500" /> sustainable to end age
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-red-400" /> runs short
            </span>
            {fireAge != null && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-2 rounded-sm outline outline-2 outline-gold-500" /> projected earliest
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
