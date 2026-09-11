/* eslint-env node */
import { requireAuthedUser, sendError, sendJson } from '../stripe/_shared.js';
import {
  BeehiivError,
  createSubscriber,
  enrollInAutomation,
  findSubscriberByEmail,
  getBeehiivConfig,
} from './_client.js';

/**
 * POST /api/beehiiv/subscribe
 *
 * Subscribes the calling user to the FireFed newsletter, if and only if they
 * consented at signup.
 *
 * Nothing about the request body is trusted. The email comes from the
 * Supabase user the bearer token resolves to, the consent flag comes from the
 * metadata persisted on that user at signup, and a caller who has not opted in
 * gets a 403 with no side effects. The Beehiiv key never leaves this process.
 *
 * Idempotent: a repeat call finds the existing subscriber and Beehiiv declines
 * the duplicate enrolment, which is reported as `already_enrolled`.
 */

export const STATUS = Object.freeze({
  SUBSCRIBED: 'subscribed',
  EXISTING_ENROLLED: 'existing_subscriber_enrolled',
  ALREADY_ENROLLED: 'already_enrolled',
  NOT_OPTED_IN: 'not_opted_in',
  EMAIL_NOT_CONFIRMED: 'email_not_confirmed',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
});

const defaultLog = (entry) => console.error('[beehiiv]', entry);

/**
 * The whole decision, given an already-authenticated user.
 *
 * Returns `{ httpStatus, body }` so the handler stays thin and this can be
 * tested with a stubbed user and fetch.
 */
export async function subscribeAuthenticatedUser({ user, config, fetchImpl = fetch, log = defaultLog }) {
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const emailConfirmed = Boolean(user?.email_confirmed_at);
  const optedIn = user?.user_metadata?.newsletter_opt_in === true;

  if (!optedIn) {
    return { httpStatus: 403, body: { ok: false, status: STATUS.NOT_OPTED_IN } };
  }
  if (!email || !emailConfirmed) {
    return { httpStatus: 403, body: { ok: false, status: STATUS.EMAIL_NOT_CONFIRMED } };
  }

  try {
    const existing = await findSubscriberByEmail({ email, config, fetchImpl });

    if (!existing) {
      await createSubscriber({ email, config, fetchImpl });
      return { httpStatus: 200, body: { ok: true, status: STATUS.SUBSCRIBED } };
    }

    const result = await enrollInAutomation({ email, config, fetchImpl });
    return {
      httpStatus: 200,
      body: {
        ok: true,
        status: result.alreadyEnrolled ? STATUS.ALREADY_ENROLLED : STATUS.EXISTING_ENROLLED,
      },
    };
  } catch (error) {
    // Status and Beehiiv's message are useful; the key is never part of either.
    if (error instanceof BeehiivError) {
      log({ step: error.step, status: error.status, message: error.beehiivMessage, userId: user?.id ?? null });
      return { httpStatus: 502, body: { ok: false, status: STATUS.PROVIDER_UNAVAILABLE } };
    }
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { user } = await requireAuthedUser(req);
    const config = getBeehiivConfig();
    const { httpStatus, body } = await subscribeAuthenticatedUser({ user, config });
    return sendJson(res, httpStatus, body);
  } catch (error) {
    return sendError(res, error);
  }
}
