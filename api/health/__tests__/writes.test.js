/* eslint-env node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { CANARY_SCENARIO_NAME, checkWriteHealth, pingHealthcheck } from '../writes.js';

vi.mock('../../_lib/observability.js', () => ({ reportServerError: vi.fn(async () => true) }));
vi.mock('../../stripe/_shared.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSupabaseAdmin: () => globalThis.__stubSupabase };
});

import { reportServerError } from '../../_lib/observability.js';

const NOW = new Date('2026-09-11T13:00:00.000Z');
const CANARY_USER = '00000000-0000-0000-0000-00000000c0de';

/**
 * A minimal PostgREST builder stub. Each `from()` call records the operation;
 * the responses are scripted per operation so a test can make the insert fail
 * without touching the select.
 */
function stubSupabase({ lastWriteAt = '2026-09-11T10:00:00.000Z', insert, deleteError = null } = {}) {
  const ops = [];
  const builder = (table) => {
    const state = { table, op: null, row: null, filters: [] };
    const api = {
      select: (cols) => { if (!state.op) state.op = 'select'; state.cols = cols; return api; },
      neq: (col, v) => { state.filters.push(['neq', col, v]); return api; },
      eq: (col, v) => { state.filters.push(['eq', col, v]); return api; },
      order: () => api,
      limit: () => {
        ops.push({ ...state });
        return Promise.resolve({ data: lastWriteAt ? [{ updated_at: lastWriteAt }] : [], error: null });
      },
      insert: (rows) => { state.op = 'insert'; state.row = rows[0]; return api; },
      single: () => {
        ops.push({ ...state });
        if (insert?.error) return Promise.resolve({ data: null, error: { message: insert.error } });
        const returned = insert?.returned ?? { id: 'canary-row-1', ...state.row };
        return Promise.resolve({ data: returned, error: null });
      },
      delete: () => { state.op = 'delete'; return api; },
      then: (resolve) => {
        // Awaiting the delete chain directly.
        ops.push({ ...state });
        return resolve({ error: deleteError ? { message: deleteError } : null });
      },
    };
    return api;
  };
  return { from: builder, ops };
}

const canaryOps = (ops) => ops.filter((o) => o.op === 'insert' || o.op === 'delete');

beforeEach(() => {
  reportServerError.mockClear();
});

describe('checkWriteHealth: the canary', () => {
  it('writes the app row shape for the canary user, reads it back, and deletes it', async () => {
    const supabase = stubSupabase();
    const r = await checkWriteHealth({ supabase, now: NOW, canaryUserId: CANARY_USER });

    expect(r.healthy).toBe(true);
    expect(r.canary).toEqual({ ok: true, step: 'done', error: null });

    const [insert, del] = canaryOps(supabase.ops);
    expect(insert.table).toBe('scenarios');
    expect(insert.row.user_id).toBe(CANARY_USER);
    expect(insert.row.scenario_name).toBe(CANARY_SCENARIO_NAME);
    // Every column the client writes, including the extensions block inside summary_data.
    expect(Object.keys(insert.row).sort()).toEqual(
      ['fers_data', 'fire_goal', 'scenario_name', 'summary_data', 'tsp_data', 'user_id'].sort()
    );
    expect(insert.row.summary_data.extensions.profile).toEqual({ canary: true });

    expect(del.op).toBe('delete');
    expect(del.filters).toEqual([['eq', 'id', 'canary-row-1']]);
  });

  // The failure that went unnoticed for eight months.
  it('fails when the table rejects the row, and has nothing to delete', async () => {
    const supabase = stubSupabase({ insert: { error: "Could not find the 'summary_data' column of 'scenarios'" } });
    const r = await checkWriteHealth({ supabase, now: NOW, canaryUserId: CANARY_USER });

    expect(r.healthy).toBe(false);
    expect(r.canary.ok).toBe(false);
    expect(r.canary.step).toBe('insert');
    expect(r.problems[0]).toMatch(/summary_data/);
    expect(canaryOps(supabase.ops).some((o) => o.op === 'delete')).toBe(false);
  });

  it('fails when the JSON is accepted but does not round-trip, and still deletes', async () => {
    const supabase = stubSupabase({
      insert: { returned: { id: 'canary-row-2', summary_data: null } },
    });
    const r = await checkWriteHealth({ supabase, now: NOW, canaryUserId: CANARY_USER });

    expect(r.healthy).toBe(false);
    expect(r.canary.step).toBe('readback');
    const del = canaryOps(supabase.ops).find((o) => o.op === 'delete');
    expect(del.filters).toEqual([['eq', 'id', 'canary-row-2']]);
  });

  it('reports a cleanup failure to Sentry without failing the check', async () => {
    const supabase = stubSupabase({ deleteError: 'permission denied' });
    const r = await checkWriteHealth({ supabase, now: NOW, canaryUserId: CANARY_USER });
    expect(r.healthy).toBe(true);
    expect(reportServerError).toHaveBeenCalledTimes(1);
    expect(reportServerError.mock.calls[0][0].message).toMatch(/canary-row-1 could not be deleted/);
  });

  it('is skipped, not failed, when no canary user is configured', async () => {
    const supabase = stubSupabase();
    const r = await checkWriteHealth({ supabase, now: NOW });
    expect(r.canary).toEqual({ ok: null, step: 'skipped', error: null });
    expect(canaryOps(supabase.ops)).toHaveLength(0);
    expect(r.healthy).toBe(true);
  });
});

