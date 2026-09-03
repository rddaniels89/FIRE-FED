import { describe, expect, it, vi, beforeEach } from 'vitest';

// PostHog is never configured in tests, which is the same state production was
// in until today: every telemetry call must be a silent no-op rather than an
// exception that takes the page down with it.
vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(() => {
      throw new Error('posthog exploded');
    }),
    identify: vi.fn(() => {
      throw new Error('posthog exploded');
    }),
    reset: vi.fn(() => {
      throw new Error('posthog exploded');
    }),
  },
}));

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

const { identifyUser, resetIdentity, trackEvent, trackPageView } = await import('../telemetry');

describe('telemetry is never allowed to break the app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('swallows a failing capture', () => {
    expect(() => trackEvent('anything', { a: 1 })).not.toThrow();
  });

  it('swallows a failing pageview', () => {
    expect(() => trackPageView('/pricing')).not.toThrow();
  });

  it('swallows a failing identify', () => {
    expect(() => identifyUser('user-123')).not.toThrow();
  });

  it('swallows a failing reset', () => {
    expect(() => resetIdentity()).not.toThrow();
  });

  it('ignores an identify with no user id', () => {
    expect(() => identifyUser(undefined)).not.toThrow();
    expect(() => identifyUser(null)).not.toThrow();
  });
});
