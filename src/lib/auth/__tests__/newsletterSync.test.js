import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NEWSLETTER_SYNC_ENDPOINT,
  newsletterSyncDecision,
  resetNewsletterSyncGuard,
  syncNewsletterSubscription,
} from '../newsletterSync';

const TOKEN = 'eyJ.supabase.access.token';

const optedInConfirmed = {
  id: 'user-1',
  email: 'fed@example.gov',
  email_confirmed_at: '2026-09-10T12:00:00.000Z',
  user_metadata: { newsletter_opt_in: true, newsletter_opt_in_at: '2026-09-10T11:59:00.000Z' },
};

const sessionFor = (user) => ({ access_token: TOKEN, user });

function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  });
  return { impl, calls };
}

const silent = () => {};

beforeEach(() => resetNewsletterSyncGuard());

describe('newsletterSyncDecision', () => {
  it('is not_opted_in when consent is absent or false', () => {
    expect(newsletterSyncDecision({ ...optedInConfirmed, user_metadata: {} })).toBe('not_opted_in');
    expect(newsletterSyncDecision({ ...optedInConfirmed, user_metadata: { newsletter_opt_in: false } })).toBe('not_opted_in');
    expect(newsletterSyncDecision(null)).toBe('not_opted_in');
  });

  it('is unconfirmed when the email has not been verified', () => {
    expect(newsletterSyncDecision({ ...optedInConfirmed, email_confirmed_at: null })).toBe('unconfirmed');
  });

  it('is already_synced once a marker exists', () => {
    expect(
      newsletterSyncDecision({
        ...optedInConfirmed,
        user_metadata: { ...optedInConfirmed.user_metadata, newsletter_synced_at: '2026-09-10T12:01:00.000Z' },
      })
    ).toBe('already_synced');
  });

  it('is sync for a confirmed, opted-in, unsynced user', () => {
    expect(newsletterSyncDecision(optedInConfirmed)).toBe('sync');
  });
});

describe('syncNewsletterSubscription', () => {
  it('unconfirmed user: no request', async () => {
    const { impl } = fakeFetch([]);
    const r = await syncNewsletterSubscription({
      session: sessionFor({ ...optedInConfirmed, email_confirmed_at: null }),
      fetchImpl: impl,
      log: silent,
    });
    expect(r).toEqual({ called: false, status: 'unconfirmed' });
    expect(impl).not.toHaveBeenCalled();
  });

  it('confirmed but not opted in: no request', async () => {
    const { impl } = fakeFetch([]);
    const r = await syncNewsletterSubscription({
      session: sessionFor({ ...optedInConfirmed, user_metadata: { newsletter_opt_in: false } }),
      fetchImpl: impl,
      log: silent,
    });
    expect(r).toEqual({ called: false, status: 'not_opted_in' });
    expect(impl).not.toHaveBeenCalled();
  });

  it('confirmed + opted in: exactly one POST with the Supabase bearer token and no body', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { ok: true, status: 'subscribed' } }]);
    const persist = vi.fn(async () => {});
    const r = await syncNewsletterSubscription({
      session: sessionFor(optedInConfirmed),
      fetchImpl: impl,
      persist,
      now: () => new Date('2026-09-10T12:05:00.000Z'),
      log: silent,
    });

    expect(r).toEqual({ called: true, status: 'subscribed' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(NEWSLETTER_SYNC_ENDPOINT);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].init.body).toBeUndefined();

    expect(persist).toHaveBeenCalledWith({
      newsletter_synced_at: '2026-09-10T12:05:00.000Z',
      newsletter_sync_status: 'subscribed',
    });
  });

  it('records the marker for an existing subscriber too', async () => {
    const { impl } = fakeFetch([{ status: 200, body: { ok: true, status: 'already_enrolled' } }]);
    const persist = vi.fn(async () => {});
    await syncNewsletterSubscription({ session: sessionFor(optedInConfirmed), fetchImpl: impl, persist, log: silent });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ newsletter_sync_status: 'already_enrolled' }));
  });

  it('Beehiiv 5xx: resolves quietly, writes no marker, never throws', async () => {
    const { impl } = fakeFetch([{ status: 502, body: { ok: false, status: 'provider_unavailable' } }]);
    const persist = vi.fn();
    const log = vi.fn();
    const r = await syncNewsletterSubscription({ session: sessionFor(optedInConfirmed), fetchImpl: impl, persist, log });

    expect(r).toEqual({ called: true, status: 'provider_unavailable' });
    expect(persist).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it('network failure: resolves quietly, writes no marker, never throws', async () => {
    const { impl } = fakeFetch([new Error('Failed to fetch')]);
    const persist = vi.fn();
    const r = await syncNewsletterSubscription({ session: sessionFor(optedInConfirmed), fetchImpl: impl, persist, log: silent });
    expect(r).toEqual({ called: true, status: 'network_error' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('a failing marker write does not throw or undo the sync result', async () => {
    const { impl } = fakeFetch([{ status: 200, body: { ok: true, status: 'subscribed' } }]);
    const persist = vi.fn(async () => { throw new Error('metadata write failed'); });
    const r = await syncNewsletterSubscription({ session: sessionFor(optedInConfirmed), fetchImpl: impl, persist, log: silent });
    expect(r).toEqual({ called: true, status: 'subscribed' });
  });

  it('a session without an access token makes no request', async () => {
    const { impl } = fakeFetch([]);
    const r = await syncNewsletterSubscription({ session: { user: optedInConfirmed }, fetchImpl: impl, log: silent });
    expect(r).toEqual({ called: false, status: 'no_token' });
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('repeated auth events', () => {
  it('a burst of events for the same user yields one request, even after a failure', async () => {
    const { impl } = fakeFetch([{ status: 502, body: { ok: false, status: 'provider_unavailable' } }]);
    const session = sessionFor(optedInConfirmed);

    // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED... all in the same page load.
    const results = await Promise.all([
      syncNewsletterSubscription({ session, fetchImpl: impl, log: silent }),
      syncNewsletterSubscription({ session, fetchImpl: impl, log: silent }),
      syncNewsletterSubscription({ session, fetchImpl: impl, log: silent }),
    ]);
    await syncNewsletterSubscription({ session, fetchImpl: impl, log: silent });

    expect(impl).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'already_attempted')).toHaveLength(2);
  });

  it('the USER_UPDATED event that follows the marker write is a no-op', async () => {
    const { impl } = fakeFetch([{ status: 200, body: { ok: true, status: 'subscribed' } }]);
    let storedMeta = { ...optedInConfirmed.user_metadata };
    const persist = vi.fn(async (data) => { storedMeta = { ...storedMeta, ...data }; });

    await syncNewsletterSubscription({ session: sessionFor(optedInConfirmed), fetchImpl: impl, persist, log: silent });

    // Next page load: the guard is empty, but the marker is on the user.
    resetNewsletterSyncGuard();
    const r = await syncNewsletterSubscription({
      session: sessionFor({ ...optedInConfirmed, user_metadata: storedMeta }),
      fetchImpl: impl,
      persist,
      log: silent,
    });

    expect(r).toEqual({ called: false, status: 'already_synced' });
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('a different user in the same page load gets their own request', async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { ok: true, status: 'subscribed' } },
      { status: 200, body: { ok: true, status: 'subscribed' } },
    ]);
    await syncNewsletterSubscription({ session: sessionFor(optedInConfirmed), fetchImpl: impl, log: silent });
    await syncNewsletterSubscription({ session: sessionFor({ ...optedInConfirmed, id: 'user-2' }), fetchImpl: impl, log: silent });
    expect(impl).toHaveBeenCalledTimes(2);
  });
});