describe('checkWriteHealth: the last real write', () => {
  it('excludes canary rows and reports the age', async () => {
    const supabase = stubSupabase({ lastWriteAt: '2026-09-11T10:00:00.000Z' });
    const r = await checkWriteHealth({ supabase, now: NOW });
    const select = supabase.ops.find((o) => o.op === 'select');
    expect(select.filters).toEqual([['neq', 'scenario_name', CANARY_SCENARIO_NAME]]);
    expect(r.lastWriteAt).toBe('2026-09-11T10:00:00.000Z');
    expect(r.hoursSinceLastWrite).toBe(3);
  });

  it('never goes stale when no limit is set, even with no writes at all', async () => {
    const r = await checkWriteHealth({ supabase: stubSupabase({ lastWriteAt: null }), now: NOW });
    expect(r.stale).toBe(false);
    expect(r.healthy).toBe(true);
    expect(r.hoursSinceLastWrite).toBeNull();
  });

  it('goes stale past the limit', async () => {
    const supabase = stubSupabase({ lastWriteAt: '2026-09-10T12:00:00.000Z' }); // 25h ago
    const r = await checkWriteHealth({ supabase, now: NOW, maxAgeHours: 24 });
    expect(r.stale).toBe(true);
    expect(r.healthy).toBe(false);
    expect(r.problems[0]).toMatch(/no scenario write in 25.0h/);
  });

  it('is fresh within the limit', async () => {
    const supabase = stubSupabase({ lastWriteAt: '2026-09-11T10:00:00.000Z' });
    const r = await checkWriteHealth({ supabase, now: NOW, maxAgeHours: 24 });
    expect(r.stale).toBe(false);
  });

  it('treats an empty table as stale when a limit is set', async () => {
    const r = await checkWriteHealth({ supabase: stubSupabase({ lastWriteAt: null }), now: NOW, maxAgeHours: 24 });
    expect(r.stale).toBe(true);
    expect(r.problems[0]).toMatch(/no scenario write on record/);
  });
});

describe('pingHealthcheck', () => {
  it('pings the plain URL when healthy and /fail when not', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
    await pingHealthcheck({ url: 'https://hc-ping.com/abc/', result: { healthy: true, problems: [] }, fetchImpl });
    await pingHealthcheck({ url: 'https://hc-ping.com/abc/', result: { healthy: false, problems: ['x'] }, fetchImpl });
    expect(calls[0].url).toBe('https://hc-ping.com/abc/');
    expect(calls[1].url).toBe('https://hc-ping.com/abc/fail');
    expect(JSON.parse(calls[1].init.body).problems).toEqual(['x']);
  });

  it('does nothing without a URL and never throws', async () => {
    expect(await pingHealthcheck({ url: '', result: { healthy: true } })).toBe(false);
    const boom = async () => { throw new Error('offline'); };
    expect(await pingHealthcheck({ url: 'https://x', result: { healthy: true }, fetchImpl: boom })).toBe(false);
  });
});

describe('the HTTP handler', () => {
  const fakeRes = () => {
    const res = { headers: {}, statusCode: 0, body: '' };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = (s) => { res.body = s; };
    return res;
  };
  const json = (res) => JSON.parse(res.body);

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('WRITE_CANARY_USER_ID', CANARY_USER);
    vi.stubEnv('WRITE_HEALTH_MAX_AGE_HOURS', '');
    vi.stubEnv('HEALTHCHECK_WRITES_PING_URL', '');
    globalThis.__stubSupabase = stubSupabase();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    delete globalThis.__stubSupabase;
  });

  it('is GET-only', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('refuses without the cron secret', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(globalThis.__stubSupabase.ops).toHaveLength(0);
  });

  it('refuses with a wrong secret', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer nope' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('is a misconfiguration, not an open door, when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = fakeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer ' } }, res);
    expect(res.statusCode).toBe(500);
  });

  it('returns 200 when healthy and reports nothing', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, res);
    expect(res.statusCode).toBe(200);
    expect(json(res).ok).toBe(true);
    expect(json(res).canary.ok).toBe(true);
    expect(reportServerError).not.toHaveBeenCalled();
  });

  it('returns 503 and reports to Sentry when the canary fails', async () => {
    globalThis.__stubSupabase = stubSupabase({ insert: { error: 'column missing' } });
    const res = fakeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, res);
    expect(res.statusCode).toBe(503);
    expect(json(res).ok).toBe(false);
    expect(reportServerError).toHaveBeenCalledTimes(1);
    expect(reportServerError.mock.calls[0][0].message).toMatch(/Scenario writes unhealthy: canary insert: column missing/);
  });
});
