import { CALCULATION_PATHS, SYSTEM_CONFIRMATION } from '../../lib/military/retirement/system';
import { INPUT_PROVENANCE } from '../../lib/military/status';

const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number.parseFloat(v) || 0);
const orNull = (v) => (v === '' || v === null || v === undefined ? null : v);
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? v : null);

/**
 * Turns the Military Retirement Calculator form into engine inputs. Pure, so
 * the test can exercise it and the component stays a component (fast refresh).
 *
 * Quick mode never claims official provenance and never confirms the retired
 * grade: a first-visit estimate is an estimate whatever the boxes say.
 */
export function formToInputs(form) {
  const isReserve = form.path === CALCULATION_PATHS.RESERVE_NONREGULAR;
  const provenanceForMode = form.mode === 'quick' ? INPUT_PROVENANCE.USER_ESTIMATE : form.serviceProvenance;
  return {
    path: form.path === 'unsure' ? null : form.path || null,
    system: form.system || null,
    systemConfirmation: form.system ? form.systemConfirmation : SYSTEM_CONFIRMATION.UNKNOWN,
    diems: dateOrNull(form.diems),
    cbsElected: form.cbsElected,
    brsOptIn: form.brsOptIn,
    retirementDate: dateOrNull(form.retirementDate),
    payEntryBaseDate: dateOrNull(form.payEntryBaseDate),
    ageAtRetirement: orNull(form.ageAtRetirement) === null ? null : num(form.ageAtRetirement),
    creditableService: isReserve ? null : { years: num(form.serviceYears), months: num(form.serviceMonths), days: num(form.serviceDays), provenance: provenanceForMode },
    gradePeriods: form.gradePeriods.filter((g) => g.grade).map((g) => ({ grade: g.grade, startDate: dateOrNull(g.startDate), endDate: dateOrNull(g.endDate) })),
    retiredGradeConfirmed: form.mode !== 'quick' && form.retiredGradeConfirmed,
    assumptions: { inflation: num(form.inflationPct) / 100, basicPayGrowth: num(form.basicPayGrowthPct) / 100 },
    officialEstimate: form.mode === 'reconcile' && num(form.officialMonthlyGross) > 0 ? { monthlyGross: num(form.officialMonthlyGross), asOfDate: dateOrNull(form.officialAsOfDate) } : null,
    medical:
      form.path === CALCULATION_PATHS.MEDICAL
        ? {
            disposition: form.medical?.disposition ?? 'unknown',
            dodDisabilityPercent: orNull(form.medical?.dodDisabilityPercent) === null ? null : num(form.medical.dodDisabilityPercent),
            vaRating: orNull(form.medical?.vaRating) === null ? null : num(form.medical.vaRating),
            tdrlPlacementDate: dateOrNull(form.medical?.tdrlPlacementDate),
            combatRelated: form.medical?.combatRelated === 'yes' ? true : form.medical?.combatRelated === 'no' ? false : null,
            monthlyBasicPay: orNull(form.medical?.monthlyBasicPay) === null ? null : num(form.medical.monthlyBasicPay),
            provenance: form.mode === 'quick' ? INPUT_PROVENANCE.USER_ESTIMATE : form.medical?.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE,
          }
        : null,
    tera:
      form.path === CALCULATION_PATHS.TERA
        ? { authorityName: orNull(form.tera?.authorityName), approvalDate: dateOrNull(form.tera?.approvalDate), provenance: form.mode === 'quick' ? INPUT_PROVENANCE.USER_ESTIMATE : form.tera?.provenance ?? INPUT_PROVENANCE.USER_ESTIMATE }
        : null,
    reserve: isReserve
      ? {
          officialTotalPoints: orNull(form.reserve.officialTotalPoints) === null ? null : num(form.reserve.officialTotalPoints),
          officialQualifyingYears: orNull(form.reserve.officialQualifyingYears) === null ? null : num(form.reserve.officialQualifyingYears),
          pointsProvenance: form.mode === 'quick' ? INPUT_PROVENANCE.USER_ESTIMATE : form.reserve.pointsProvenance,
          birthDate: dateOrNull(form.reserve.birthDate),
          retiredReserveStatus: form.reserve.retiredReserveStatus,
          separationDate: dateOrNull(form.reserve.separationDate) ?? dateOrNull(form.retirementDate),
          officialEligibilityDate: dateOrNull(form.reserve.officialEligibilityDate),
          reducedAgePeriods: form.reserve.reducedAgePeriods.map((p) => ({ startDate: dateOrNull(p.startDate), endDate: dateOrNull(p.endDate), authority: p.authority, verified: p.verified })),
          retirementYears: form.reserve.retirementYears.map((r) => ({
            id: r.id,
            retirementYearEnd: dateOrNull(r.retirementYearEnd),
            activePoints: num(r.activePoints),
            inactivePoints: num(r.inactivePoints),
            membershipPoints: num(r.membershipPoints),
            officialTotal: orNull(r.officialTotal) === null ? null : num(r.officialTotal),
            provenance: form.reserve.pointsProvenance,
          })),
        }
      : null,
  };
}

