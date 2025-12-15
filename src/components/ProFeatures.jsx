import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/telemetry';

const PRO_MONTHLY_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY || '';
const PRO_ANNUAL_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_PRO_ANNUAL || '';

const ProFeatures = () => {
  const { isAuthenticated, isProUser, subscription, subscriptionLoading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBillingAction, setIsBillingAction] = useState(false);
  const [message, setMessage] = useState('');

  const handleWaitlistSubmit = async (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      if (isSupabaseAvailable) {
        const { error } = await supabase
          .from('waitlist')
          .insert([{ 
            email: email.trim(),
            submitted_at: new Date().toISOString()
          }]);

        if (error) {
          // Check if email already exists
          if (error.code === '23505') {
            setMessage('✅ You\'re already on the waitlist! We\'ll notify you when Pro features launch.');
            trackEvent('pro_waitlist_submit', { status: 'duplicate' });
          } else {
            throw error;
          }
        } else {
          setMessage('🎉 Success! You\'ve been added to the Pro features waitlist.');
          trackEvent('pro_waitlist_submit', { status: 'success' });
          setEmail('');
        }
      } else {
        // Fallback when Supabase not available
        const existingWaitlist = JSON.parse(localStorage.getItem('pro-waitlist') || '[]');
        
        if (existingWaitlist.includes(email.trim())) {
          setMessage('✅ You\'re already on the waitlist! We\'ll notify you when Pro features launch.');
          trackEvent('pro_waitlist_submit', { status: 'duplicate', storage: 'local' });
        } else {
          existingWaitlist.push(email.trim());
          localStorage.setItem('pro-waitlist', JSON.stringify(existingWaitlist));
          setMessage('🎉 Success! You\'ve been added to the Pro features waitlist.');
          trackEvent('pro_waitlist_submit', { status: 'success', storage: 'local' });
          setEmail('');
        }
      }
    } catch (error) {
      console.error('Error adding to waitlist:', error);
      setMessage('❌ Something went wrong. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const subscriptionStatus = (subscription?.status || '').toString().toLowerCase();
  const isSubscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isSubscriptionPastDue = subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid';
  const isSubscriptionCanceled = subscriptionStatus === 'canceled' || subscriptionStatus === 'incomplete_expired';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;

    if (checkout === 'success') {
      setMessage('✅ Payment complete. Your Pro access should unlock shortly.');
      trackEvent('pro_checkout_return', { status: 'success' });
    } else if (checkout === 'canceled') {
      setMessage('ℹ️ Checkout canceled. You can upgrade anytime.');
      trackEvent('pro_checkout_return', { status: 'canceled' });
    }
  }, []);

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
    setMessage('');
    setIsBillingAction(true);
    try {
      if (!isSupabaseAvailable) {
        setMessage('❌ Billing is unavailable without Supabase configured.');
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage('❌ Please sign in again to upgrade.');
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
      setMessage(`❌ ${err?.message || 'Unable to start checkout.'}`);
      trackEvent('pro_checkout_failed', { message: err?.message || 'unknown' });
    } finally {
      setIsBillingAction(false);
    }
  };

  const openBillingPortal = async () => {
    setMessage('');
    setIsBillingAction(true);
    try {
      if (!isSupabaseAvailable) {
        setMessage('❌ Billing is unavailable without Supabase configured.');
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage('❌ Please sign in again to manage your subscription.');
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
      setMessage(`❌ ${err?.message || 'Unable to open billing portal.'}`);
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
            ⭐ Upgrade to Pro
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Unlock powerful tools for serious federal retirement planners.
          </p>
          
          {/* User Status */}
          {isAuthenticated && isProUser ? (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full text-sm font-medium mb-3">
              <span className="mr-2">✅</span>
              Pro Active
            </div>
          ) : (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full text-sm font-medium mb-3">
              <span className="mr-2">⭐</span>
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
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-sm border border-slate-200 dark:border-slate-700 mb-10">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                ✅ Available now with Pro
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Unlimited scenarios</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">No free-tier cap</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">PDF export</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">From the Summary dashboard</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Scenario comparison</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Side-by-side metrics</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Export / import</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Scenario JSON bundle</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Monte Carlo analytics</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Probabilities + percentiles</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Optimization tools</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Suggestions + allocation presets</div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                🛠️ Coming next
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">AI insights</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Q&A on your scenario</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <div className="font-medium text-slate-900 dark:text-white">Deeper analytics</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">More charts and stress tests</div>
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
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-sm border border-slate-200 dark:border-slate-700">
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
                  <div className="text-green-700 dark:text-green-300 font-semibold mb-2">✅ Pro is active</div>
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
                  <button
                    onClick={openBillingPortal}
                    disabled={isBillingAction || subscriptionLoading}
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
                    <li>✅ Unlimited scenarios</li>
                    <li>✅ PDF export</li>
                    <li>✅ Compare scenarios</li>
                    <li>✅ Export / import scenarios</li>
                    <li>✅ Advanced analytics + optimization</li>
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
                    <li>✅ Everything in Monthly</li>
                    <li>✅ Save 17% vs monthly</li>
                    <li>✅ Priority access to new tools</li>
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

            {/* Optional waitlist (discounts / early access) */}
            {!isProUser && (
              <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Get launch promos</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Want a discount or beta access? Join the waitlist.
                  </p>
                </div>

                <form onSubmit={handleWaitlistSubmit} className="max-w-md mx-auto space-y-4">
                  <div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Adding…' : 'Join waitlist'}
                  </button>
                </form>
              </div>
            )}

            {message && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                message.includes('Success') || message.includes('already') 
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
              }`}>
                {message}
              </div>
            )}

            {!isProUser && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
                We respect your privacy. Your email will only be used for Pro-related updates.
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
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-2xl mb-2">🎁</div>
              <div className="font-medium text-gray-900 dark:text-white">Early Access</div>
              <div className="text-gray-600 dark:text-gray-300">Be first to try new features</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-2xl mb-2">💰</div>
              <div className="font-medium text-gray-900 dark:text-white">Special Pricing</div>
              <div className="text-gray-600 dark:text-gray-300">Exclusive launch discounts</div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-2xl mb-2">🗣️</div>
              <div className="font-medium text-gray-900 dark:text-white">Shape Features</div>
              <div className="text-gray-600 dark:text-gray-300">Your feedback matters</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProFeatures;