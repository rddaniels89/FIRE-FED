/* eslint-env node */
import { describe, expect, it } from 'vitest';
import handler, { STATUS, subscribeAuthenticatedUser } from '../subscribe.js';
import { getBeehiivConfig } from '../_client.js';

const API_KEY = 'bh_secret_key_DO_NOT_LEAK';

const config = {
  apiKey: API_KEY,
  publicationId: 'pub_123',
  automationId: 'aut_welcome',
};

const optedInUser = {
  id: 'user-1',
  email: 'Fed.Employee@Example.gov',
  email_confirmed_at: '2026-09-10T12:00:00.000Z',
  user_metadata: {
    newsletter_opt_in: true,
    newsletter_opt_in_at: '2026-09-10T11:59:00.000Z',
    newsletter_opt_in_source: 'firefed_signup',
  },
};

/**
 * A scripted fetch. Each call pops the next response and records the request,
 * so a test can assert both what was sent and in what order.
 */
function fakeFetch(script) {
  const calls = [];
  const queue = [...script];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined });
    const next = queue.shift();
    if (!next) throw new Error(`fakeFetch: no scripted response for ${init?.method ?? 'GET'} ${url}`);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
    };
  };
  return { impl, calls };
}

const captureLog = () => {
  const entries = [];
  return { log: (e) => entries.push(e), entries };
};

describe('gating before any network call', () => {
  it('refuses a user who did not opt in, with no side effects', async () => {
    const { impl, calls } = fakeFetch([]);
    const r = await subscribeAuthenticatedUser({
      user: { ...optedInUser, user_metadata: { newsletter_opt_in: false } },
      config,
      fetchImpl: impl,
    });
    expect(r.httpStatus).toBe(403);
    expect(r.body).toEqual({ ok: false, status: STATUS.NOT_OPTED_IN });
    expect(calls).toHaveLength(0);
  });

  it('treats a missing consent record as not opted in', async () => {
    const { impl, calls } = fakeFetch([]);
    const r = await subscribeAuthenticatedUser({ user: { ...optedInUser, user_metadata: {} }, config, fetchImpl: impl });
    expect(r.body.status).toBe(STATUS.NOT_OPTED_IN);
    expect(calls).toHaveLength(0);
  });

  it('refuses an unconfirmed email even with consent', async () => {
    const { impl, calls } = fakeFetch([]);
    const r = await subscribeAuthenticatedUser({
      user: { ...optedInUser, email_confirmed_at: null },
      config,
      fetchImpl: impl,
    });
    expect(r.httpStatus).toBe(403);
    expect(r.body.status).toBe(STATUS.EMAIL_NOT_CONFIRMED);
    expect(calls).toHaveLength(0);
  });
});

describe('a new subscriber', () => {
  it('looks up, then creates with welcome email and double opt-in off', async () => {
    const { impl, calls } = fakeFetch([
      { status: 404, body: { message: 'Not found' } },
      { status: 201, body: { data: { id: 'sub_new', email: 'fed.employee@example.gov' } } },
    ]);
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });

    expect(r).toEqual({ httpStatus: 200, body: { ok: true, status: STATUS.SUBSCRIBED } });
    expect(calls).toHaveLength(2);

    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://api.beehiiv.com/v2/publications/pub_123/subscriptions/by_email/fed.employee%40example.gov'
    );

    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe('https://api.beehiiv.com/v2/publications/pub_123/subscriptions');
    expect(calls[1].body).toEqual({
      email: 'fed.employee@example.gov',
      send_welcome_email: false,
      double_opt_override: 'off',
      automation_ids: ['aut_welcome'],
      utm_source: 'firefed',
      utm_medium: 'product',
      utm_campaign: 'account_signup',
    });
  });

  // The browser has no say in which address gets subscribed.
  it('uses the authenticated email, normalised, and nothing from a request body', async () => {
    const { impl, calls } = fakeFetch([{ status: 404 }, { status: 201, body: { data: {} } }]);
    await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });
    expect(calls[1].body.email).toBe('fed.employee@example.gov');
  });
});

