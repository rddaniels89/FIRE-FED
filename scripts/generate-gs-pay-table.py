import json, os, re
from decimal import Decimal, ROUND_HALF_UP

SP = os.path.dirname(os.path.abspath(__file__))
OUT = r"C:\Users\rddan\fed-fire\src\lib\calculations\gsPay.js"

base = json.load(open(os.path.join(SP, "gs_base_2026.json")))


def parse(path):
    x = open(path, encoding="utf-8-sig").read()
    d = re.search(r"<Description>(.*?)</Description>", x, re.S).group(1)
    pct = re.search(r"Locality Payment of ([\d.]+)%", d)
    # Alaska and Hawaii are written as "State of X" rather than
    # "For the Locality Pay Area of X"; dropping them loses two real areas.
    area = re.search(r"For the Locality Pay Area of (.*)", d) or re.search(r"^(State of .*)$", d, re.M)
    grades = re.findall(r"<Grade>(.*?)</Grade>", x, re.S)
    t = {}
    for gi, g in enumerate(grades, start=1):
        vals = sorted(
            (
                int(re.search(r"<Value>(\d+)</Value>", st).group(1)),
                int(re.search(r"<Annual>(\d+)</Annual>", st).group(1)),
            )
            for st in re.findall(r"<Step>(.*?)</Step>", g, re.S)
        )
        t[gi] = [a for _, a in vals]
    if not pct or not area:
        return None
    return {"pct": Decimal(pct.group(1)), "area": area.group(1).strip(), "table": t}


CAP = 197200
locs, checked, mismatches = [], 0, 0
for fn in sorted(os.listdir(os.path.join(SP, "loc"))):
    p = parse(os.path.join(SP, "loc", fn))
    if not p:
        continue
    mult = Decimal(1) + p["pct"] / Decimal(100)
    for g in range(1, 16):
        for s in range(10):
            model = int((Decimal(base[str(g)][s]) * mult).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            model = min(model, CAP)
            checked += 1
            if model != p["table"][g][s]:
                mismatches += 1
    locs.append({"code": fn[:-4], "pct": float(p["pct"]), "area": p["area"]})

print(f"validated {checked} cells across {len(locs)} localities; mismatches: {mismatches}")
assert mismatches == 0, "model does not reproduce OPM tables"

locs.sort(key=lambda r: (r["code"] != "RUS", r["area"]))

rows = "\n".join(
    "  %2d: [%s]," % (g, ", ".join(str(v) for v in base[str(g)])) for g in range(1, 16)
)
areas = "\n".join(
    "  { code: %r, percent: %s, name: %r }," % (r["code"], r["pct"], r["area"]) for r in locs
)

src = f'''/**
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
 * That formula was validated against all {checked:,} published cells across every one
 * of the {len(locs)} locality tables and reproduces each exactly. The cap is the only
 * thing that ever breaks the multiplication, and it bites hard: a GS-15 step 10
 * in Washington is held about $17,000 below what the percentage alone implies.
 *
 * Regenerate each January from
 * https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/salary-tables/xml/2026/
 */

export const GS_PAY_TABLE_YEAR = 2026;

/** Level IV of the Executive Schedule. Locality pay cannot exceed it. */
export const EXECUTIVE_SCHEDULE_LEVEL_IV_CAP = {CAP};

/** Base annual rates, grade to steps 1 through 10. */
export const GS_BASE_TABLE = Object.freeze({{
{rows}
}});

/** Locality areas with OPM's stated payment percentage. */
export const LOCALITY_AREAS = Object.freeze([
{areas}
]);

export const DEFAULT_LOCALITY_CODE = 'RUS';

const toInt = (v) => {{
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}};

export function getLocality(code) {{
  return LOCALITY_AREAS.find((l) => l.code === code) ?? null;
}}

/** Base rate for a grade and step, before locality. */
export function getGsBasePay({{ grade, step }}) {{
  const g = toInt(grade);
  const s = toInt(step);
  if (!GS_BASE_TABLE[g] || s < 1 || s > 10) return null;
  return GS_BASE_TABLE[g][s - 1];
}}

/**
 * Locality-adjusted salary, capped as OPM caps it.
 *
 * `wasCapped` matters. Someone senior in an expensive area is not paid what the
 * locality percentage implies, and a high-3 built from the uncapped figure would
 * overstate their pension for the rest of their life.
 */
export function calculateGsSalary({{ grade, step, localityCode = DEFAULT_LOCALITY_CODE }}) {{
  const basePay = getGsBasePay({{ grade, step }});
  if (basePay === null) return null;

  const locality = getLocality(localityCode) ?? getLocality(DEFAULT_LOCALITY_CODE);
  const uncapped = Math.round(basePay * (1 + locality.percent / 100));
  const salary = Math.min(uncapped, EXECUTIVE_SCHEDULE_LEVEL_IV_CAP);

  return {{
    grade: toInt(grade),
    step: toInt(step),
    basePay,
    locality: {{ code: locality.code, name: locality.name, percent: locality.percent }},
    localityAdjustment: salary - basePay,
    salary,
    wasCapped: salary < uncapped,
    cappedAt: EXECUTIVE_SCHEDULE_LEVEL_IV_CAP,
    year: GS_PAY_TABLE_YEAR,
  }};
}}

/**
 * A high-3 estimate from a current grade and step.
 *
 * A real high-3 averages the highest three consecutive years of basic pay, which
 * depends on a step history this app does not hold. Holding the current rate flat
 * is the honest simplification: it is exactly right for someone who has been at
 * this step three years, and understates rather than overstates for anyone still
 * climbing.
 */
export function estimateHigh3FromGrade({{ grade, step, localityCode = DEFAULT_LOCALITY_CODE }}) {{
  return calculateGsSalary({{ grade, step, localityCode }})?.salary ?? null;
}}
'''

open(OUT, "w", encoding="utf-8").write(src)
print("wrote", OUT, len(src), "chars")
