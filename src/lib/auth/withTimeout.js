/**
 * A bound on how long the app will wait for auth before rendering something.
 *
 * supabase-js serialises auth operations across tabs using the Web Locks API.
 * When a lock is held by a tab that never releases it — several tabs open at
 * once, or one returning from an external redirect — `getSession()` neither
 * resolves nor rejects. Awaiting it directly leaves the app on its loading
 * spinner forever, with no error to catch and no way out but a reload.
 *
 * That path is the one every paying customer takes: Stripe checkout redirects
 * them back to the app, so a hang there is a hang immediately after payment.
 */

export const DEFAULT_AUTH_TIMEOUT_MS = 8000;

/**
 * Resolves to `{ timedOut, value }` rather than throwing on timeout, so callers
 * can tell "auth is genuinely absent" apart from "auth never answered" — the
 * two want different handling, and conflating them is how a hang gets reported
 * as a signed-out user.
 *
 * A promise that rejects still rejects; real errors stay real errors.
 */
export async function resolveWithTimeout(
  promise,
  { timeoutMs = DEFAULT_AUTH_TIMEOUT_MS, fallback = null, onTimeout } = {}
) {
  let timer;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      onTimeout?.();
      resolve({ timedOut: true, value: fallback });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve(promise).then((value) => ({ timedOut: false, value })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
