/**
 * Saving a retirement calculation into the military block and connecting it
 * to the household plan as an income stream that references the calculation
 * rather than copying its number (spec §20.1, §20.16).
 *
 * A saved calculation is immutable: recalculating creates a successor linked
 * by `supersedes`, and the scenario points at its current one. The linked
 * income stream carries `sourceCalculationId`; the stream resolver reads the
 * projected monthly amount from the calculation, so there is no second
 * editable copy that can drift. Recording a manual retired-pay stream beside
 * a linked one raises MRT_DUPLICATE_PLAN_INCOME.
 */

import { createIncomeStream, STREAM_TYPES } from '../incomeStreams';
import { SERVICE_OWNERS } from '../servicePeriods';
import { CALCULATION_PATHS } from './system';

let counter = 0;
const nextId = (prefix) => {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
};

/** The subset of a result that is stored: enough to project and to explain, never the whole trace twice. */
export function snapshotCalculation(result, { inputs, name = null, createdAt = new Date().toISOString(), supersedes = null } = {}) {
  return {
    id: nextId('calc'),
    createdAt,
    supersedes,
    engineVersion: result.engineVersion,
    rulesVersion: result.rulesVersion,
    inputHash: result.inputHash,
    status: result.status,
    path: inputs?.path ?? result.inputs?.path ?? null,
    system: result.system ?? null,
    systemLabel: result.systemLabel ?? null,
    retiredGradeLabel: result.retiredGradeLabel ?? null,
    grossMonthly: result.grossMonthly ?? null,
    projectedMonthly: result.projectedMonthly ?? null,
    retiredPayStartDate: result.retiredPayStartDate ?? result.inputs?.retirementDate ?? null,
    payBase: result.payBase ? { method: result.payBase.method, monthly: result.payBase.monthly, reliableMonths: result.payBase.reliableMonths ?? null } : null,
    multiplier: result.multiplier ? { multiplier: result.multiplier.multiplier, serviceYears: result.multiplier.serviceYears } : null,
    reserve: result.reserve ? { totalPoints: result.reserve.points.totalPoints, qualifyingYears: result.reserve.points.qualifyingYears, retiredPayAge: result.reserve.age.age, retiredPayDate: result.reserve.age.date } : null,
    issues: (result.issues ?? []).map((i) => ({ code: i.code, severity: i.severity })),
    steps: result.steps ?? [],
    inputs: inputs ?? result.inputs ?? null,
    name,
  };
}

/**
 * Appends a saved calculation to a military block and links (or relinks) the
 * income stream that mirrors it. Returns the new block and the ids.
 *
 *   military     the scenario's military block
 *   result       from calculateMilitaryRetiredPay
 *   ownerId      whose pension it is
 *   scenarioId   an existing saved retirement scenario to add a version to
 */
export function saveRetirementCalculation(military, { result, inputs, name = 'Military retired pay', ownerId = SERVICE_OWNERS.PRIMARY, scenarioId = null } = {}) {
  const scenarios = Array.isArray(military?.retirementScenarios) ? military.retirementScenarios : [];
  const existing = scenarioId ? scenarios.find((s) => s.id === scenarioId) : null;
  const snapshot = snapshotCalculation(result, { inputs, name, supersedes: existing?.currentCalculationId ?? null });

  const scenario = existing
    ? { ...existing, name: existing.name ?? name, currentCalculationId: snapshot.id, calculations: [...(existing.calculations ?? []), snapshot], updatedAt: snapshot.createdAt }
    : { id: nextId('mrs'), name, ownerId, createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt, currentCalculationId: snapshot.id, calculations: [snapshot] };

  const nextScenarios = existing ? scenarios.map((s) => (s.id === existing.id ? scenario : s)) : [...scenarios, scenario];

  // The linked stream: one per saved scenario, referencing the current calculation.
  const streams = Array.isArray(military?.incomeStreams) ? military.incomeStreams : [];
  const streamType = (inputs?.path ?? result.inputs?.path) === CALCULATION_PATHS.RESERVE_NONREGULAR ? STREAM_TYPES.RESERVE_RETIRED_PAY : STREAM_TYPES.LONGEVITY_RETIRED_PAY;
  const linked = streams.find((s) => s.sourceScenarioId === scenario.id);
  const streamPatch = {
    type: streamType,
    ownerId,
    sourceScenarioId: scenario.id,
    sourceCalculationId: snapshot.id,
    amountStatus: 'calculated',
    inputProvenance: 'firefed_calculated',
    startDate: snapshot.retiredPayStartDate,
    grossAmount: null,
    frequency: 'monthly',
  };
  const nextStreams = linked
    ? streams.map((s) => (s.id === linked.id ? { ...s, ...streamPatch } : s))
    : [...streams, createIncomeStream({ ...streamPatch, label: streamType === STREAM_TYPES.RESERVE_RETIRED_PAY ? 'Reserve retired pay (linked calculation)' : 'Military retired pay (linked calculation)' })];

  return {
    military: { ...military, retirementScenarios: nextScenarios, incomeStreams: nextStreams },
    scenarioId: scenario.id,
    calculationId: snapshot.id,
    streamId: linked?.id ?? nextStreams[nextStreams.length - 1].id,
  };
}

/** The current calculation a stream is linked to, or null. */
export function linkedCalculationFor(military, stream) {
  if (!stream?.sourceCalculationId) return null;
  for (const s of military?.retirementScenarios ?? []) {
    const c = (s.calculations ?? []).find((x) => x.id === stream.sourceCalculationId);
    if (c) return { scenario: s, calculation: c, isCurrent: s.currentCalculationId === c.id };
  }
  return null;
}
