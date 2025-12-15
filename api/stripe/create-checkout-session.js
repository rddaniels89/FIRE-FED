/* eslint-env node */
import { getBaseUrl, getStripe, getSupabaseAdmin, requireAuthedUser, sendError, sendJson } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { user } = await requireAuthedUser(req);

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const priceId = String(body.priceId || '').trim();
    const selectedPlan = String(body.plan || '').trim(); // optional hint

    const monthlyPrice = process.env.STRIPE_PRICE_PRO_MONTHLY;
    const annualPrice = process.env.STRIPE_PRICE_PRO_ANNUAL;

    const resolvedPriceId =
      priceId ||
      (selectedPlan === 'annual' ? annualPrice : selectedPlan === 'monthly' ? monthlyPrice : '') ||
      monthlyPrice;

    if (!resolvedPriceId) {
      return sendJson(res, 400, { error: 'Missing Stripe price id' });
    }

    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch existing subscription row (if any) to reuse Stripe customer id.
    const { data: existingRow } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id,status,plan')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existingRow?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Seed a row so the portal endpoint can find customer id even before webhook processing.
      await supabaseAdmin
        .from('subscriptions')
        .upsert(
          {
            user_id: user.id,
            stripe_customer_id: customerId,
            plan: 'pro',
            status: existingRow?.status || 'incomplete',
          },
          { onConflict: 'user_id' }
        );
    }

    const baseUrl = getBaseUrl(req);
    const successUrl = String(body.successUrl || `${baseUrl}/pro-features?checkout=success`);
    const cancelUrl = String(body.cancelUrl || `${baseUrl}/pro-features?checkout=canceled`);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan: 'pro',
        },
      },
      metadata: {
        user_id: user.id,
        plan: 'pro',
      },
    });

    return sendJson(res, 200, { url: session.url });
  } catch (error) {
    return sendError(res, error);
  }
}


