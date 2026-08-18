/** Users stored only on-device (not Supabase cloud accounts). */
export function isLocalOnlyUser(user) {
  if (!user?.id) return true;
  const id = String(user.id);
  return id.startsWith('guest-') || id === 'dev-bypass';
}

export function isActiveSubscriptionStatus(status) {
  const s = (status || '').toString().toLowerCase();
  return s === 'active' || s === 'trialing';
}

/**
 * Only `app_metadata` is trusted: it can be written solely with the service role
 * key. `user_metadata` is client-writable (any signed-in user can call
 * `supabase.auth.updateUser`), so trusting it would hand out free Pro. This path
 * exists for manually comped accounts; paying users are entitled by their
 * `subscriptions` row.
 */
export function isProFromTrustedMetadata(user) {
  const appMetadata = user?.app_metadata || {};
  return appMetadata.subscription_plan === 'pro' || appMetadata.role === 'pro';
}
