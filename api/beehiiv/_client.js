/* eslint-env node */
/**
 * Beehiiv v2 client, server-side only.
 *
 * The API key lives in this process's environment and nowhere else. It is read
 * here, placed on an Authorization header, and never returned, thrown, or
 * logged. Every error this module produces carries Beehiiv's status code and
 * message only.
 *
 * `fetchImpl` is injectable so the behaviour can be tested without the network.
 *
 * https://developers.beehiiv.com/
 */

export const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2';

function mustGetEnv(env, name) {
  const value = env[name];
  if (value) return value;
  const err = new Error(`Missing required env var: ${name}`);
  err.statusCode = 500;
  throw err;
}

/** Reads the three Beehiiv settings from the environment. */
export function getBeehiivConfig(env = process.env) {
  return {
    apiKey: mustGetEnv(env, 'BEEHIIV_API_KEY'),
    publicationId: mustGetEnv(env, 'BEEHIIV_PUBLICATION_ID'),
    automationId: mustGetEnv(env, 'BEEHIIV_AUTOMATION_ID'),
  };
}

/** An error carrying only what is safe to surface: Beehiiv's status and text. */
export class BeehiivError extends Error {
  constructor({ step, status, message }) {
    super(`Beehiiv ${step} failed (${status}): ${message}`);
    this.name = 'BeehiivError';
    this.step = step;
    this.status = status;
    this.beehiivMessage = message;
    // The handler maps this to a 502; the browser never sees the detail.
    this.statusCode = 502;
  }
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

function messageFrom(body) {
  if (!body) return '';
  if (typeof body.message === 'string') return body.message;
  if (Array.isArray(body.errors)) return body.errors.map((e) => e?.message ?? String(e)).join('; ');
  if (typeof body.error === 'string') return body.error;
  if (typeof body.raw === 'string') return body.raw;
  return '';
}

async function request({ config, fetchImpl, method, path, body, step }) {
  const response = await fetchImpl(`${BEEHIIV_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await readBody(response);
  return { status: response.status, ok: response.ok, body: parsed, message: messageFrom(parsed), step };
}

/**
 * The subscriber for an email, or null if Beehiiv has never seen it.
 *
 * 404 is the documented "not found" and is the expected answer for a new user;
 * it is not an error.
 */
export async function findSubscriberByEmail({ email, config, fetchImpl = fetch }) {
  const r = await request({
    config,
    fetchImpl,
    method: 'GET',
    path: `/publications/${encodeURIComponent(config.publicationId)}/subscriptions/by_email/${encodeURIComponent(email)}`,
    step: 'lookup',
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new BeehiivError({ step: 'lookup', status: r.status, message: r.message });
  return r.body?.data ?? null;
}

/**
 * Creates a subscriber already enrolled in the welcome automation.
 *
 * FireFed captured explicit consent at signup, so Beehiiv's own double opt-in
 * and welcome email are both turned off here — the user should not be asked
 * twice.
 */
export async function createSubscriber({ email, config, fetchImpl = fetch }) {
  const r = await request({
    config,
    fetchImpl,
    method: 'POST',
    path: `/publications/${encodeURIComponent(config.publicationId)}/subscriptions`,
    body: {
      email,
      send_welcome_email: false,
      double_opt_override: 'off',
      automation_ids: [config.automationId],
      utm_source: 'firefed',
      utm_medium: 'product',
      utm_campaign: 'account_signup',
    },
    step: 'create',
  });
  if (!r.ok) throw new BeehiivError({ step: 'create', status: r.status, message: r.message });
  return r.body?.data ?? null;
}

/**
 * Puts an existing subscriber into the welcome automation.
 *
 * Beehiiv rejects a second enrolment in the same journey rather than
 * duplicating it. That rejection is the idempotent outcome, not a failure, so
 * it is reported as `alreadyEnrolled` and everything else is thrown.
 */
export async function enrollInAutomation({ email, config, fetchImpl = fetch }) {
  const r = await request({
    config,
    fetchImpl,
    method: 'POST',
    path: `/publications/${encodeURIComponent(config.publicationId)}/automations/${encodeURIComponent(config.automationId)}/journeys`,
    body: { email },
    step: 'enroll',
  });
  if (r.ok) return { enrolled: true, alreadyEnrolled: false };

  const alreadyIn = r.status === 409 || /already/i.test(r.message);
  if (alreadyIn) return { enrolled: false, alreadyEnrolled: true };

  throw new BeehiivError({ step: 'enroll', status: r.status, message: r.message });
}
