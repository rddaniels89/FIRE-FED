/**
 * VA disability compensation and DIC rate tables, for the table-assisted
 * estimate a user may ask for when they do not have an award letter to hand.
 *
 * The official award always controls. This table exists so a veteran who
 * knows their rating and dependents can see a planning figure, labelled an
 * estimate, until they enter the amount from their letter. It says nothing
 * about what rating anyone should have; FireFed does not estimate ratings,
 * conditions, effective dates, or claims.
 *
 * Rates effective 1 December 2025 (the 2026 COLA), transcribed from va.gov on
 * 2026-09-20:
 *   https://www.va.gov/disability/compensation-rates/veteran-rates/
 *   https://www.va.gov/family-and-caregiver-benefits/survivor-compensation/dependency-indemnity-compensation/survivor-rates/
 *
 * Special monthly compensation, individual unemployability, and the
 * housebound and aid-and-attendance amounts for the veteran are not modelled;
 * a user with those enters the official amount.
 */

export const VA_RATES_EFFECTIVE_DATE = '2025-12-01';
export const VA_RATES_SOURCE = 'https://www.va.gov/disability/compensation-rates/veteran-rates/';

/** 10% and 20%: no dependent additions. */
const LOW_RATINGS = Object.freeze({ 10: 180.42, 20: 356.66 });

/**
 * Monthly base by rating for each dependent configuration. Keys are
 * `${spouse ? 's' : ''}${parents}p${child ? 'c' : ''}`: for example 's1pc' is
 * spouse, one parent, and one child. The table carries at most one child; more
 * children and children in school are add-ons.
 */
const BASE = Object.freeze({
  30: Object.freeze({ '0p': 552.47, s0p: 617.47, s1p: 669.47, s2p: 721.47, '1p': 604.47, '2p': 656.47, '0pc': 596.47, s0pc: 666.47, s1pc: 718.47, s2pc: 770.47, '1pc': 648.47, '2pc': 700.47 }),
  40: Object.freeze({ '0p': 795.84, s0p: 882.84, s1p: 952.84, s2p: 1022.84, '1p': 865.84, '2p': 935.84, '0pc': 853.84, s0pc: 947.84, s1pc: 1017.84, s2pc: 1087.84, '1pc': 923.84, '2pc': 993.84 }),
  50: Object.freeze({ '0p': 1132.9, s0p: 1241.9, s1p: 1329.9, s2p: 1417.9, '1p': 1220.9, '2p': 1308.9, '0pc': 1205.9, s0pc: 1322.9, s1pc: 1410.9, s2pc: 1498.9, '1pc': 1293.9, '2pc': 1381.9 }),
  60: Object.freeze({ '0p': 1435.02, s0p: 1566.02, s1p: 1671.02, s2p: 1776.02, '1p': 1540.02, '2p': 1645.02, '0pc': 1523.02, s0pc: 1663.02, s1pc: 1768.02, s2pc: 1873.02, '1pc': 1628.02, '2pc': 1733.02 }),
  70: Object.freeze({ '0p': 1808.45, s0p: 1961.45, s1p: 2084.45, s2p: 2207.45, '1p': 1931.45, '2p': 2054.45, '0pc': 1910.45, s0pc: 2074.45, s1pc: 2197.45, s2pc: 2320.45, '1pc': 2033.45, '2pc': 2156.45 }),
  80: Object.freeze({ '0p': 2102.15, s0p: 2277.15, s1p: 2417.15, s2p: 2557.15, '1p': 2242.15, '2p': 2382.15, '0pc': 2219.15, s0pc: 2406.15, s1pc: 2546.15, s2pc: 2686.15, '1pc': 2359.15, '2pc': 2499.15 }),
  90: Object.freeze({ '0p': 2362.3, s0p: 2559.3, s1p: 2717.3, s2p: 2875.3, '1p': 2520.3, '2p': 2678.3, '0pc': 2494.3, s0pc: 2704.3, s1pc: 2862.3, s2pc: 3020.3, '1pc': 2652.3, '2pc': 2810.3 }),
  100: Object.freeze({ '0p': 3938.58, s0p: 4158.17, s1p: 4334.41, s2p: 4510.65, '1p': 4114.82, '2p': 4291.06, '0pc': 4085.43, s0pc: 4318.99, s1pc: 4495.23, s2pc: 4671.47, '1pc': 4261.67, '2pc': 4437.91 }),
});

/** Monthly add-ons by rating: each additional child under 18, each child over 18 in school, spouse aid and attendance. */
const ADD_ONS = Object.freeze({
  30: Object.freeze({ childUnder18: 32.0, childInSchool: 105.0, spouseAidAttendance: 61.0 }),
  40: Object.freeze({ childUnder18: 43.0, childInSchool: 140.0, spouseAidAttendance: 81.0 }),
  50: Object.freeze({ childUnder18: 54.0, childInSchool: 176.0, spouseAidAttendance: 101.0 }),
  60: Object.freeze({ childUnder18: 65.0, childInSchool: 211.0, spouseAidAttendance: 121.0 }),
  70: Object.freeze({ childUnder18: 76.0, childInSchool: 246.0, spouseAidAttendance: 141.0 }),
  80: Object.freeze({ childUnder18: 87.0, childInSchool: 281.0, spouseAidAttendance: 161.0 }),
  90: Object.freeze({ childUnder18: 98.0, childInSchool: 317.0, spouseAidAttendance: 181.0 }),
  100: Object.freeze({ childUnder18: 109.11, childInSchool: 352.45, spouseAidAttendance: 201.41 }),
});

