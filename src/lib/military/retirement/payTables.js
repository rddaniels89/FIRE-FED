/**
 * Military basic pay tables, by effective date, and the lookup that turns a
 * grade, a years-of-service figure, and a date into a monthly rate.
 *
 * The retired-pay base is built from basic pay alone: no BAH, BAS, bonuses, or
 * special pays. A High-36 base needs the actual monthly rates over the highest
 * 36 months, which means the table in force for each of those months. This
 * file carries the tables FireFed has read from a primary source; months
 * before the earliest table need a user-entered pay-base override, and months
 * after the latest are projected with an explicit growth assumption and
 * labelled as such. Nothing is filled in silently.
 *
 * 2026 table (effective 1 January 2026): read from DFAS's basic pay pages on
 * 2026-09-20 (pages updated 12 January 2026; the page titles still say
 * "2025", but the figures are the 2026 rates: the senior enlisted rate of
 * $11,166.90 and every other cell equal the 2025 rates raised 3.8%).
 *   https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/Basic-Pay/EM/
 *   https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/Basic-Pay/WO/
 *   https://www.dfas.mil/militarymembers/payentitlements/Pay-Tables/Basic-Pay/CO/
 *   https://www.dfas.mil/Military-Members/payentitlements/Pay-Tables/Basic-Pay/CO_FE/
 *
 * Columns are the cumulative-years-of-service bands: "2 or less" then "over"
 * 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40.
 * A null cell is a band the grade is not paid in (the table shows a blank).
 *
 * Statutory caps (5 U.S.C. 5304(g) as applied by 37 U.S.C. 203): O-7 to O-10
 * at Level II of the Executive Schedule and O-6 and below at Level V. The
 * published cells already reflect them, so no cap is applied here.
 *
 * Special cases carried separately: E-1 with under four months of service;
 * the senior enlisted member of a service (E-9 rate regardless of service).
 */

export const YOS_BANDS = Object.freeze([0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]);

/** Grade codes as stored; the display label maps E7 → E-7 etc. */
export const GRADES = Object.freeze([
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9',
  'W1', 'W2', 'W3', 'W4', 'W5',
  'O1E', 'O2E', 'O3E',
  'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10',
]);

export function gradeLabel(code) {
  const m = /^([EWO])(\d+)(E?)$/.exec(String(code ?? ''));
  return m ? `${m[1]}-${m[2]}${m[3]}` : String(code ?? '');
}

const N = null;

