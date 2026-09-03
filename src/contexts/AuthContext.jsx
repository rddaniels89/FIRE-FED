import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { getEntitlements, hasEntitlement } from '../lib/entitlements';
import { isActiveSubscriptionStatus, isLocalOnlyUser, isProFromTrustedMetadata } from '../lib/auth/session';
import { resolveWithTimeout } from '../lib/auth/withTimeout';
import { identifyUser, resetIdentity, trackEvent } from '../lib/telemetry';

/**
 * AuthContext - Authentication context for FireFed SaaS with Supabase integration
 *
 * Provides user authentication state, Stripe subscription state, and Pro feature gating.
 */
const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const bypassAuth = import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH === 'true';
  const bypassPro = import.meta.env.DEV && import.meta.env.VITE_BYPASS_PRO === 'true';

  const refreshSubscription = useCallback(async (userId) => {
    const id = userId;
    if (!id || !isSupabaseAvailable || isLocalOnlyUser({ id })) {
      setSubscription(null);
      setSubscriptionLoading(false);
      return;
    }

    setSubscriptionLoading(true);
    try {
      // Bounded as well as the lock beneath it. subscriptionLoading gates the
      // upgrade buttons, so a query that never settles leaves a paying customer
      // looking at a dead page with no way forward.
      const { timedOut, value } = await resolveWithTimeout(
        supabase.from('subscriptions').select('*').eq('user_id', id).maybeSingle(),
        {
          fallback: { data: null, error: null },
          onTimeout: () => console.warn('Subscription lookup timed out; treating Pro status as unknown.'),
        }
      );

      if (timedOut) {
        setSubscription(null);
        return;
      }

      const { data, error } = value;

      if (error) {
        console.error('Error loading subscription:', error);
        setSubscription(null);
      } else {
        setSubscription(data || null);
      }
    } catch (error) {
      console.error('Subscription fetch error:', error);
      setSubscription(null);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  const isProUser = () => {
    if (!user) return false;
    if (bypassPro) return true;
    if (subscription && isActiveSubscriptionStatus(subscription.status)) return true;
    return isProFromTrustedMetadata(user);
  };

  const entitlements = getEntitlements({ isAuthenticated, isProUser: isProUser() });

  const hasFeature = (feature) => hasEntitlement(entitlements, feature);

  const isPlanActive = () => isAuthenticated;

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (bypassAuth) {
          const mockUser = {
            id: 'dev-bypass',
            email: 'dev@local',
            user_metadata: { email: 'dev@local' },
            app_metadata: bypassPro ? { subscription_plan: 'pro' } : {},
          };
          setUser(mockUser);
          setIsAuthenticated(true);
          return;
        }

        if (isSupabaseAvailable) {
          // Bounded rather than awaited outright: getSession() can hang forever
          // on a held Web Lock, and an unbounded await here leaves the app on
          // its spinner with no error to catch. On timeout we render the signed
          // -out view; onAuthStateChange still fires when the lock frees and
          // signs the user back in without a reload.
          const { timedOut, value } = await resolveWithTimeout(supabase.auth.getSession(), {
            fallback: { data: { session: null } },
            onTimeout: () =>
              console.warn(
                'Auth session lookup timed out. Rendering signed-out; the auth listener will recover the session if it arrives.'
              ),
          });

          if (timedOut) {
            trackEvent('auth_session_timeout');
          }

          const session = value?.data?.session ?? null;
          if (session?.user) {
            setUser(session.user);
            setIsAuthenticated(true);
            identifyUser(session.user.id);
            await refreshSubscription(session.user.id);
          }
        } else {
          const savedUser = localStorage.getItem('auth-user');
          if (savedUser) {
            const parsedUser = JSON.parse(savedUser);
            setUser(parsedUser);
            setIsAuthenticated(true);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    if (!bypassAuth && isSupabaseAvailable) {
      const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (session?.user) {
            setUser(session.user);
            setIsAuthenticated(true);
            identifyUser(session.user.id);
            await refreshSubscription(session.user.id);
          } else {
            setUser(null);
            setIsAuthenticated(false);
            setSubscription(null);
            resetIdentity();
          }
          setLoading(false);
        }
      );

      return () => authListener.unsubscribe();
    }
  }, [bypassAuth, bypassPro, refreshSubscription]);
  // refreshSubscription is stable (empty deps); bypass flags are dev-only constants per build.

  const login = async (email, password) => {
    try {
      if (isSupabaseAvailable) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await refreshSubscription(data.user?.id);
        return { success: true, user: data.user };
      }

      const mockUser = {
        id: 'guest-' + Date.now(),
        email: email || 'guest@example.com',
        user_metadata: { email: email || 'guest@example.com' },
      };
      localStorage.setItem('auth-user', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAuthenticated(true);
      return { success: true, user: mockUser };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const loginAsGuest = async () => {
    try {
      const mockUser = {
        id: 'guest-' + Date.now(),
        email: 'guest@local',
        user_metadata: { email: 'guest@local', guest: true },
      };
      localStorage.setItem('auth-user', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAuthenticated(true);
      setSubscription(null);
      return { success: true, user: mockUser };
    } catch (error) {
      console.error('Guest login error:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      if (isSupabaseAvailable) {
        await supabase.auth.signOut();
      } else {
        localStorage.removeItem('auth-user');
      }
      setUser(null);
      setIsAuthenticated(false);
      setSubscription(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    subscription,
    subscriptionLoading,
    refreshSubscription,
    isProUser: isProUser(),
    entitlements,
    hasFeature,
    isPlanActive: isPlanActive(),
    login,
    loginAsGuest,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
