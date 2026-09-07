import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import NumberStepper from '../../NumberStepper';

const DEBOUNCE_MS = 300;

const toText = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

/**
 * A collapsible section. The header is a real button so it is keyboard
 * reachable; when collapsed it shows the one-line summary of the section's
 * current values so the page reads as a profile even with everything closed.
 */
export function Section({ id, title, summary, open, onToggle, badge = null, children }) {
  const panelId = `${id}-panel`;
  return (
    <section className="card" id={id} data-testid={`section-${id}`}>
      <h2 className="m-0">
        <button
          type="button"
          className="focus-ring w-full flex items-start gap-3 p-4 text-left rounded-xl"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {open ? (
            <ChevronDown className="h-5 w-5 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-5 w-5 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          )}
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 text-lg font-semibold navy-text">
              {title}
              {badge}
            </span>
            {!open && summary ? (
              <span className="block text-sm text-slate-500 dark:text-slate-400 truncate">{summary}</span>
            ) : null}
          </span>
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="px-4 pb-5 pt-2 border-t border-slate-200 dark:border-slate-700">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gold-100 text-gold-800 dark:bg-gold-900/30 dark:text-gold-300">
      <Lock className="h-3 w-3" aria-hidden="true" />
      Pro
    </span>
  );
}

/** The upgrade call-to-action shown inside a gated section for free users. */
export function ProNotice({ reason, children }) {
  return (
    <div className="mb-4 p-3 rounded-lg border border-gold-200 dark:border-gold-700 bg-gold-50 dark:bg-gold-900/20 text-sm text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-3">
      <span>{children}</span>
      <Link to="/pro-features" state={{ reason }} className="btn-primary text-sm py-2 px-4">
        See Pro
      </Link>
    </div>
  );
}

export function Grid({ children, className = '' }) {
  return <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</div>;
}

export function Field({ id, label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

/**
 * A number input that owns its text while focused and commits the parsed
 * value after a short pause (or on blur). The scenario is the source of
 * truth: once the field loses focus it re-reads the stored value, so a value
 * the schema clamped shows up clamped.
 *
 * `allowBlank` commits null for an empty field (used for "blank = default").
 */
export function NumberField({
  id,
  label,
  value,
  onCommit,
  hint,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  placeholder,
  allowBlank = false,
  disabled = false,
  stepper = false,
}) {
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!focused) setText(toText(value));
  }, [value, focused]);

  const clamp = (n) => {
    let x = n;
    if (min !== undefined && min !== null) x = Math.max(min, x);
    if (max !== undefined && max !== null) x = Math.min(max, x);
    return x;
  };

  const parse = (t) => {
    if (t.trim() === '') return allowBlank ? { ok: true, value: null } : { ok: false };
    const n = Number(t);
    return Number.isFinite(n) ? { ok: true, value: clamp(n) } : { ok: false };
  };

  const flush = () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendingRef.current) {
      const { value: next } = pendingRef.current;
      pendingRef.current = null;
      onCommitRef.current(next);
    }
  };

  // Commit anything still pending when the field unmounts (e.g. a section collapses).
  useEffect(() => () => flush(), []);

  const handleChange = (e) => {
    const t = e.target.value;
    setText(t);
    const parsed = parse(t);
    clearTimeout(timerRef.current);
    if (!parsed.ok) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = { value: parsed.value };
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
  };

  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const bump = (direction) => {
    const parsed = parse(text);
    const current = parsed.ok && parsed.value !== null ? parsed.value : Number(value) || 0;
    const next = clamp(Number((current + direction * step).toFixed(decimals)));
    clearTimeout(timerRef.current);
    pendingRef.current = null;
    setText(String(next));
    onCommitRef.current(next);
  };

  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className={`input-field w-full ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-10' : ''}`}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={label}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        flush();
        setFocused(false);
      }}
    />
  );

  return (
    <Field id={id} label={label} hint={hint}>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          {prefix ? (
            <span className="absolute left-3 top-3 text-slate-500 dark:text-slate-400 pointer-events-none">{prefix}</span>
          ) : null}
          {input}
          {suffix ? (
            <span className="absolute right-3 top-3 text-slate-500 dark:text-slate-400 pointer-events-none">{suffix}</span>
          ) : null}
        </div>
        {stepper ? (
          <NumberStepper
            incrementLabel={`Increase ${label}`}
            decrementLabel={`Decrease ${label}`}
            onIncrement={() => bump(1)}
            onDecrement={() => bump(-1)}
            disabledIncrement={disabled || (max !== undefined && Number(value) >= max)}
            disabledDecrement={disabled || (min !== undefined && Number(value) <= min)}
          />
        ) : null}
      </div>
    </Field>
  );
}

export function SelectField({ id, label, value, onChange, options, hint, disabled = false }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <select
        id={id}
        className="input-field w-full"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({ id, label, checked, onChange, hint, disabled = false }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
        <input
          id={id}
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="font-medium">{label}</span>
      </label>
      {hint ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-7">{hint}</p> : null}
    </div>
  );
}

export function RadioField({ name, label, value, onChange, options, hint, disabled = false }) {
  return (
    <fieldset className="min-w-0">
      <legend className="label">{label}</legend>
      <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
        {options.map((opt) => (
          <label key={String(opt.value)} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name={name}
              className="mt-1"
              value={opt.value}
              checked={value === opt.value}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {hint ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p> : null}
    </fieldset>
  );
}
