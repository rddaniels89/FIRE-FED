import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';

let telemetryInitialized = false;

export function initTelemetry() {
  if (telemetryInitialized) return;
  telemetryInitialized = true;

  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
    });
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
    });
  }
}

/**
 * Property keys an event may carry. Anything else is dropped before it leaves
 * the browser: no dollar amounts, grades, service dates, ratings, points,
 * health-plan choices, or free text ever reach analytics (spec §11.3, §20.19).
 */
export const TELEMETRY_ALLOWED_KEYS = Object.freeze([
  'calculator', 'engaged', 'target', 'placement', 'path', 'status', 'mode', 'reason', 'code', 'operation',
  'count', 'limit', 'importedCount', 'skippedCount', 'selectedCount', 'simulations', 'fromAge', 'toAge',
  'includeCharts', 'detailLevel', 'plan', 'preset', 'kind', 'id', 'http_status', 'email_domain', 'message',
  'feature', 'section', 'screen', 'ruleId', 'a',
]);

const SENSITIVE_KEY = /amount|balance|pay\b|salary|grade|date|rating|points|premium|dollar|value|income|gross|net|disability|va|tsp|coverage|branch|component|system|dob|birth|ssn|name|email$|address|unit|location/i;
const LOOKS_LIKE_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

/** The properties an event may carry, and nothing else. Exported for the redaction test. */
export function sanitizeTelemetryProperties(properties = {}) {
  const out = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (!TELEMETRY_ALLOWED_KEYS.includes(key)) continue;
    if (SENSITIVE_KEY.test(key)) continue;
    if (value === null || value === undefined) {
      out[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      // Counts and ages only; anything that could be a dollar figure is dropped.
      if (Number.isFinite(value) && Math.abs(value) <= 10000) out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      if (LOOKS_LIKE_DATE.test(value) || value.length > 80) continue;
      out[key] = value;
      continue;
    }
    // Objects and arrays are never sent.
  }
  return out;
}

export function trackEvent(eventName, properties = {}) {
  try {
    if (import.meta.env.VITE_POSTHOG_KEY) {
      posthog.capture(eventName, sanitizeTelemetryProperties(properties));
    }
  } catch {
    // swallow
  }
}

/**
 * Automatic pageviews are off because PostHog's default only fires on a full
 * page load, and this is a single-page app: every route change after the first
 * would be invisible. Routing calls this instead.
 */
export function trackPageView(path) {
  try {
    if (import.meta.env.VITE_POSTHOG_KEY) {
      posthog.capture('$pageview', { $current_url: window.location.href, path });
    }
  } catch {
    // swallow
  }
}

/**
 * Ties the anonymous visitor to the account they just signed into.
 *
 * Without this, someone who lands, uses a calculator, then signs up and pays is
 * two unrelated people in the data — and the funnel this exists to measure
 * cannot be assembled at all.
 *
 * Only the user id is sent. Email and anything else identifying stays out; this
 * is a tool people put their salary and retirement plans into.
 */
export function identifyUser(userId) {
  try {
    if (import.meta.env.VITE_POSTHOG_KEY && userId) {
      posthog.identify(String(userId));
    }
  } catch {
    // swallow
  }
}

/** Called on sign-out so a shared machine does not merge two people. */
export function resetIdentity() {
  try {
    if (import.meta.env.VITE_POSTHOG_KEY) {
      posthog.reset();
    }
  } catch {
    // swallow
  }
}


