import { useEffect, useRef, useState } from 'react';

// Green versus red was the only signal on the sustainability strip, so the
// "runs short" segments also carry a diagonal hatch.
const SHORT_HATCH = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.85) 0 2px, transparent 2px 5px)',
};

/** "sustainable from 51 to 75; runs short below 51" from the sweep. */
function describeSweep(sweep) {
  const runs = [];
  for (const s of sweep) {
    const last = runs[runs.length - 1];
    if (last && last.isSustainable === s.isSustainable) last.toAge = s.separationAge;
    else runs.push({ isSustainable: s.isSustainable, fromAge: s.separationAge, toAge: s.separationAge });
  }
  return runs
    .map((r) => {
      const what = r.isSustainable ? 'sustainable' : 'runs short';
      return r.fromAge === r.toAge ? `${what} at ${r.fromAge}` : `${what} from ${r.fromAge} to ${r.toAge}`;
    })
    .join('; ');
}

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
        aria-valuetext={`age ${value}`}
      />
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
        <span>{min} (now)</span>
        <span>{max}</span>
      </div>

      {Array.isArray(sweep) && sweep.length > 0 && (
        <div className="mt-3">
          <div className="flex gap-px" role="img" aria-label={`Sustainability by separation age: ${describeSweep(sweep)}`}>
            {sweep.map((s) => {
              const isSelected = s.separationAge === value;
              const isFire = s.separationAge === fireAge;
              return (
                <div
                  key={s.separationAge}
                  title={`Age ${s.separationAge}: ${s.isSustainable ? 'sustainable' : 'not sustainable'} · ${s.pathLabel}`}
                  style={s.isSustainable ? undefined : SHORT_HATCH}
                  className={`h-3 flex-1 rounded-sm ${
                    s.isSustainable ? 'bg-green-500 dark:bg-green-400' : 'bg-red-400 dark:bg-red-500'
                  } ${isSelected ? 'ring-2 ring-navy-700 dark:ring-white ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''} ${
                    isFire ? 'outline outline-2 outline-gold-500' : ''
                  }`}
                />
              );
            })}
          </div>
          {/* The strip is hover-only for a sighted mouse user; this is the same
              reading, age by age, for anyone who cannot hover or see the hue. */}
          <ul className="sr-only">
            {sweep.map((s) => (
              <li key={s.separationAge}>{`age ${s.separationAge}: ${s.isSustainable ? 'sustainable' : 'runs short'}`}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-green-500 dark:bg-green-400" /> sustainable to end age
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-red-400 dark:bg-red-500" style={SHORT_HATCH} /> runs short
              (hatched)
            </span>
            {fireAge != null && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-2 rounded-sm outline outline-2 outline-gold-500 dark:outline-gold-400" />{' '}
                projected earliest
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
