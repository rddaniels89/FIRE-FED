import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check } from 'lucide-react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, FEATURE_LABELS } from '../lib/entitlements';
import { trackEvent } from '../lib/telemetry';

// The tone is carried alongside the text rather than inferred from a leading
// glyph, so the copy can stay plain without the styling drifting from it.
const messageToneClasses = (tone) => {
  if (tone === 'error') return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300';
  if (tone === 'success') return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300';
  return 'bg-slate-100 dark:bg-slate-700/40 text-slate-800 dark:text-slate-200';
};

/**
 * What Pro includes. `FEATURES` in lib/entitlements is the authoritative list —
 * this map only adds a one-line gloss per key, so a shipped feature cannot go
 * missing from this page the way stress tests, bridge strategies, household
 * modeling, the career simulator and IRMAA all had.
 */
const FEATURE_NOTES = Object.freeze({
  [FEATURES.UNLIMITED_SCENARIOS]: 'No free-tier cap',
  [FEATURES.PDF_EXPORT]: 'Multi-page report from the Summary screen',
  [FEATURES.SCENARIO_COMPARE]: 'Side-by-side with what changed between them',
  [FEATURES.ADVANCED_ANALYTICS]: 'Success rates and percentile balances',
  [FEATURES.OPTIMIZATION]: 'One change at a time, run through the timeline',
  [FEATURES.STRESS_TESTS]: 'An early crash, high inflation, a lower return',
  [FEATURES.BRIDGE_STRATEGIES]: 'Reach the TSP before 59½ without the penalty',
  [FEATURES.HOUSEHOLD]: 'A second person, federal or not',
  [FEATURES.CAREER_SIMULATOR]: 'GS grade, step and locality over time',
  [FEATURES.IRMAA]: 'The Medicare surcharge your income triggers',
});

const PRO_FEATURE_KEYS = Object.values(FEATURES);

const PRO_MONTHLY_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY || '';
const PRO_ANNUAL_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_PRO_ANNUAL || '';

