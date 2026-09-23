import { useMemo, useState } from 'react';
import { WIZARD_QUESTIONS, suggestMilitaryPath } from './militaryPathSuggestion';

const PATH_LABELS = {
  regular: 'Active or regular retirement',
  reserve_nonregular: 'Guard or Reserve retirement based on points',
  medical: 'Official medical retirement',
  tera: 'Official TERA retirement',
  already_retired: 'Check the model against my retired pay',
};

/**
 * The "I am not sure" wizard: a handful of plain questions, a live
 * suggestion with the records that decide it, and one button that moves the
 * visitor to that path. It cannot declare eligibility and says so.
 */
export default function MilitaryPathWizard({ onChoose }) {
  const [answers, setAnswers] = useState({});
  const suggestion = useMemo(() => suggestMilitaryPath(answers), [answers]);
  const visible = WIZARD_QUESTIONS.filter((q) => !q.showWhen || q.showWhen(answers));

  return (
    <div className="card p-6 mt-6" data-testid="unsure-explainer">
      <h2 className="text-lg font-semibold navy-text">A few questions to find the right path</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
        None of this tells you which path you are on. Your service record, your points statement, or your orders do. These questions only point you to the path that matches them, and say which record to check.
      </p>
      <div className="grid lg:grid-cols-2 gap-6 mt-5">
        <div className="space-y-5">
          {visible.map((q) => (
            <fieldset key={q.id} data-testid={`wizard-${q.id}`}>
              <legend className="label">{q.label}</legend>
              <div className="space-y-1.5 mt-1">
                {q.options.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name={`wizard-${q.id}`} value={o.value} checked={answers[q.id] === o.value} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.value }))} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 h-fit" aria-live="polite" data-testid="wizard-suggestion">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Suggested path</div>
          <div className="mt-1 font-semibold text-slate-900 dark:text-white">{suggestion.headline}</div>
          {suggestion.confidence === 'tentative' && <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">Tentative: some answers were "not sure". The record decides.</div>}
          {suggestion.why.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
              {suggestion.why.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          {suggestion.check.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Records to have at hand</div>
              <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-5">
                {suggestion.check.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
          {suggestion.path && (
            <button type="button" className="btn-primary btn-sm mt-4" onClick={() => onChoose(suggestion.path)}>
              Continue with {PATH_LABELS[suggestion.path].toLowerCase()}
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">You can change the path at any time above. FireFed does not decide eligibility; the service does.</p>
        </div>
      </div>
    </div>
  );
}
