/**
 * Maps a scenario onto the cloud row shape and back.
 *
 * The `scenarios` table has four JSONB columns from the original design:
 * tsp_data, fers_data, fire_goal, summary_data. Adding a column means every
 * self-hosted project has to run a migration before the next write succeeds,
 * and a missed migration fails silently (see supabase-scenarios-columns-
 * migration.sql for how that went last time). So the newer blocks — profile,
 * household, taxes, healthcare, career — ride inside summary_data under an
 * `extensions` key. This module is the only place that knows.
 */

import { EXTENSION_BLOCKS } from './schema';

export const EXTENSIONS_KEY = 'extensions';

/** App scenario → row columns. */
export function toScenarioRow(scenario) {
  const extensions = {};
  for (const block of EXTENSION_BLOCKS) {
    if (scenario?.[block] !== undefined) extensions[block] = scenario[block];
  }
  const summary = { ...(scenario?.summary ?? {}) };
  delete summary[EXTENSIONS_KEY];

  return {
    scenario_name: scenario?.name ?? null,
    tsp_data: scenario?.tsp ?? null,
    fers_data: scenario?.fers ?? null,
    fire_goal: scenario?.fire ?? null,
    summary_data:
      Object.keys(extensions).length > 0 ? { ...summary, [EXTENSIONS_KEY]: extensions } : summary,
  };
}

/** Row columns → app scenario (un-normalised; callers normalise). */
export function fromScenarioRow(row) {
  const summaryData = row?.summary_data ?? {};
  const { [EXTENSIONS_KEY]: extensions = {}, ...summary } = summaryData;

  const scenario = {
    id: row?.id,
    name: row?.scenario_name,
    createdAt: row?.created_at,
    tsp: row?.tsp_data ?? {},
    fers: row?.fers_data ?? {},
    fire: row?.fire_goal ?? {},
    summary,
  };
  for (const block of EXTENSION_BLOCKS) {
    if (extensions?.[block] !== undefined) scenario[block] = extensions[block];
  }
  if (summaryData?.schemaVersion !== undefined) scenario.schemaVersion = summaryData.schemaVersion;
  return scenario;
}
