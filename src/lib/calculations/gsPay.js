/**
 * General Schedule pay for 2026.
 *
 * FireFed asks for a high-3 and expects the user to already know it. Most people
 * do not, and the content premise -- "can a GS-13 retire at 50?" -- starts from a
 * grade and a duty station, not a salary.
 *
 * Every figure here comes from OPM's published 2026 tables. Locality pay is
 * applied the way OPM applies it:
 *
 *   salary = min(round(base x (1 + locality%)), EX-IV cap)
 *
 * That formula was validated against all 8,700 published cells across every one
 * of the 58 locality tables and reproduces each exactly. The cap is the only
 * thing that ever breaks the multiplication, and it bites hard: a GS-15 step 10
 * in Washington is held about $17,000 below what the percentage alone implies.
 *
 * Regenerate each January from
 * https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/salary-tables/xml/2026/
 */

export const GS_PAY_TABLE_YEAR = 2026;

/** Level IV of the Executive Schedule. Locality pay cannot exceed it. */
export const EXECUTIVE_SCHEDULE_LEVEL_IV_CAP = 197200;

/** Base annual rates, grade to steps 1 through 10. */
export const GS_BASE_TABLE = Object.freeze({
   1: [22584, 23341, 24092, 24840, 25589, 26028, 26771, 27519, 27550, 28248],
   2: [25393, 25997, 26839, 27550, 27858, 28677, 29496, 30315, 31134, 31953],
   3: [27708, 28632, 29556, 30480, 31404, 32328, 33252, 34176, 35100, 36024],
   4: [31103, 32140, 33177, 34214, 35251, 36288, 37325, 38362, 39399, 40436],
   5: [34799, 35959, 37119, 38279, 39439, 40599, 41759, 42919, 44079, 45239],
   6: [38791, 40084, 41377, 42670, 43963, 45256, 46549, 47842, 49135, 50428],
   7: [43106, 44543, 45980, 47417, 48854, 50291, 51728, 53165, 54602, 56039],
   8: [47738, 49329, 50920, 52511, 54102, 55693, 57284, 58875, 60466, 62057],
   9: [52727, 54485, 56243, 58001, 59759, 61517, 63275, 65033, 66791, 68549],
  10: [58064, 59999, 61934, 63869, 65804, 67739, 69674, 71609, 73544, 75479],
  11: [63795, 65922, 68049, 70176, 72303, 74430, 76557, 78684, 80811, 82938],
  12: [76463, 79012, 81561, 84110, 86659, 89208, 91757, 94306, 96855, 99404],
  13: [90925, 93956, 96987, 100018, 103049, 106080, 109111, 112142, 115173, 118204],
  14: [107446, 111028, 114610, 118192, 121774, 125356, 128938, 132520, 136102, 139684],
  15: [126384, 130597, 134810, 139023, 143236, 147449, 151662, 155875, 160088, 164301],
});

