import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The auth listener is the one place the newsletter sync is triggered from.
 * These tests drive that listener directly with fake sessions and watch the
 * network, so they cover the wiring rather than the sync logic (which has its
 * own tests in lib/auth/__tests__/newsletterSync.test.js).
 */

const listeners = [];
const updateUser = vi.fn(async () => ({ data: {}, error: null }));

vi.mock('../../supabaseClient', () => ({
  isSupabaseAvailable: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      updateUser: (...args) => updateUser(...args),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

vi.mock('../../lib/telemetry', () => ({
  identifyUser: () => {},
  resetIdentity: () => {},
  trackEvent: () => {},
}));

import { AuthProvider, useAuth } from '../AuthContext';
import { resetNewsletterSyncGuard } from '../../lib/auth/newsletterSync';

const TOKEN = 'supabase-access-token';

const confirmedOptedIn = {
  id: 'u-1',
  email: 'fed@example.gov',
  email_confirmed_at: '2026-09-10T12:00:00.000Z',
  user_metadata: { newsletter_opt_in: true },
};

let seen;
function Probe() {
  seen = useAuth();
  return null;
}

async function fireAuth(session) {
  await act(async () => {
    for (const cb of listeners) await cb('SIGNED_IN', session);
  });
}

beforeEach(() => {
  // .env.local turns the dev bypass on, which skips the real listener.
  vi.stubEnv('VITE_BYPASS_AUTH', 'false');
  vi.stubEnv('VITE_BYPASS_PRO', 'false');
  listeners.length = 0;
  resetNewsletterSyncGuard();
  updateUser.mockImplementation(async () => ({ data: {}, error: null }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, status: 'subscribed' }) })));
  render(<AuthProvider><Probe /></AuthProvider>);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AuthContext newsletter sync wiring', () => {
  it('unconfirmed user: authenticated, no Beehiiv call', async () => {
    await fireAuth({ access_token: TOKEN, user: { ...confirmedOptedIn, email_confirmed_at: null } });
    expect(seen.isAuthenticated).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('confirmed but not opted in: authenticated, no Beehiiv call', async () => {
    await fireAuth({ access_token: TOKEN, user: { ...confirmedOptedIn, user_metadata: { newsletter_opt_in: false } } });
    expect(seen.isAuthenticated).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('confirmed + opted in: one POST carrying the session access token, then the marker is written', async () => {
    await fireAuth({ access_token: TOKEN, user: confirmedOptedIn });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/beehiiv/subscribe');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.body).toBeUndefined();

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(updateUser.mock.calls[0][0].data).toMatchObject({ newsletter_sync_status: 'subscribed' });
    expect(updateUser.mock.calls[0][0].data.newsletter_synced_at).toEqual(expect.any(String));
  });

  it('Beehiiv 5xx: the user is still signed in and nothing throws', async () => {
    fetch.mockImplementation(async () => ({ ok: false, status: 502, json: async () => ({ ok: false, status: 'provider_unavailable' }) }));
    await fireAuth({ access_token: TOKEN, user: confirmedOptedIn });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(seen.isAuthenticated).toBe(true);
    expect(seen.user.id).toBe('u-1');
    expect(seen.loading).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('repeated auth events for the same session make one request, not a loop', async () => {
    const session = { access_token: TOKEN, user: confirmedOptedIn };
    await fireAuth(session);
    await fireAuth(session); // TOKEN_REFRESHED
    await fireAuth(session); // USER_UPDATED after the marker write
    await fireAuth({ ...session, user: { ...confirmedOptedIn, user_metadata: { newsletter_opt_in: true, newsletter_synced_at: 'x' } } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
