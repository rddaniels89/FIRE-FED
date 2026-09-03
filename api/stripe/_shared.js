/* eslint-env node */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function mustGetEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString();
  return `${proto}://${host}`;
}

// Pinned so an SDK upgrade cannot silently reshape webhook payloads.
// Changing this requires re-checking field paths in api/stripe/webhook.js.
export const STRIPE_API_VERSION = '2025-08-27.basil';

export function getStripe() {
  const key = mustGetEnv('STRIPE_SECRET_KEY');
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export function getSupabaseAdmin() {
  const url = mustGetEnv('SUPABASE_URL');
  const serviceRoleKey = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function requireAuthedUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing Authorization header');
    err.statusCode = 401;
    throw err;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    const err = new Error('Missing access token');
    err.statusCode = 401;
    throw err;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error('Invalid session');
    err.statusCode = 401;
    throw err;
  }

  return { user: data.user, accessToken: token };
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendError(res, error) {
  const status = Number(error?.statusCode || 500);
  const message = status >= 500 ? 'Internal error' : (error?.message || 'Request failed');
  sendJson(res, status, { error: message });
}

/**
 * Returns the stored Stripe customer id only if it still resolves, otherwise
 * null.
 *
 * A stored id can stop resolving for reasons that have nothing to do with the
 * user: the customer was deleted in the Stripe dashboard, or it was created in
 * a different mode or sandbox during setup. The id is read straight back from
 * the database on every attempt, so a dead one blocks that user permanently --
 * from purchasing at the checkout endpoint, and from cancelling at the portal.
 */
export async function resolveUsableCustomerId({ stripe, storedCustomerId }) {
  const stored = (storedCustomerId || '').toString().trim();
  if (!stored) return null;

  try {
    const customer = await stripe.customers.retrieve(stored);
    // Deleted customers still retrieve, flagged rather than throwing.
    return customer && customer.deleted !== true ? stored : null;
  } catch (error) {
    // Only a missing customer is recoverable by minting a new one. Anything
    // else (auth, network, rate limit) must surface rather than silently
    // orphaning the existing customer and its payment methods.
    if (error?.code === 'resource_missing' || error?.statusCode === 404) return null;
    throw error;
  }
}
