/**
 * Formatting helpers shared by the plan dashboard components. Kept out of the
 * .jsx files so React Fast Refresh sees only components there.
 */

export function fmtMoney(amount, { compact = false } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (compact) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
    return `${sign}$${Math.round(abs)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Signed money delta: "+$1,200" / "−$800" / "$0". */
export function fmtDelta(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  if (rounded === 0) return '$0';
  return `${rounded > 0 ? '+' : '−'}${fmtMoney(Math.abs(rounded))}`;
}

export function fmtPercent(fraction, digits = 0) {
  const n = Number(fraction);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtYears(years) {
  const n = Number(years);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'year' : 'years'}`;
}

export function fmtAge(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Sums a row field across the rows in [startAge, endAge). */
export function sumRows(rows, startAge, endAge, pick) {
  let total = 0;
  for (const r of rows ?? []) {
    if (r.age >= startAge && r.age < endAge) total += Number(pick(r)) || 0;
  }
  return total;
}

export const SOURCE_COLORS = Object.freeze({
  salary: '#2e4a96',
  pension: '#d88635',
  srs: '#f0b27a',
  socialSecurity: '#5b8def',
  spouseIncome: '#8b5cf6',
  spouseSocialSecurity: '#c4b5fd',
  spousePension: '#a78bfa',
  sideHustle: '#14b8a6',
  withdrawals: '#94a3b8',
  outflow: '#dc2626',
  balance: '#0f766e',
});