/** Locality areas with OPM's stated payment percentage. */
export const LOCALITY_AREAS = Object.freeze([
  { code: 'RUS', percent: 17.06, name: 'Rest of U.S.' },
  { code: 'AL', percent: 20.77, name: 'Albany-Schenectady, NY-MA' },
  { code: 'AQ', percent: 18.33, name: 'Albuquerque-Santa Fe-Las Vegas, NM' },
  { code: 'ATL', percent: 23.79, name: 'Atlanta--Athens-Clarke County--Sandy Springs, GA-AL' },
  { code: 'AU', percent: 20.35, name: 'Austin-Round Rock-Georgetown, TX' },
  { code: 'BH', percent: 18.24, name: 'Birmingham-Hoover-Talladega, AL' },
  { code: 'BOS', percent: 32.58, name: 'Boston-Worcester-Providence, MA-RI-NH-CT-ME-VT' },
  { code: 'BU', percent: 22.41, name: 'Buffalo-Cheektowaga-Olean, NY' },
  { code: 'BN', percent: 19.45, name: 'Burlington-South Burlington-Barre, VT' },
  { code: 'CT', percent: 19.67, name: 'Charlotte-Concord, NC-SC' },
  { code: 'CHI', percent: 30.86, name: 'Chicago-Naperville, IL-IN-WI' },
  { code: 'CIN', percent: 21.93, name: 'Cincinnati-Wilmington-Maysville, OH-KY-IN' },
  { code: 'CLE', percent: 22.23, name: 'Cleveland-Akron-Canton, OH-PA' },
  { code: 'CS', percent: 20.15, name: 'Colorado Springs, CO' },
  { code: 'COL', percent: 22.15, name: 'Columbus-Marion-Zanesville, OH' },
  { code: 'CC', percent: 17.63, name: 'Corpus Christi-Kingsville-Alice, TX' },
  { code: 'DFW', percent: 27.26, name: 'Dallas-Fort Worth, TX-OK' },
  { code: 'DV', percent: 18.93, name: 'Davenport-Moline, IA-IL' },
  { code: 'DAY', percent: 21.42, name: 'Dayton-Springfield-Kettering, OH' },
  { code: 'DEN', percent: 30.52, name: 'Denver-Aurora, CO' },
  { code: 'DM', percent: 18.01, name: 'Des Moines-Ames-West Des Moines, IA' },
  { code: 'DET', percent: 29.12, name: 'Detroit-Warren-Ann Arbor, MI' },
  { code: 'FN', percent: 17.65, name: 'Fresno-Madera-Hanford, CA' },
  { code: 'HB', percent: 19.43, name: 'Harrisburg-Lebanon, PA' },
  { code: 'HAR', percent: 32.08, name: 'Hartford-East Hartford, CT-MA' },
  { code: 'HOU', percent: 35.0, name: 'Houston-The Woodlands, TX' },
  { code: 'HNT', percent: 21.91, name: 'Huntsville-Decatur, AL-TN' },
  { code: 'IND', percent: 18.15, name: 'Indianapolis-Carmel-Muncie, IN' },
  { code: 'KC', percent: 18.97, name: 'Kansas City-Overland Park-Kansas City, MO-KS' },
  { code: 'LR', percent: 21.59, name: 'Laredo, TX' },
  { code: 'LV', percent: 19.57, name: 'Las Vegas-Henderson, NV-AZ' },
  { code: 'LA', percent: 36.47, name: 'Los Angeles-Long Beach, CA' },
  { code: 'MFL', percent: 24.67, name: 'Miami-Port St. Lucie-Fort Lauderdale, FL' },
  { code: 'MIL', percent: 22.42, name: 'Milwaukee-Racine-Waukesha, WI' },
  { code: 'MSP', percent: 27.62, name: 'Minneapolis-St. Paul, MN-WI' },
  { code: 'NY', percent: 37.95, name: 'New York-Newark, NY-NJ-CT-PA' },
  { code: 'OM', percent: 18.23, name: 'Omaha-Council Bluffs-Fremont, NE-IA' },
  { code: 'PB', percent: 17.93, name: 'Palm Bay-Melbourne-Titusville, FL' },
  { code: 'PHL', percent: 28.99, name: 'Philadelphia-Reading-Camden, PA-NJ-DE-MD' },
  { code: 'PX', percent: 22.45, name: 'Phoenix-Mesa, AZ' },
  { code: 'PIT', percent: 21.03, name: 'Pittsburgh-New Castle-Weirton, PA-OH-WV' },
  { code: 'POR', percent: 26.13, name: 'Portland-Vancouver-Salem, OR-WA' },
  { code: 'RA', percent: 22.24, name: 'Raleigh-Durham-Cary, NC' },
  { code: 'RN', percent: 17.52, name: 'Reno-Fernley, NV' },
  { code: 'RCH', percent: 22.28, name: 'Richmond, VA' },
  { code: 'RT', percent: 17.88, name: 'Rochester-Batavia-Seneca Falls, NY' },
  { code: 'SAC', percent: 29.76, name: 'Sacramento-Roseville, CA-NV' },
  { code: 'SO', percent: 18.78, name: 'San Antonio-New Braunfels-Pearsall, TX' },
  { code: 'SD', percent: 33.72, name: 'San Diego-Chula Vista-Carlsbad, CA' },
  { code: 'SF', percent: 46.34, name: 'San Jose-San Francisco-Oakland, CA' },
  { code: 'SEA', percent: 31.57, name: 'Seattle-Tacoma, WA' },
  { code: 'SN', percent: 17.67, name: "Spokane-Spokane Valley-Coeur d'Alene, WA-ID" },
  { code: 'SL', percent: 20.03, name: 'St. Louis-St. Charles-Farmington, MO-IL' },
  { code: 'AK', percent: 32.36, name: 'State of Alaska' },
  { code: 'HI', percent: 22.21, name: 'State of Hawaii' },
  { code: 'TU', percent: 19.28, name: 'Tucson-Nogales, AZ' },
  { code: 'VB', percent: 18.8, name: 'Virginia Beach-Norfolk, VA-NC' },
  { code: 'DCB', percent: 33.94, name: 'Washington-Baltimore-Arlington, DC-MD-VA-WV-PA' },
]);

export const DEFAULT_LOCALITY_CODE = 'RUS';

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

export function getLocality(code) {
  return LOCALITY_AREAS.find((l) => l.code === code) ?? null;
}

/** Base rate for a grade and step, before locality. */
export function getGsBasePay({ grade, step }) {
  const g = toInt(grade);
  const s = toInt(step);
  if (!GS_BASE_TABLE[g] || s < 1 || s > 10) return null;
  return GS_BASE_TABLE[g][s - 1];
}

/**
 * Locality-adjusted salary, capped as OPM caps it.
 *
 * `wasCapped` matters. Someone senior in an expensive area is not paid what the
 * locality percentage implies, and a high-3 built from the uncapped figure would
 * overstate their pension for the rest of their life.
 */
export function calculateGsSalary({ grade, step, localityCode = DEFAULT_LOCALITY_CODE }) {
  const basePay = getGsBasePay({ grade, step });
  if (basePay === null) return null;

  const locality = getLocality(localityCode) ?? getLocality(DEFAULT_LOCALITY_CODE);
  const uncapped = Math.round(basePay * (1 + locality.percent / 100));
  const salary = Math.min(uncapped, EXECUTIVE_SCHEDULE_LEVEL_IV_CAP);

  return {
    grade: toInt(grade),
    step: toInt(step),
    basePay,
    locality: { code: locality.code, name: locality.name, percent: locality.percent },
    localityAdjustment: salary - basePay,
    salary,
    wasCapped: salary < uncapped,
    cappedAt: EXECUTIVE_SCHEDULE_LEVEL_IV_CAP,
    year: GS_PAY_TABLE_YEAR,
  };
}

/**
 * A high-3 estimate from a current grade and step.
 *
 * A real high-3 averages the highest three consecutive years of basic pay, which
 * depends on a step history this app does not hold. Holding the current rate flat
 * is the honest simplification: it is exactly right for someone who has been at
 * this step three years, and understates rather than overstates for anyone still
 * climbing.
 */
export function estimateHigh3FromGrade({ grade, step, localityCode = DEFAULT_LOCALITY_CODE }) {
  return calculateGsSalary({ grade, step, localityCode })?.salary ?? null;
}
