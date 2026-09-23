/* eslint-env node */
import * as Sentry from '@sentry/node';

/**
 * Server-side error reporting for the Vercel functions.
 *
 * Silent failure is the failure mode this codebase has actually suffered: for
 * eight months every scenario write was rejected and nobody knew, because the
 * only record was a console line in a log nobody read. Anything a handler
 * cannot recover from now also goes to Sentry, where it pages a person.
 *
 * Without SENTRY_DSN this is a no-op, so local development and tests need no
 * account. It never throws: an observability failure must not become a second
 * user-facing failure.
 */

let initialized = false;

function ensureInit() {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    // Nothing about a user is attached automatically; handlers pass ids
    // explicitly when they matter.
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  initialized = true;
  return true;
}

/**
 * Reports an error and waits (briefly) for it to leave the process.
 *
 * The flush matters on a serverless platform: the function is frozen the
 * moment the response ends, and an unflushed event is simply lost.
 */
export async function reportServerError(error, { tags = {}, extra = {}, level = 'error' } = {}) {
  try {
    if (!ensureInit()) return false;
    Sentry.withScope((scope) => {
      scope.setLevel(level);
      for (const [k, v] of Object.entries(tags)) scope.setTag(k, String(v));
      for (const [k, v] of Object.entries(extra)) scope.setExtra(k, v);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
    await Sentry.flush(2000);
    return true;
  } catch {
    return false;
  }
}