// prettier-ignore
const TABLE_2026 = Object.freeze({
  effectiveDate: '2026-01-01',
  source: 'DFAS basic pay tables, read 2026-09-20 (pages updated 2026-01-12)',
  verified: true,
  e1Under4Months: 2225.70,
  seniorEnlistedMember: 11166.90,
  rates: Object.freeze({
    //      <2       >2       >3       >4       >6       >8       >10      >12      >14      >16      >18      >20      >22      >24      >26      >28      >30      >32      >34      >36      >38      >40
    E9:  [N,       N,       N,       N,       N,       N,       6910.20, 7066.50, 7263.60, 7496.10, 7730.70, 8105.10, 8423.10, 8756.70, 9267.90, 9267.90, 9730.20, 9730.20, 10217.40, 10217.40, 10729.20, 10729.20],
    E8:  [N,       N,       N,       N,       N,       5656.50, 5907.00, 6061.80, 6247.20, 6448.20, 6811.20, 6995.40, 7308.30, 7481.70, 7908.90, 7908.90, 8067.30, 8067.30, 8067.30, 8067.30, 8067.30, 8067.30],
    E7:  [3932.10, 4291.50, 4456.20, 4673.10, 4843.80, 5135.70, 5300.40, 5591.70, 5835.00, 6000.90, 6177.30, 6245.70, 6475.20, 6598.20, 7067.40, 7067.40, 7067.40, 7067.40, 7067.40, 7067.40, 7067.40, 7067.40],
    E6:  [3401.10, 3743.10, 3908.10, 4068.90, 4235.70, 4612.80, 4759.50, 5043.30, 5130.30, 5193.60, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70, 5267.70],
    E5:  [3342.90, 3598.20, 3775.80, 3946.80, 4110.00, 4299.90, 4395.30, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70, 4421.70],
    E4:  [3142.20, 3303.00, 3482.40, 3658.50, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40, 3815.40],
    E3:  [2836.80, 3015.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00, 3198.00],
    E2:  [2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90, 2697.90],
    E1:  [2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20, 2407.20],
    W5:  [N,       N,       N,       N,       N,       N,       N,       N,       N,       N,       N,       10169.70, 10685.70, 11070.30, 11495.10, 11495.10, 12070.80, 12070.80, 12673.50, 12673.50, 13308.30, 13308.30],
    W4:  [5719.80, 6152.10, 6328.50, 6502.20, 6801.90, 7098.00, 7398.00, 7848.30, 8243.70, 8619.90, 8928.60, 9228.90, 9669.60, 10032.00, 10445.40, 10445.40, 10653.60, 10653.60, 10653.60, 10653.60, 10653.60, 10653.60],
    W3:  [5223.30, 5440.50, 5664.30, 5736.90, 5970.90, 6431.10, 6910.50, 7136.40, 7397.70, 7665.90, 8150.40, 8476.50, 8671.80, 8879.70, 9162.60, 9162.60, 9162.60, 9162.60, 9162.60, 9162.60, 9162.60, 9162.60],
    W2:  [4621.80, 5058.90, 5193.30, 5286.00, 5585.40, 6051.00, 6282.60, 6509.40, 6787.50, 7005.00, 7201.50, 7437.00, 7591.50, 7714.20, 7714.20, 7714.20, 7714.20, 7714.20, 7714.20, 7714.20, 7714.20, 7714.20],
    W1:  [4056.60, 4493.70, 4611.00, 4859.10, 5152.20, 5584.20, 5786.10, 6069.30, 6346.50, 6564.90, 6766.20, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10, 7010.10],
    O3E: [N,       N,       N,       7382.70, 7737.00, 8125.50, 8375.70, 8788.20, 9137.10, 9336.90, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60, 9609.60],
    O2E: [N,       N,       N,       6484.50, 6617.70, 6828.00, 7183.80, 7458.90, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50, 7663.50],
    O1E: [N,       N,       N,       5222.40, 5576.70, 5783.10, 5993.70, 6200.70, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50, 6484.50],
    O10: [N,       N,       N,       N,       N,       N,       N,       N,       N,       N,       N,       18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90],
    O9:  [N,       N,       N,       N,       N,       N,       N,       N,       N,       N,       N,       18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90],
    O8:  [13888.50, 14343.90, 14645.40, 14729.40, 15106.50, 15735.30, 15882.00, 16479.60, 16651.80, 17166.60, 17911.80, 18598.20, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90, 18999.90],
    O7:  [11540.10, 12076.20, 12324.30, 12522.00, 12878.70, 13231.80, 13639.20, 14045.70, 14454.30, 15735.30, 16817.70, 16817.70, 16817.70, 16817.70, 16904.40, 16904.40, 17242.20, 17242.20, 17242.20, 17242.20, 17242.20, 17242.20],
    O6:  [8751.30, 9613.80, 10245.00, 10245.00, 10284.30, 10725.00, 10783.50, 10783.50, 11396.40, 12479.70, 13115.40, 13751.10, 14112.90, 14479.20, 15188.70, 15188.70, 15408.30, 15408.30, 15408.30, 15408.30, 15408.30, 15408.30],
    O5:  [7295.40, 8218.20, 8787.00, 8894.10, 9249.60, 9461.40, 9928.50, 10271.70, 10715.10, 11391.30, 11713.80, 12032.70, 12394.80, 12394.80, 12394.80, 12394.80, 12394.80, 12394.80, 12394.80, 12394.80, 12394.80, 12394.80],
    O4:  [6294.60, 7286.40, 7773.60, 7881.00, 8332.20, 8816.40, 9420.00, 9888.30, 10214.40, 10401.60, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90, 10509.90],
    O3:  [5534.10, 6273.90, 6770.40, 7382.70, 7737.00, 8125.50, 8375.70, 8788.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20, 9004.20],
    O2:  [4782.00, 5446.20, 6272.40, 6484.50, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70, 6617.70],
    O1:  [4150.20, 4320.00, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40, 5222.40],
  }),
});

/**
 * Across-the-board raises by year, for deriving the prior-year tables that
 * have not yet been read from their own publication. A derived table is
 * marked `derived: true, verified: false`, and months priced from one are
 * estimates. The junior-enlisted targeted raise of April 2025 (E-1 to E-4)
 * is not reproduced by a flat factor, so E-1 to E-4 rates before 2026 are
 * excluded from derivation and need the published table.
 */
