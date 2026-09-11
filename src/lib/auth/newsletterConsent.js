/**
 * Marketing-email consent captured at signup.
 *
 * Stored on the Supabase Auth user as `user_metadata`, via the `options.data`
 * argument to `signUp`. That is the app's existing home for per-user attributes
 * (it already reads `user.user_metadata`), it needs no new table, and it is
 * written atomically with account creation — the record exists from the moment
 * consent was given, before the confirmation email is even opened.
 *
 * Nothing here talks to an email provider. Syncing opted-in users to Beehiiv is
 * a separate, server-side step that reads these fields back; no provider
 * credentials belong anywhere near this code.
 */

export const NEWSLETTER_OPT_IN_SOURCE_SIGNUP = 'firefed_signup';

export const NEWSLETTER_CONSENT_LABEL =
  'Send me FireFed federal retirement updates, product education, and planning emails.';

/**
 * The metadata to persist for a signup.
 *
 * `newsletter_opt_in_at` is set only when consent was actually given, so a
 * `false` record never carries a timestamp that could be mistaken for one.
 */
export function buildNewsletterConsentMetadata({ optedIn, now = new Date() } = {}) {
  const consented = optedIn === true;
  return {
    newsletter_opt_in: consented,
    newsletter_opt_in_at: consented ? now.toISOString() : null,
    newsletter_opt_in_source: NEWSLETTER_OPT_IN_SOURCE_SIGNUP,
  };
}
