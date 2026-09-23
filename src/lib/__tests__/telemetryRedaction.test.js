import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Spec §11.3 and §20.19: no dollar amount, grade, service date, rating,
 * point total, health-plan choice, or free text reaches analytics. Only the
 * allow-listed coarse properties survive, and every military event in the app
 * is one of them.
 */

vi.mock('posthog-js', () => ({ default: { init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn() } }));
vi.mock('@sentry/react', () => ({ init: vi.fn() }));

const { sanitizeTelemetryProperties, TELEMETRY_ALLOWED_KEYS } = await import('../telemetry');

describe('telemetry redaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drops every sensitive property and keeps the coarse ones', () => {
    const out = sanitizeTelemetryProperties({
      calculator: 'military_retirement',
      path: 'regular',
      status: 'estimate_only',
      engaged: true,
      grossMonthly: 3097,
      payBase: 10324.61,
      grade: 'E-8',
      retirementDate: '2036-05-01',
      diems: '1996-06-01',
      vaRating: 70,
      totalPoints: 4320,
      premium: 195,
      coverage: 'trs',
      notes: 'free text about a condition',
      household: { spouse: true },
      system: 'high_36',
      branch: 'army',
    });
    expect(out).toEqual({ calculator: 'military_retirement', path: 'regular', status: 'estimate_only', engaged: true });
  });

  it('drops date-shaped strings, long strings, large numbers, objects, and arrays even under allowed keys', () => {
    expect(sanitizeTelemetryProperties({ reason: '2026-09-20' })).toEqual({});
    expect(sanitizeTelemetryProperties({ reason: 'x'.repeat(81) })).toEqual({});
    expect(sanitizeTelemetryProperties({ count: 250000 })).toEqual({});
    expect(sanitizeTelemetryProperties({ count: 3, limit: 5 })).toEqual({ count: 3, limit: 5 });
    expect(sanitizeTelemetryProperties({ plan: ['a'], kind: { x: 1 } })).toEqual({});
  });

  it('never lets a key that names a sensitive field onto the allow list', () => {
    const forbidden = /amount|balance|salary|grade|date|rating|points|premium|income|disability|coverage|branch|system/i;
    for (const key of TELEMETRY_ALLOWED_KEYS) expect(key).not.toMatch(forbidden);
  });

  it('the military events the app emits carry only allowed properties', () => {
    const saved = sanitizeTelemetryProperties({ path: 'reserve_nonregular', status: 'estimate_only' });
    expect(saved).toEqual({ path: 'reserve_nonregular', status: 'estimate_only' });
    expect(sanitizeTelemetryProperties({})).toEqual({});
  });
});