const RAISES = Object.freeze({ 2026: 0.038, 2025: 0.045, 2024: 0.052 });

function deriveEarlier(later, year) {
  const factor = 1 + RAISES[year + 1];
  const rates = {};
  for (const [grade, row] of Object.entries(later.rates)) {
    if (/^E[1-4]$/.test(grade)) {
      rates[grade] = row.map(() => N);
      continue;
    }
    rates[grade] = row.map((v) => (v === N ? N : Math.round((v / factor) * 10) / 10));
  }
  return Object.freeze({
    effectiveDate: `${year}-01-01`,
    source: `Derived from the ${year + 1} table by removing the ${(RAISES[year + 1] * 100).toFixed(1)}% raise; not the published table`,
    verified: false,
    derived: true,
    e1Under4Months: N,
    seniorEnlistedMember: Math.round((later.seniorEnlistedMember / factor) * 10) / 10,
    rates: Object.freeze(rates),
  });
}

const TABLE_2025 = deriveEarlier(TABLE_2026, 2025);
const TABLE_2024 = deriveEarlier(TABLE_2025, 2024);

/** Tables newest first. */
export const BASIC_PAY_TABLES = Object.freeze([TABLE_2026, TABLE_2025, TABLE_2024]);
export const LATEST_BASIC_PAY_TABLE = TABLE_2026;
export const EARLIEST_BASIC_PAY_TABLE = TABLE_2024;

/**
 * The YOS band index for a years-of-service figure (fractional years allowed).
 * The "over N" rate takes effect on the anniversary of the pay entry base
 * date, the day the member completes N years, so exactly N years is "over N".
 */
export function yosBandIndex(yearsOfService) {
  const y = Number(yearsOfService) || 0;
  let idx = 0;
  for (let i = 1; i < YOS_BANDS.length; i += 1) if (y >= YOS_BANDS[i]) idx = i;
  return idx;
}

export function yosBandLabel(index) {
  return index === 0 ? '2 or less' : `Over ${YOS_BANDS[index]}`;
}

/** The table in force on an ISO date, or null before the earliest. `future` is true past the latest table's year. */
export function tableInForce(isoDate) {
  const d = String(isoDate);
  for (const t of BASIC_PAY_TABLES) {
    if (d >= t.effectiveDate) return { table: t, future: false };
  }
  return { table: null, future: false };
}

/**
 * Monthly basic pay for a grade with `yearsOfService` on `isoDate`.
 *
 *   growthAssumption   decimal annual raise applied per calendar year beyond the
 *                      latest table, for future months; the result is marked assumed
 *   e1Under4Months     true for an E-1 in their first four months
 *   seniorEnlisted     true for the senior enlisted member of a service
 *
 * Returns { monthly, tableDate, band, verified, derived, assumed, source } or
 * null when no table covers the date or the grade is not paid in that band.
 */
export function basicPayMonthly({ grade, yearsOfService, isoDate, growthAssumption = 0, e1Under4Months = false, seniorEnlisted = false } = {}) {
  const code = String(grade ?? '').toUpperCase().replace('-', '');
  const year = Number(String(isoDate).slice(0, 4));
  const latestYear = Number(LATEST_BASIC_PAY_TABLE.effectiveDate.slice(0, 4));
  let table = null;
  let assumed = false;
  let growthYears = 0;
  if (Number.isFinite(year) && year > latestYear) {
    table = LATEST_BASIC_PAY_TABLE;
    assumed = true;
    growthYears = year - latestYear;
  } else {
    table = tableInForce(isoDate).table;
  }
  if (!table) return null;

  const factor = assumed ? Math.pow(1 + (Number(growthAssumption) || 0), growthYears) : 1;
  const band = yosBandIndex(yearsOfService);
  let base;
  if (seniorEnlisted && code === 'E9') base = table.seniorEnlistedMember;
  else if (e1Under4Months && code === 'E1') base = table.e1Under4Months;
  else base = table.rates[code]?.[band] ?? null;
  if (base === null || base === undefined) return null;

  return {
    monthly: Math.round(base * factor * 100) / 100,
    publishedMonthly: base,
    tableDate: table.effectiveDate,
    band,
    bandLabel: yosBandLabel(band),
    verified: Boolean(table.verified) && !assumed,
    derived: Boolean(table.derived),
    assumed,
    growthYears,
    source: table.source,
  };
}
