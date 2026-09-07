/** Small formatters for the collapsed-section summaries on /plan/inputs. */

export const money = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${Math.round(v).toLocaleString()}`;
};

export const pct = (n, digits = 1) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Number(v.toFixed(digits))}%`;
};

/** A fraction such as 0.04 shown as a percent number (4). */
export const fractionToPercent = (fraction) => {
  const v = Number(fraction);
  return Number.isFinite(v) ? Number((v * 100).toFixed(4)) : null;
};

export const percentToFraction = (percent) => {
  const v = Number(percent);
  return Number.isFinite(v) ? v / 100 : null;
};

export const isBlank = (v) => v === null || v === undefined || v === '';
