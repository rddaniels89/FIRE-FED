/* eslint-env node */
import { getStripe, getSupabaseAdmin, sendError, sendJson } from './_shared.js';

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

async function upsertSubscriptionRow(supabaseAdmin, row) {
  // Service role bypasses RLS; do not expose this key to the client.
  await supabaseAdmin.from('subscriptions').upsert(row, { onConflict: 'user_id' });
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

    // Handle relevant events by upserting Supabase subscription state.
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session?.metadata?.user_id || null;
        const customerId = typeof session.customer === 'string' ? session.customer : null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;

        if (userId) {
          await upsertSubscriptionRow(supabaseAdmin, {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
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
        const stripeSubscriptionId = sub.id;
        const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : null;
        const metadataUserId = sub?.metadata?.user_id || null;

        const userId = await resolveUserId({
          supabaseAdmin,
          stripeCustomerId,
          stripeSubscriptionId,
          metadataUserId,
        });

        if (userId) {
          await upsertSubscriptionRow(supabaseAdmin, {
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            plan: (sub?.metadata?.plan || 'pro').toString(),
            status: sub.status,
            cancel_at_period_end: Boolean(sub.cancel_at_period_end),
            current_period_end: toIsoFromUnixSeconds(sub.current_period_end),
          });
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : null;
        const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;

        if (stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const userId = await resolveUserId({
            supabaseAdmin,
            stripeCustomerId,
            stripeSubscriptionId,
            metadataUserId: sub?.metadata?.user_id || null,
          });
          if (userId) {
            await upsertSubscriptionRow(supabaseAdmin, {
              user_id: userId,
              stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : stripeCustomerId,
              stripe_subscription_id: sub.id,
              plan: (sub?.metadata?.plan || 'pro').toString(),
              status: sub.status,
              cancel_at_period_end: Boolean(sub.cancel_at_period_end),
              current_period_end: toIsoFromUnixSeconds(sub.current_period_end),
            });
          }
        }
        break;
      }

      default:
        // Ignore other event types.
        break;
    }

    return sendJson(res, 200, { received: true });
  } catch (error) {
    return sendError(res, error);
  }
}


