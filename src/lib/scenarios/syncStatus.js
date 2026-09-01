/**
 * Turns a failed cloud write into something worth showing a user.
 *
 * Scenario writes fall back to on-device storage when Supabase rejects them, so
 * the UI keeps working and the failure is invisible. That is how a missing
 * column went unnoticed for eight months in production. These descriptions
 * exist so a write that did not persist says so.
 */

export const CLOUD_SYNC_REASONS = Object.freeze({
  SCHEMA_DRIFT: 'schema_drift',
  MISSING_TABLE: 'missing_table',
  PERMISSION: 'permission',
  BAD_IDENTIFIER: 'bad_identifier',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
});

const SHARED_CONSEQUENCE =
  'Your changes are kept on this device, but they are not saved to your account and will not appear on other devices.';

function codeOf(error) {
  return (error?.code ?? '').toString();
}

/**
 * `error` is a Supabase/PostgREST error object, or a thrown Error for transport
 * failures. Returns null when there is nothing to report.
 */
export function describeCloudSyncError(error) {
  if (!error) return null;

  const code = codeOf(error);
  const message = (error?.message ?? '').toString();

  // PGRST204 is PostgREST's "column not in the schema cache"; 42703 is the
  // Postgres equivalent. Both mean the database is older than this build.
  if (code === 'PGRST204' || code === '42703') {
    return {
      reason: CLOUD_SYNC_REASONS.SCHEMA_DRIFT,
      title: 'Changes are not saving to your account',
      detail: `This version of FireFed expects a database field that is missing. ${SHARED_CONSEQUENCE}`,
      code,
    };
  }

  if (code === '42P01') {
    return {
      reason: CLOUD_SYNC_REASONS.MISSING_TABLE,
      title: 'Changes are not saving to your account',
      detail: `A database table FireFed needs has not been set up. ${SHARED_CONSEQUENCE}`,
      code,
    };
  }

  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') {
    return {
      reason: CLOUD_SYNC_REASONS.PERMISSION,
      title: 'Changes are not saving to your account',
      detail: `Your session does not have permission to write this scenario. Signing out and back in usually fixes it. ${SHARED_CONSEQUENCE}`,
      code,
    };
  }

  // A scenario created before it ever reached the cloud carries a timestamp id
  // rather than a UUID, which the database rejects on sight.
  if (code === '22P02') {
    return {
      reason: CLOUD_SYNC_REASONS.BAD_IDENTIFIER,
      title: 'This scenario cannot sync to your account',
      detail: `It was created on this device and has an identifier the database will not accept. Saving it as a new scenario will sync correctly. ${SHARED_CONSEQUENCE}`,
      code,
    };
  }

  if (!code && /fetch|network|failed to fetch/i.test(message)) {
    return {
      reason: CLOUD_SYNC_REASONS.OFFLINE,
      title: 'FireFed cannot reach your account right now',
      detail: `Check your connection. ${SHARED_CONSEQUENCE}`,
      code: '',
    };
  }

  return {
    reason: CLOUD_SYNC_REASONS.UNKNOWN,
    title: 'Changes are not saving to your account',
    detail: SHARED_CONSEQUENCE,
    code,
  };
}
