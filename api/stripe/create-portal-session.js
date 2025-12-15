/* eslint-env node */
import { getBaseUrl, getStripe, getSupabaseAdmin, requireAuthedUser, sendError, sendJson } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { user } = await requireAuthedUser(req);
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: row } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const customerId = row?.stripe_customer_id;
    if (!customerId) {
      return sendJson(res, 400, { error: 'No Stripe customer found for user' });
    }

    const baseUrl = getBaseUrl(req);
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const returnUrl = String(body.returnUrl || `${baseUrl}/pro-features`);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return sendJson(res, 200, { url: session.url });
  } catch (error) {
    return sendError(res, error);
  }
}


