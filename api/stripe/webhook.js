/* eslint-env node */
import { getStripe, getSupabaseAdmin, sendError, sendJson } from './_shared.js';
import {
  claimEvent,
  getInvoiceSubscriptionId,
  getSubscriptionPeriodEnd,
  releaseEvent,
} from './_events.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function toIsoFromUnixSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

async function resolveUserId({ supabaseAdmin, stripeCustomerId, stripeSubscriptionId, metadataUserId }) {
  if (metadataUserId) return metadataUserId;

  if (stripeSubscriptionId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  return null;
}

export async function upsertSubscriptionRow(supabaseAdmin, row) {
  // Service role bypasses RLS; do not expose this key to the client.
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' });

  // supabase-js resolves rather than rejects on a database error, so an
  // unchecked call here loses the write silently: Stripe gets a 200, the event
  // is recorded as processed, and a customer who paid never receives Pro.
  // Throwing releases the event claim and returns 5xx, so Stripe retries.
  if (error) throw error;
}

/**
 * Writes subscription state straight from the Stripe object, which is the
 * authoritative status. Used by every event type so that events arriving out of
 * order cannot leave a stale status behind.
 */
async function syncSubscriptionFromStripe({ supabaseAdmin, sub, userId, fallbackCustomerId = null }) {
  if (!sub) return;

  // An unresolvable user means a live Stripe subscription with no row to grant
  // Pro from. Logged rather than thrown: retrying cannot invent the mapping,
  // and a permanently failing endpoint is one Stripe eventually disables.
  if (!userId) {
    console.error('Stripe subscription could not be mapped to a user', {
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : fallbackCustomerId,
      status: sub.status,
    });
    return;
  }

  await upsertSubscriptionRow(supabaseAdmin, {
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : fallbackCustomerId,
    stripe_subscription_id: sub.id,
    plan: (sub?.metadata?.plan || 'pro').toString(),
    status: sub.status,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: toIsoFromUnixSeconds(getSubscriptionPeriodEnd(sub)),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return sendJson(res, 500, { error: 'Stripe webhook not configured' });
    }

    const rawBody = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    if (!sig) return sendJson(res, 400, { error: 'Missing stripe-signature header' });

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      err.statusCode = 400;
      throw err;
    }

    const { alreadyProcessed } = await claimEvent(supabaseAdmin, event);
    if (alreadyProcessed) {
      return sendJson(res, 200, { received: true, duplicate: true });
    }

    // Handle relevant events by upserting Supabase subscription state.
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const userId = session.client_reference_id || session?.metadata?.user_id || null;
          const customerId = typeof session.customer === 'string' ? session.customer : null;
          const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;

          if (!userId) break;

          if (subscriptionId) {
            // Read the real status rather than assuming 'incomplete'. If
            // customer.subscription.updated already landed, writing a guessed
            // status here would knock an active subscriber back to unpaid.
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            await syncSubscriptionFromStripe({
              supabaseAdmin,
              sub,
              userId,
              fallbackCustomerId: customerId,
            });
          } else {
            await upsertSubscriptionRow(supabaseAdmin, {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: null,
              plan: 'pro',
              status: 'incomplete',
            });
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : null;

          const userId = await resolveUserId({
            supabaseAdmin,
            stripeCustomerId,
            stripeSubscriptionId: sub.id,
            metadataUserId: sub?.metadata?.user_id || null,
          });

          await syncSubscriptionFromStripe({
            supabaseAdmin,
            sub,
            userId,
            fallbackCustomerId: stripeCustomerId,
          });
          break;
        }

        case 'invoice.paid':
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : null;
          const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);

          if (!stripeSubscriptionId) break;

          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const userId = await resolveUserId({
            supabaseAdmin,
            stripeCustomerId,
            stripeSubscriptionId,
            metadataUserId: sub?.metadata?.user_id || null,
          });

          await syncSubscriptionFromStripe({
            supabaseAdmin,
            sub,
            userId,
            fallbackCustomerId: stripeCustomerId,
          });
          break;
        }

        default:
          // Ignore other event types.
          break;
      }
    } catch (handlerError) {
      await releaseEvent(supabaseAdmin, event);
      throw handlerError;
    }

    return sendJson(res, 200, { received: true });
  } catch (error) {
    return sendError(res, error);
  }
}
