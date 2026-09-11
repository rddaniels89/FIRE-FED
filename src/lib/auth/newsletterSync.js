import { trackEvent } from '../telemetry';

/**
 * Client half of the newsletter sync: decides when to ask the server to
 * subscribe the signed-in user, and remembers that it asked.
 *
 * The server (`/api/beehiiv/subscribe`) is authoritative for the email and the
 * consent flag, so nothing goes in the request body — only the bearer token.
 * The checks here exist to avoid pointless round trips, not to enforce policy.
 *
 * Runs from the auth listener, which fires on every session event (initial
 * load, sign-in, token refresh, metadata update), so it has to be cheap and
 * safe to call repeatedly. Two guards keep it that way:
 *
 *  - `newsletter_synced_at` on the user's metadata, written after the first
 *    successful sync. Same home as the consent record itself; no new table.
 *    A returning user costs nothing after that.
 *  - A per-page-load set of user ids already attempted, so a failure (or a
 *    slow metadata write) can't turn a burst of auth events into a burst of
 *    requests. A fresh page load retries, which is how an outage self-heals.
 *
 * A failure is logged and reported; it never surfaces to the user and never
 * touches the auth state.
 */

export const NEWSLETTER_SYNC_ENDPOINT = '/api/beehiiv/subscribe';

const attemptedThisPageLoad = new Set();

/** Test hook: forget which users this page load has tried. */
export function resetNewsletterSyncGuard() {
  attemptedThisPageLoad.clear();
}

/**
 * Why this user does or does not need a sync right now.
 *
 * 'sync' is the only value that leads to a request.
 */
export function newsletterSyncDecision(user) {
  const meta = user?.user_metadata ?? {};
  if (meta.newsletter_opt_in !== true) return 'not_opted_in';
  if (!user?.email_confirmed_at) return 'unconfirmed';
  if (meta.newsletter_synced_at) return 'already_synced';
  return 'sync';
}

export async function syncNewsletterSubscription({
  session,
  fetchImpl = fetch,
  persist,
  now = () => new Date(),
  log = (...args) => console.warn('[newsletter]', ...args),
}) {
  const user = session?.user;
  const accessToken = session?.access_token;

  const decision = newsletterSyncDecision(user);
  if (decision !== 'sync') return { called: false, status: decision };
  if (!accessToken) return { called: false, status: 'no_token' };
  if (attemptedThisPageLoad.has(user.id)) return { called: false, status: 'already_attempted' };

  // Claimed before the request goes out, so a second auth event arriving
  // mid-flight cannot start a second request.
  attemptedThisPageLoad.add(user.id);

  let response;
  try {
    response = await fetchImpl(NEWSLETTER_SYNC_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    log('sync request failed', error?.message ?? error);
    trackEvent('newsletter_sync_failed', { reason: 'network' });
    return { called: true, status: 'network_error' };
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    // A non-JSON body is treated like an empty one below.
  }

  if (!response.ok || body?.ok !== true) {
    const status = body?.status ?? `http_${response.status}`;
    log('sync declined', response.status, status);
    trackEvent('newsletter_sync_failed', { reason: status, http_status: response.status });
    return { called: true, status };
  }

  trackEvent('newsletter_synced', { status: body.status });

  if (persist) {
    try {
      await persist({
        newsletter_synced_at: now().toISOString(),
        newsletter_sync_status: body.status,
      });
    } catch (error) {
      // Only the marker is lost; the endpoint is idempotent, so the next page
      // load's retry is harmless.
      log('could not record sync marker', error?.message ?? error);
    }
  }

  return { called: true, status: body.status };
}