describe('an existing subscriber', () => {
  it('is enrolled in the automation rather than created again', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: { data: { id: 'sub_existing', status: 'active' } } },
      { status: 201, body: { data: { id: 'journey_1' } } },
    ]);
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });

    expect(r.body).toEqual({ ok: true, status: STATUS.EXISTING_ENROLLED });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe(
      'https://api.beehiiv.com/v2/publications/pub_123/automations/aut_welcome/journeys'
    );
    expect(calls[1].body).toEqual({ email: 'fed.employee@example.gov' });
    // Never a second create.
    expect(calls.some((c) => c.url.endsWith('/subscriptions') && c.method === 'POST')).toBe(false);
  });

  it('reports already_enrolled when Beehiiv declines the duplicate journey', async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { data: { id: 'sub_existing' } } },
      { status: 400, body: { message: 'Subscription is already in this automation journey' } },
    ]);
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });
    expect(r).toEqual({ httpStatus: 200, body: { ok: true, status: STATUS.ALREADY_ENROLLED } });
  });

  it('treats a 409 the same way', async () => {
    const { impl } = fakeFetch([{ status: 200, body: { data: {} } }, { status: 409, body: {} }]);
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });
    expect(r.body.status).toBe(STATUS.ALREADY_ENROLLED);
  });
});

describe('idempotency', () => {
  it('creates once across two calls and never errors on the second', async () => {
    const { impl, calls } = fakeFetch([
      // first call: new
      { status: 404 },
      { status: 201, body: { data: { id: 'sub_1' } } },
      // second call: exists, already in journey
      { status: 200, body: { data: { id: 'sub_1' } } },
      { status: 400, body: { message: 'already in journey' } },
    ]);
    const first = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });
    const second = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });

    expect(first.body.status).toBe(STATUS.SUBSCRIBED);
    expect(second.body.status).toBe(STATUS.ALREADY_ENROLLED);
    const creates = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/subscriptions'));
    expect(creates).toHaveLength(1);
  });
});

describe('provider failure', () => {
  it('returns 502 with a plain status and logs the step, status and message', async () => {
    const { impl } = fakeFetch([{ status: 503, body: { message: 'Beehiiv is down' } }]);
    const { log, entries } = captureLog();
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl, log });

    expect(r).toEqual({ httpStatus: 502, body: { ok: false, status: STATUS.PROVIDER_UNAVAILABLE } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ step: 'lookup', status: 503, message: 'Beehiiv is down', userId: 'user-1' });
  });

  it('never puts the API key in a log entry or the response', async () => {
    const { impl } = fakeFetch([{ status: 500, body: { message: 'boom' } }]);
    const { log, entries } = captureLog();
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl, log });
    const everything = JSON.stringify({ entries, r });
    expect(everything).not.toContain(API_KEY);
  });

  it('propagates a create failure the same way', async () => {
    const { impl } = fakeFetch([{ status: 404 }, { status: 422, body: { errors: [{ message: 'invalid email' }] } }]);
    const { log, entries } = captureLog();
    const r = await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl, log });
    expect(r.httpStatus).toBe(502);
    expect(entries[0]).toMatchObject({ step: 'create', status: 422, message: 'invalid email' });
  });
});

describe('the key only ever travels as a bearer header', () => {
  it('sets Authorization on every request', async () => {
    const { impl, calls } = fakeFetch([{ status: 404 }, { status: 201, body: { data: {} } }]);
    await subscribeAuthenticatedUser({ user: optedInUser, config, fetchImpl: impl });
    for (const c of calls) expect(c.headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });
});

describe('configuration', () => {
  it('reads the three settings', () => {
    const c = getBeehiivConfig({ BEEHIIV_API_KEY: 'k', BEEHIIV_PUBLICATION_ID: 'p', BEEHIIV_AUTOMATION_ID: 'a' });
    expect(c).toEqual({ apiKey: 'k', publicationId: 'p', automationId: 'a' });
  });

  it('fails loudly when a setting is missing', () => {
    expect(() => getBeehiivConfig({ BEEHIIV_API_KEY: 'k' })).toThrow(/BEEHIIV_PUBLICATION_ID/);
  });
});

describe('the HTTP handler', () => {
  const fakeRes = () => {
    const res = { headers: {}, statusCode: 0, body: '' };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = (s) => { res.body = s; };
    return res;
  };

  it('is POST-only', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('rejects a request with no bearer token before touching Beehiiv', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Missing Authorization header' });
  });
});
