export function percentile(sortedNumbersAsc, p) {
  const arr = Array.isArray(sortedNumbersAsc) ? sortedNumbersAsc : [];
  if (arr.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = (arr.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const w = idx - lo;
  return arr[lo] * (1 - w) + arr[hi] * w;
}

export function summarizePercentiles(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  return {
    p10: percentile(nums, 0.1),
    p50: percentile(nums, 0.5),
    p90: percentile(nums, 0.9),
  };
}


