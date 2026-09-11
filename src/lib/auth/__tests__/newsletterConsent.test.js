import { describe, expect, it } from 'vitest';
import {
  NEWSLETTER_CONSENT_LABEL,
  NEWSLETTER_OPT_IN_SOURCE_SIGNUP,
  buildNewsletterConsentMetadata,
} from '../newsletterConsent';

describe('newsletter consent metadata', () => {
  const at = new Date('2026-09-10T15:04:05.000Z');

  it('records consent with a timestamp and the signup source', () => {
    expect(buildNewsletterConsentMetadata({ optedIn: true, now: at })).toEqual({
      newsletter_opt_in: true,
      newsletter_opt_in_at: '2026-09-10T15:04:05.000Z',
      newsletter_opt_in_source: 'firefed_signup',
    });
  });

  // A declined record must never carry a timestamp that could later be read
  // as the moment someone consented.
  it('records a decline with a null timestamp', () => {
    expect(buildNewsletterConsentMetadata({ optedIn: false, now: at })).toEqual({
      newsletter_opt_in: false,
      newsletter_opt_in_at: null,
      newsletter_opt_in_source: 'firefed_signup',
    });
  });

  it('treats anything but an explicit true as a decline', () => {
    for (const v of [undefined, null, 'true', 1, 'on']) {
      const m = buildNewsletterConsentMetadata({ optedIn: v, now: at });
      expect(m.newsletter_opt_in).toBe(false);
      expect(m.newsletter_opt_in_at).toBeNull();
    }
  });

  it('defaults to a decline when called with nothing', () => {
    expect(buildNewsletterConsentMetadata().newsletter_opt_in).toBe(false);
  });

  it('pins the source and the exact consent copy', () => {
    expect(NEWSLETTER_OPT_IN_SOURCE_SIGNUP).toBe('firefed_signup');
    expect(NEWSLETTER_CONSENT_LABEL).toBe(
      'Send me FireFed federal retirement updates, product education, and planning emails.'
    );
  });
});