export const VA_RATINGS = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Monthly compensation for a rating and dependent set. Returns null for a
 * rating that is not a multiple of ten between 10 and 100.
 *
 *   rating               10..100 in tens
 *   spouse               boolean
 *   childrenUnder18      count
 *   childrenInSchool     count of children over 18 in a qualifying program
 *   parents              0, 1 or 2 dependent parents
 *   spouseAidAttendance  boolean
 */
export function estimateVaCompensation({
  rating,
  spouse = false,
  childrenUnder18 = 0,
  childrenInSchool = 0,
  parents = 0,
  spouseAidAttendance = false,
} = {}) {
  const r = Number(rating);
  if (!VA_RATINGS.includes(r)) return null;

  const under18 = int(childrenUnder18);
  const inSchool = int(childrenInSchool);
  const p = Math.min(2, int(parents));
  const components = [];

  if (r <= 20) {
    const base = LOW_RATINGS[r];
    components.push({ label: `${r}% rate`, monthly: base });
    return finish(r, base, components, { dependentsIgnored: spouse || under18 > 0 || inSchool > 0 || p > 0 });
  }

  // The table's "with 1 child" column counts one child of either kind; the
  // rest are add-ons at the per-child rate for their kind.
  const totalChildren = under18 + inSchool;
  const hasChild = totalChildren > 0;
  const key = `${spouse ? 's' : ''}${p}p${hasChild ? 'c' : ''}`;
  const base = BASE[r][key];
  components.push({ label: describe({ spouse, parents: p, hasChild }), monthly: base });

  let monthly = base;
  const addOn = ADD_ONS[r];
  // One child is in the base. Extra children under 18 and every child in
  // school beyond the one counted are add-ons; a school child counted in the
  // base is priced at the base, so we take the under-18 child in the base
  // first when both kinds exist.
  let extraUnder18 = under18;
  let extraInSchool = inSchool;
  if (hasChild) {
    if (extraUnder18 > 0) extraUnder18 -= 1;
    else extraInSchool -= 1;
  }
  if (extraUnder18 > 0) {
    const amt = extraUnder18 * addOn.childUnder18;
    components.push({ label: `${extraUnder18} additional child${extraUnder18 === 1 ? '' : 'ren'} under 18`, monthly: amt });
    monthly += amt;
  }
  if (extraInSchool > 0) {
    const amt = extraInSchool * addOn.childInSchool;
    components.push({ label: `${extraInSchool} child${extraInSchool === 1 ? '' : 'ren'} over 18 in school`, monthly: amt });
    monthly += amt;
  }
  if (spouse && spouseAidAttendance) {
    components.push({ label: 'Spouse aid and attendance', monthly: addOn.spouseAidAttendance });
    monthly += addOn.spouseAidAttendance;
  }
  return finish(r, monthly, components, { dependentsIgnored: false });
}

function describe({ spouse, parents, hasChild }) {
  const parts = ['Veteran'];
  if (spouse) parts.push('spouse');
  if (parents === 1) parts.push('1 parent');
  if (parents === 2) parts.push('2 parents');
  if (hasChild) parts.push('1 child');
  return parts.length === 1 ? 'Veteran alone' : parts.join(' + ');
}

function finish(rating, monthly, components, extra) {
  const rounded = Math.round(monthly * 100) / 100;
  return {
    rating,
    monthly: rounded,
    annual: Math.round(rounded * 12 * 100) / 100,
    effectiveDate: VA_RATES_EFFECTIVE_DATE,
    source: VA_RATES_SOURCE,
    components,
    ...extra,
  };
}

// ------------------------------------------------------------------- DIC

export const DIC_RATES = Object.freeze({
  effectiveDate: VA_RATES_EFFECTIVE_DATE,
  source: 'https://www.va.gov/family-and-caregiver-benefits/survivor-compensation/dependency-indemnity-compensation/survivor-rates/',
  survivingSpouseBasic: 1699.36,
  eightYearProvision: 360.85,
  aidAndAttendance: 421.0,
  housebound: 197.22,
  eachChildUnder18: 421.0,
  /** Paid for the first two years after the veteran's death when there is a child under 18. */
  transitionalBenefit: 359.0,
});

/** Monthly DIC for a surviving spouse from the current table. Eligibility is VA's determination. */
export function estimateDic({ eightYearProvision = false, aidAndAttendance = false, housebound = false, childrenUnder18 = 0, transitional = false } = {}) {
  const components = [{ label: 'Surviving spouse basic rate', monthly: DIC_RATES.survivingSpouseBasic }];
  let monthly = DIC_RATES.survivingSpouseBasic;
  if (eightYearProvision) { components.push({ label: '8-year provision', monthly: DIC_RATES.eightYearProvision }); monthly += DIC_RATES.eightYearProvision; }
  if (aidAndAttendance) { components.push({ label: 'Aid and attendance', monthly: DIC_RATES.aidAndAttendance }); monthly += DIC_RATES.aidAndAttendance; }
  else if (housebound) { components.push({ label: 'Housebound', monthly: DIC_RATES.housebound }); monthly += DIC_RATES.housebound; }
  const kids = int(childrenUnder18);
  if (kids > 0) { const amt = kids * DIC_RATES.eachChildUnder18; components.push({ label: `${kids} child${kids === 1 ? '' : 'ren'} under 18`, monthly: amt }); monthly += amt; }
  if (transitional && kids > 0) { components.push({ label: 'Transitional benefit (first 2 years)', monthly: DIC_RATES.transitionalBenefit }); monthly += DIC_RATES.transitionalBenefit; }
  const rounded = Math.round(monthly * 100) / 100;
  return { monthly: rounded, annual: Math.round(rounded * 12 * 100) / 100, effectiveDate: DIC_RATES.effectiveDate, source: DIC_RATES.source, components };
}
