import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getRule } from '../lib/rules/registry';

/**
 * "How was this calculated" affordance (ROADMAP.md item 45).
 *
 * Wraps a figure and adds a small info button. Clicking it opens a popover
 * (role="dialog") showing the rule's plain-English description, its formula,
 * the inputs used, the primary source, the statute, and when the rule was last
 * verified. Escape and clicking outside both close it. An unknown rule id
 * renders a placeholder rather than throwing, so a component can reference a
 * rule before its entry is written.
 *
 * Props:
 *   ruleId    id from src/lib/rules/registry.js
 *   children  the figure being explained
 *   inputs    optional { label: value } shown as "Inputs used"
 *   className optional extra classes for the wrapper
 *   align     'left' (default) anchors the popover to the left of the figure;
 *             'right' anchors it to the right edge from `sm` up, for figures in
 *             right-aligned cells where a left-anchored panel would push past
 *             the wrapper and get clipped (or grow an overflow-x-auto region).
 */
export default function HowCalculated({ ruleId, children, inputs, className = '', align = 'left' }) {
  const rule = getRule(ruleId);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onPointer = (e) => {
      if (!wrapperRef.current || wrapperRef.current.contains(e.target)) return;
      // Only pull focus back to the trigger when it currently sits inside the
      // popover we are about to unmount; otherwise closing would yank focus
      // away from whatever the user is actually working with.
      const active = document.activeElement;
      if (dialogRef.current && active && dialogRef.current.contains(active)) close();
      else setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open, close]);

  const title = rule?.title ?? 'How was this calculated?';

  return (
    <span ref={wrapperRef} className={`relative inline-flex items-center gap-1 ${className}`.trim()}>
      {children}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-5 w-5 items-center justify-center rounded-full text-xs leading-none text-slate-500 after:absolute after:-inset-2.5 after:content-[''] hover:text-navy-700 hover:bg-slate-100 dark:hover:text-navy-300 dark:hover:bg-slate-700 print:hidden"
        aria-label={`How was this calculated? ${title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="How was this calculated?"
      >
        ⓘ
      </button>
      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={rule ? descId : undefined}
          tabIndex={-1}
          className={`absolute left-0 top-full z-50 mt-2 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white p-4 text-left text-sm font-normal normal-case tracking-normal text-slate-800 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:w-96 ${
            align === 'right' ? 'sm:left-auto sm:right-0' : ''
          }`.trim()}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <button
              type="button"
              onClick={close}
              className="-mr-1 -mt-1 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {!rule ? (
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Explanation not yet written for <code className="text-xs">{String(ruleId)}</code>.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <p id={descId} className="text-slate-700 dark:text-slate-200">
                {rule.plainEnglish}
              </p>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Formula</div>
                <code className="mt-1 block whitespace-pre-wrap break-words rounded bg-slate-100 px-2 py-1.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  {rule.formula}
                </code>
              </div>

              {inputs && Object.keys(inputs).length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Inputs used</div>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {Object.entries(inputs).map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">{formatInputValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold">Source:</span>{' '}
                <a
                  href={rule.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-navy-700 underline hover:text-navy-900 dark:text-navy-300"
                >
                  {rule.source.name}
                </a>
                {rule.statute && (
                  <>
                    {' · '}
                    <span className="font-semibold">Statute:</span> {rule.statute}
                  </>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Rule year {rule.ruleYear} · Last verified {rule.lastVerified}
                {rule.verifiedAgainst ? ` · Verified against ${rule.verifiedAgainst}` : ''}
              </div>

              {rule.caveats.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Caveats</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600 dark:text-slate-300">
                    {rule.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function formatInputValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}
