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


