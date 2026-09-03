/**
 * A Web Lock that gives up instead of waiting forever.
 *
 * supabase-js serialises auth across tabs with `navigator.locks`, and its
 * default acquires with no deadline. Every call that needs an access token
 * takes that lock first — including PostgREST queries, which resolve a token
 * before issuing any HTTP. So a lock held by a tab that never releases it does
 * not merely slow the app down: the request is never sent at all, and whatever
 * awaited it hangs with no error and nothing in the network log to explain it.
 *
 * Observed in production twice: the app stuck on its loading spinner, and a
 * paid subscription stuck on "Checking subscription status…" with zero
 * requests for `subscriptions` in the network panel.
 *
 * Bounding the acquisition keeps cross-tab serialisation in the normal case and
 * degrades to running unlocked when the lock cannot be had. Running unlocked
 * risks two tabs refreshing a token concurrently, which supabase-js tolerates;
 * hanging forever is not tolerable at all.
 */

export const LOCK_ACQUIRE_TIMEOUT_MS = 5000;

export function createBoundedNavigatorLock({
  timeoutMs = LOCK_ACQUIRE_TIMEOUT_MS,
  onTimeout,
} = {}) {
  return async function boundedNavigatorLock(name, _acquireTimeout, fn) {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;

    // No Web Locks API (older browsers, some embedded webviews): the lock was
    // never available, so run directly rather than failing.
    if (!locks?.request) return await fn();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await locks.request(name, { mode: 'exclusive', signal: controller.signal }, async () => fn());
    } catch (error) {
      // AbortError is the deadline firing, not a failure of fn().
      if (error?.name === 'AbortError') {
        onTimeout?.(name);
        return await fn();
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
