/* eslint-env node */
/**
 * Helpers for reading Stripe webhook payloads and for the event idempotency
 * ledger. Kept free of the Stripe SDK and of any Supabase client construction
 * (the caller passes one in) so they can be unit tested directly.
 */

/**
 * As of API version 2025-08-27.basil, `current_period_end` lives on subscription
 * items rather than the subscription. Fall back to the legacy field so events
 * replayed from an older API version still resolve.
 */
export function getSubscriptionPeriodEnd(sub) {
  const items = Array.isArray(sub?.items?.data) ? sub.items.data : [];
  const ends = items
    .map((item) => Number(item?.current_period_end))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ends.length) return Math.max(...ends);
  return sub?.current_period_end ?? null;
}

/**
 * Same story for invoices: `invoice.subscription` moved to
 * `invoice.parent.subscription_details.subscription` (which may be an id or an
 * expanded object).
 */
export function getInvoiceSubscriptionId(invoice) {
  const fromParent = invoice?.parent?.subscription_details?.subscription;
  if (typeof fromParent === 'string') return fromParent;
  if (fromParent && typeof fromParent.id === 'string') return fromParent.id;
  if (typeof invoice?.subscription === 'string') return invoice.subscription;
  return null;
}

/**
 * Records the event id and reports whether this delivery is a replay. Stripe
 * retries on any non-2xx (and occasionally duplicates on success), so without
 * this a retried event would be applied twice.
 */
export async function claimEvent(supabaseAdmin, event) {
  const { error } = await supabaseAdmin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });

  if (!error) return { alreadyProcessed: false };
  if (error.code === '23505') return { alreadyProcessed: true }; // unique violation
  throw error;
}

/**
 * Drops the claim so Stripe's retry is processed instead of being mistaken for
 * a duplicate. Called when handling fails partway through.
 */
export async function releaseEvent(supabaseAdmin, event) {
  try {
    await supabaseAdmin.from('stripe_events').delete().eq('id', event.id);
  } catch {
    // Best effort: if this fails the event stays claimed and the retry is
    // dropped, which is still safer than applying an event twice.
  }
}
