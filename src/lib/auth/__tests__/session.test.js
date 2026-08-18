import { describe, expect, it } from 'vitest';
import { isActiveSubscriptionStatus, isLocalOnlyUser, isProFromTrustedMetadata } from '../session';

describe('auth session helpers', () => {
  it('detects local-only users', () => {
    expect(isLocalOnlyUser({ id: 'guest-123' })).toBe(true);
    expect(isLocalOnlyUser({ id: 'dev-bypass' })).toBe(true);
    expect(isLocalOnlyUser({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(false);
  });

  it('treats active and trialing subscriptions as active', () => {
    expect(isActiveSubscriptionStatus('active')).toBe(true);
    expect(isActiveSubscriptionStatus('trialing')).toBe(true);
    expect(isActiveSubscriptionStatus('canceled')).toBe(false);
  });
});

describe('isProFromTrustedMetadata', () => {
  it('grants Pro from service-role-written app_metadata', () => {
    expect(isProFromTrustedMetadata({ app_metadata: { subscription_plan: 'pro' } })).toBe(true);
    expect(isProFromTrustedMetadata({ app_metadata: { role: 'pro' } })).toBe(true);
  });

  it('ignores client-writable user_metadata', () => {
    // A signed-in user can set this themselves via supabase.auth.updateUser.
    expect(isProFromTrustedMetadata({ user_metadata: { subscription_plan: 'pro' } })).toBe(false);
    expect(isProFromTrustedMetadata({ user_metadata: { role: 'pro' } })).toBe(false);
  });

  it('denies Pro for users with no metadata', () => {
    expect(isProFromTrustedMetadata({})).toBe(false);
    expect(isProFromTrustedMetadata(null)).toBe(false);
  });
});
