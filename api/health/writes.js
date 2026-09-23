/* eslint-env node */
import { getSupabaseAdmin, sendJson } from '../stripe/_shared.js';
import { reportServerError } from '../_lib/observability.js';
import { toScenarioRow } from '../../src/lib/scenarios/storage.js';

/**
 * GET /api/health/writes — the dead man's switch for scenario writes.
 *
 * Run daily by Vercel Cron. It answers two questions, in order of how much
 * they can be trusted:
 *
 *  1. Can the app's row shape be written to the `scenarios` table right now?
 *     A canary row is inserted with the same mapping the client uses, read
 *     back, and deleted. This is the exact failure that went unnoticed for
 *     eight months (a column the client wrote that the table did not have),
 *     and it is meaningful on day one, with zero users.
 *
 *  2. Has any real write landed recently? Only alerts when
 *     WRITE_HEALTH_MAX_AGE_HOURS is set, because with no traffic "no writes in
 *     24h" is the expected state, and an alert that fires every day is one that
 *     gets muted.
 *
 * Outcomes go three places: the JSON response (and a 503 when unhealthy, so the
 * cron run itself shows as failed in Vercel), a Healthchecks-style ping URL if
 * one is configured, and Sentry when unhealthy. The ping is the true dead man's
 * switch: if this function stops running at all, the ping stops, and the
 * checker notices the silence.
 */

export const CANARY_SCENARIO_NAME = '__firefed_write_canary__';

const HOUR_MS = 60 * 60 * 1000;

/** The scenario the canary writes: every column, plus one extension block. */
function canaryScenario(now) {
  return {
    name: CANARY_SCENARIO_NAME,
    tsp: { canary: true },
    fers: { canary: true },
    fire: { canary: true },
    summary: { canary: true, writtenAt: now.toISOString() },
    profile: { canary: true },
  };
}

async function findLastWrite(supabase) {
  const { data, error } = await supabase
    .from('scenarios')
    .select('updated_at')
    .neq('scenario_name', CANARY_SCENARIO_NAME)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`last-write query failed: ${error.message}`);
  const at = data?.[0]?.updated_at ?? null;
  return at ? new Date(at) : null;
}

/**
 * Insert → read back → delete, with the delete in `finally` so a failed
 * assertion never leaves a canary row in someone's scenario list.
 */
async function runCanary({ supabase, userId, now }) {
  const row = { user_id: userId, ...toScenarioRow(canaryScenario(now)) };
  let insertedId = null;
  try {
    const { data, error } = await supabase.from('scenarios').insert([row]).select().single();
    if (error) return { ok: false, step: 'insert', error: error.message };
    insertedId = data?.id ?? null;
    if (!insertedId) return { ok: false, step: 'insert', error: 'no id returned' };

    // The column has to exist *and* hold what was sent; a table that accepts
    // the write but drops the JSON is the same bug wearing a different hat.
    const expected = JSON.stringify(row.summary_data);
    const actual = JSON.stringify(data.summary_data ?? null);
    if (expected !== actual) {
      return { ok: false, step: 'readback', error: 'summary_data did not round-trip' };
    }
    return { ok: true, step: 'done', error: null };
  } catch (error) {
    return { ok: false, step: 'exception', error: error?.message ?? String(error) };
  } finally {
    if (insertedId) {
      const { error } = await supabase.from('scenarios').delete().eq('id', insertedId);
      if (error) {
        // Not a health failure, but it must not be silent either.
        await reportServerError(new Error(`canary row ${insertedId} could not be deleted: ${error.message}`), {
          tags: { check: 'writes', step: 'cleanup' },
        });
      }
    }
  }
}

/**
 * The whole check, given clients. Exported so it can be driven with a stub.
 */
export async function checkWriteHealth({ supabase, now = new Date(), maxAgeHours = null, canaryUserId = null }) {
  const problems = [];

  let lastWriteAt = null;
  let hoursSinceLastWrite = null;
  try {
    lastWriteAt = await findLastWrite(supabase);
    hoursSinceLastWrite = lastWriteAt ? (now.getTime() - lastWriteAt.getTime()) / HOUR_MS : null;
  } catch (error) {
    problems.push(`last-write: ${error.message}`);
  }

  const stale =
    maxAgeHours != null && (hoursSinceLastWrite == null || hoursSinceLastWrite > maxAgeHours);
  if (stale) {
    problems.push(
      lastWriteAt
        ? `no scenario write in ${hoursSinceLastWrite.toFixed(1)}h (limit ${maxAgeHours}h)`
        : `no scenario write on record (limit ${maxAgeHours}h)`
    );
  }

  let canary = { ok: null, step: 'skipped', error: null };
  if (canaryUserId) {
    canary = await runCanary({ supabase, userId: canaryUserId, now });
    if (!canary.ok) problems.push(`canary ${canary.step}: ${canary.error}`);
  }

  return {
    healthy: problems.length === 0,
    checkedAt: now.toISOString(),
    lastWriteAt: lastWriteAt ? lastWriteAt.toISOString() : null,
    hoursSinceLastWrite: hoursSinceLastWrite == null ? null : Number(hoursSinceLastWrite.toFixed(2)),
    maxAgeHours,
    stale,
    canary,
    problems,
  };
}

/**
 * Healthchecks.io-style ping: a plain GET says "alive and well"; `/fail`
 * says "alive and broken". Silence says "dead", and that is the checker's job
 * to notice. Never throws.
 */
export async function pingHealthcheck({ url, result, fetchImpl = fetch }) {
  if (!url) return false;
  try {
    const target = result.healthy ? url : `${url.replace(/\/$/, '')}/fail`;
    await fetchImpl(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problems: result.problems, lastWriteAt: result.lastWriteAt, canary: result.canary }),
    });
    return true;
  } catch {
    return false;
  }
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const header = req.headers.authorization || req.headers.Authorization || '';
  return header === `Bearer ${secret}`
    ? { ok: true }
    : { ok: false, status: 401, error: 'Unauthorized' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const auth = isAuthorized(req);
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });

  const maxAgeRaw = process.env.WRITE_HEALTH_MAX_AGE_HOURS;
  const maxAgeHours = maxAgeRaw ? Number(maxAgeRaw) : null;

  let result;
  try {
    result = await checkWriteHealth({
      supabase: getSupabaseAdmin(),
      maxAgeHours: Number.isFinite(maxAgeHours) ? maxAgeHours : null,
      canaryUserId: process.env.WRITE_CANARY_USER_ID || null,
    });
  } catch (error) {
    result = {
      healthy: false,
      checkedAt: new Date().toISOString(),
      problems: [`check crashed: ${error?.message ?? String(error)}`],
      canary: { ok: null, step: 'not run', error: null },
      lastWriteAt: null,
    };
  }

  await pingHealthcheck({ url: process.env.HEALTHCHECK_WRITES_PING_URL, result });

  if (!result.healthy) {
    console.error('[health/writes] UNHEALTHY', result.problems);
    await reportServerError(new Error(`Scenario writes unhealthy: ${result.problems.join('; ')}`), {
      tags: { check: 'writes' },
      extra: result,
    });
  }

  return sendJson(res, result.healthy ? 200 : 503, { ok: result.healthy, ...result });
}
