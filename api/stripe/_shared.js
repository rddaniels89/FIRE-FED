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

export function getStripe() {
  const key = mustGetEnv('STRIPE_SECRET_KEY');
  return new Stripe(key, {
    // Use Stripe's default API version for the installed SDK.
    // If you need strict pinning later, add apiVersion here.
  });
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


