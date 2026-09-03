/* eslint-env node */
import { getBaseUrl, getStripe, getSupabaseAdmin, requireAuthedUser, resolveUsableCustomerId, sendError, sendJson } from './_shared.js';

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

    const customerId = await resolveUsableCustomerId({
      stripe,
      storedCustomerId: row?.stripe_customer_id,
    });

    if (!customerId) {
      // Drop the dead reference so the next checkout mints a fresh customer
      // instead of failing on the same id. Without this the user is stuck
      // between a portal that cannot open and a checkout that cannot start.
      if (row?.stripe_customer_id) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ stripe_customer_id: null })
          .eq('user_id', user.id);
      }

      return sendJson(res, 409, {
        error: 'Your billing profile is no longer available. Start a new subscription to continue.',
      });
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


