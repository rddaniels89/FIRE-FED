/**
 * Longitudinal history for saved scenarios.
 *
 * A plan-over-time view ("your January plan vs. now") can only read history
 * that was already written, and history cannot be backfilled. Capture therefore
 * starts as soon as scenarios are saved, well before any UI reads it.
 *
 * One row per scenario per day: scenario edits autosave continuously, so an
 * unthrottled write would produce an edit log rather than a timeline. The
 * (scenario_id, snapshot_date) unique constraint collapses a day's edits into a
 * single row holding that day's final state.
 */

/** Conflict target for the daily upsert; matches the unique index in SQL. */
export const SNAPSHOT_CONFLICT_TARGET = 'scenario_id,snapshot_date';

/**
 * Dates are bucketed in UTC so a user editing from two timezones still lands on
 * one row per day rather than two adjacent ones.
 */
export function toSnapshotDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Maps an app-shaped scenario onto a snapshot row. Returns null when the
 * scenario has no cloud id yet (local-only scenarios have nothing to reference).
 */
export function buildScenarioSnapshot({ scenario, userId, date } = {}) {
  const scenarioId = scenario?.id;
  if (!scenarioId || !userId) return null;

  const snapshotDate = toSnapshotDate(date ?? new Date());
  if (!snapshotDate) return null;

  return {
    scenario_id: String(scenarioId),
    user_id: userId,
    snapshot_date: snapshotDate,
    scenario_name: scenario.name ?? null,
    tsp_data: scenario.tsp ?? null,
    fers_data: scenario.fers ?? null,
    fire_goal: scenario.fire ?? null,
    summary_data: scenario.summary ?? null,
  };
}
