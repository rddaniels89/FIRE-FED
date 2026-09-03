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

export function trackEvent(eventName, properties = {}) {
  try {
    if (import.meta.env.VITE_POSTHOG_KEY) {
      posthog.capture(eventName, properties);
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