const ProFeatures = () => {
  const { user, isAuthenticated, isProUser, subscription, subscriptionLoading, refreshSubscription } = useAuth();
  const location = useLocation();
  const [isBillingAction, setIsBillingAction] = useState(false);
  const [message, setMessage] = useState(null);

  const subscriptionStatus = (subscription?.status || '').toString().toLowerCase();
  const isSubscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isSubscriptionPastDue = subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid';
  const isSubscriptionCanceled = subscriptionStatus === 'canceled' || subscriptionStatus === 'incomplete_expired';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;

    if (checkout === 'success') {
      setMessage({ tone: 'success', text: 'Payment complete. Your Pro access should unlock shortly.' });
      trackEvent('pro_checkout_return', { status: 'success' });
      // Must carry the user id: refreshSubscription treats a missing one as
      // "no user" and clears the subscription, which would blank out the Pro
      // state on the very screen meant to confirm the payment.
      refreshSubscription?.(user?.id);
    } else if (checkout === 'canceled') {
      setMessage({ tone: 'info', text: 'Checkout canceled. You can upgrade anytime.' });
      trackEvent('pro_checkout_return', { status: 'canceled' });
    }
  }, [refreshSubscription, user?.id]);

  const reasonHint = useMemo(() => {
    const reason = location.state?.reason;
    if (!reason) return null;
    if (reason === 'scenario_limit') return `You’ve hit the free scenario limit (${location.state?.limit || 3}). Upgrade to Pro for unlimited scenarios.`;
    if (reason === 'compare_pro') return 'Scenario comparison is a Pro feature.';
    if (reason === 'export_import_pro') return 'Export/import scenarios is a Pro feature.';
    if (reason === 'pdf_export_pro') return 'PDF export is a Pro feature.';
    if (reason === 'advanced_analytics_pro') return 'Advanced analytics (Monte Carlo simulations) is a Pro feature.';
    if (reason === 'optimization_pro') return 'Optimization suggestions are a Pro feature.';
    return null;
  }, [location.state]);

  const getAccessToken = async () => {
    if (!isSupabaseAvailable) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const startCheckout = async ({ plan }) => {
    setMessage(null);
    setIsBillingAction(true);
    try {
      if (!isSupabaseAvailable) {
        setMessage({ tone: 'error', text: 'Billing is unavailable without Supabase configured.' });
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage({ tone: 'error', text: 'Please sign in again to upgrade.' });
        return;
      }

      const priceId = plan === 'annual' ? PRO_ANNUAL_PRICE_ID : PRO_MONTHLY_PRICE_ID;
      const resp = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          plan,
          priceId: priceId || undefined,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || 'Failed to start checkout');
      if (!json?.url) throw new Error('Missing checkout URL');

      trackEvent('pro_checkout_started', { plan });
      window.location.assign(json.url);
    } catch (err) {
      console.error(err);
      setMessage({ tone: 'error', text: err?.message || 'Unable to start checkout.' });
      trackEvent('pro_checkout_failed', { message: err?.message || 'unknown' });
    } finally {
      setIsBillingAction(false);
    }
  };

  const openBillingPortal = async () => {
    setMessage(null);
    setIsBillingAction(true);
    try {
      if (!isSupabaseAvailable) {
        setMessage({ tone: 'error', text: 'Billing is unavailable without Supabase configured.' });
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage({ tone: 'error', text: 'Please sign in again to manage your subscription.' });
        return;
      }

      const resp = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || 'Failed to open billing portal');
      if (!json?.url) throw new Error('Missing portal URL');

      trackEvent('pro_billing_portal_opened');
      window.location.assign(json.url);
    } catch (err) {
      console.error(err);
      setMessage({ tone: 'error', text: err?.message || 'Unable to open billing portal.' });
      trackEvent('pro_billing_portal_failed', { message: err?.message || 'unknown' });
    } finally {
      setIsBillingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Upgrade to Pro
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Unlock powerful tools for serious federal retirement planners.
          </p>
          
          {/* User Status */}
          {isAuthenticated && isProUser ? (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full text-sm font-medium mb-3">
              Pro active
            </div>
          ) : (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full text-sm font-medium mb-3">
              Upgrade to Pro
            </div>
          )}

          <div className="text-sm text-slate-600 dark:text-slate-300">
            {subscriptionLoading ? (
              <span>Checking subscription status…</span>
            ) : subscription ? (
              <span>
                Subscription status: <span className="font-medium">{subscriptionStatus || 'unknown'}</span>
                {subscription?.cancel_at_period_end ? ' (cancels at period end)' : ''}
              </span>
            ) : (
              <span>No active subscription on file.</span>
            )}
          </div>

          {reasonHint && (
            <div className="mt-4 mx-auto max-w-2xl rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
              {reasonHint}
            </div>
          )}
        </div>

        {/* What you get */}
        <div className="card p-8 mb-10">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Available now with Pro</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {PRO_FEATURE_KEYS.map((key) => (
                  <div
                    key={key}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3"
                  >
                    <div className="font-medium text-slate-900 dark:text-white">{FEATURE_LABELS[key]}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">{FEATURE_NOTES[key]}</div>
                  </div>
                ))}
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Export and import</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Scenario JSON bundle</div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Coming next</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Scenario Q&amp;A</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Ask questions of your own numbers</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">More charts</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">More ways to read the timeline</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:col-span-2">
                  <div className="font-medium text-slate-900 dark:text-white">More optimization</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Richer tradeoff exploration</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Section */}
        <div className="card p-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {isProUser ? 'Manage Pro' : 'Upgrade to Pro'}
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Unlock unlimited scenarios, PDF reports, scenario tools, and advanced analytics.
              </p>
              {isSubscriptionPastDue && (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                  Your subscription is past due. Manage billing to restore Pro access.
                </p>
              )}
              {isSubscriptionCanceled && (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Your subscription is canceled. You can restart anytime.
                </p>
              )}
            </div>

            {isProUser ? (
              <div className="grid md:grid-cols-2 gap-6 items-start">
                <div className="bg-green-50 dark:bg-green-900/20 p-5 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="text-green-700 dark:text-green-300 font-semibold mb-2">Pro is active</div>
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Status: <span className="font-medium">{subscriptionStatus || 'active'}</span>
                  </div>
                  {subscription?.current_period_end && (
                    <div className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                      Renews/ends: <span className="font-medium">{new Date(subscription.current_period_end).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="font-semibold text-slate-900 dark:text-white mb-2">Billing</div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Update your payment method, cancel, or download invoices.
                  </p>
                  {/*
                    Deliberately not gated on subscriptionLoading: the portal
                    needs only a Stripe customer id, which the server looks up
                    itself. A stalled status check must never be what stops
                    someone cancelling — that turns into a chargeback.
                  */}
                  <button
                    onClick={openBillingPortal}
                    disabled={isBillingAction}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {isBillingAction ? 'Opening…' : 'Manage subscription'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">Monthly</div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white mt-2">$9.99</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">per month</div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    {PRO_FEATURE_KEYS.map((key) => (
                      <li key={key} className="flex items-start gap-2">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                        <span>{FEATURE_LABELS[key]}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => startCheckout({ plan: 'monthly' })}
                    disabled={isBillingAction || subscriptionLoading || (isSubscriptionActive && !isSubscriptionCanceled)}
                    className="btn-primary w-full mt-6 disabled:opacity-50"
                  >
                    {isBillingAction ? 'Redirecting…' : 'Upgrade monthly'}
                  </button>
                </div>

                <div className="rounded-xl border border-gold-200 dark:border-gold-700 bg-gradient-to-br from-gold-50 to-white dark:from-gold-900/20 dark:to-slate-900 p-6">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-slate-900 dark:text-white">Annual</div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gold-200/70 dark:bg-gold-900/40 text-gold-900 dark:text-gold-200 border border-gold-300 dark:border-gold-700">
                      Best value
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white mt-2">$99</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">per year</div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    {['Everything in Monthly', 'Save 17% against monthly', 'Early access to new tools'].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => startCheckout({ plan: 'annual' })}
                    disabled={isBillingAction || subscriptionLoading}
                    className="btn-primary w-full mt-6 disabled:opacity-50"
                  >
                    {isBillingAction ? 'Redirecting…' : 'Upgrade annually'}
                  </button>
                </div>
              </div>
            )}

            {message && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${messageToneClasses(message.tone)}`} role="status">
                {message.text}
              </div>
            )}

            {!isProUser && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
                Payments are handled by Stripe. Cancel anytime from the billing portal.
              </p>
            )}
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mt-16 text-center">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            Why upgrade to Pro?
          </h3>
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="font-medium text-gray-900 dark:text-white">Early access</div>
              <div className="text-gray-600 dark:text-gray-300">New tools reach Pro first</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="font-medium text-gray-900 dark:text-white">Launch pricing</div>
              <div className="text-gray-600 dark:text-gray-300">Current rates are held while in launch</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="font-medium text-gray-900 dark:text-white">Shape what ships</div>
              <div className="text-gray-600 dark:text-gray-300">Pro feedback drives the roadmap</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProFeatures;