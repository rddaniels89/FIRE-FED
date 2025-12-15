import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { getEntitlements, hasEntitlement } from '../lib/entitlements';

/**
 * AuthContext - Authentication context for FireFed SaaS with Supabase integration
 * 
 * Provides user authentication state and Pro feature gating
 * Uses Supabase for real authentication with localStorage fallback
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

  // Check for existing session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (isSupabaseAvailable) {
          // Check for existing Supabase session
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser(session.user);
            setIsAuthenticated(true);
          }
        } else {
          // Check localStorage for fallback auth
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

    // Set up auth state listener for Supabase
    if (isSupabaseAvailable) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session?.user) {
            setUser(session.user);
            setIsAuthenticated(true);
          } else {
            setUser(null);
            setIsAuthenticated(false);
          }
          setLoading(false);
        }
      );

      return () => subscription.unsubscribe();
    }
  }, []);

  // Load subscription status (Stripe-synced) from Supabase when authenticated.
  useEffect(() => {
    const loadSubscription = async () => {
      if (!isSupabaseAvailable || !isAuthenticated || !user?.id) {
        setSubscription(null);
        setSubscriptionLoading(false);
        return;
      }

      setSubscriptionLoading(true);
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        setSubscription(data || null);
      } catch (err) {
        // If the table isn't deployed yet or RLS is misconfigured, fall back to metadata checks.
        console.warn('Failed to load subscription row:', err?.message || err);
        setSubscription(null);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    loadSubscription();
  }, [isAuthenticated, user?.id]);

  const isProUser = useMemo(() => {
    if (!user) return false;

    const userMetadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};

    const subscriptionStatus = (subscription?.status || '').toString().toLowerCase();
    const subscriptionPlan = (subscription?.plan || '').toString().toLowerCase();
    const subscriptionIsActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
    const subscriptionIsPro = !subscriptionPlan || subscriptionPlan === 'pro';

    // Prefer Stripe-synced subscription state when available.
    if (isSupabaseAvailable && subscription) {
      return subscriptionIsActive && subscriptionIsPro;
    }

    // Fallback: allow metadata-based Pro (dev/manual override).
    return userMetadata.subscription_plan === 'pro' ||
           appMetadata.subscription_plan === 'pro' ||
           userMetadata.role === 'pro' ||
           appMetadata.role === 'pro';
  }, [user, subscription]);

  // Helper functions for feature gating
  const entitlements = useMemo(
    () => getEntitlements({ isAuthenticated, isProUser }),
    [isAuthenticated, isProUser]
  );

  const hasFeature = useCallback(
    (feature) => hasEntitlement(entitlements, feature),
    [entitlements]
  );

  const isPlanActive = isAuthenticated;

  // Authentication functions with Supabase integration
  const login = useCallback(async (email, password) => {
    try {
      if (isSupabaseAvailable) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        return { success: true, user: data.user };
      } else {
        // Fallback to localStorage
        const mockUser = {
          id: 'guest-' + Date.now(),
          email: email || 'guest@example.com',
          user_metadata: { email: email || 'guest@example.com' }
        };
        localStorage.setItem('auth-user', JSON.stringify(mockUser));
        setUser(mockUser);
        setIsAuthenticated(true);
        return { success: true, user: mockUser };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (isSupabaseAvailable) {
        await supabase.auth.signOut();
      } else {
        localStorage.removeItem('auth-user');
      }
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  const upgradeToPro = useCallback(async () => {
    try {
      if (isSupabaseAvailable && user) {
        // Update user metadata in Supabase
        const { error } = await supabase.auth.updateUser({
          data: { 
            subscription_plan: 'pro',
            upgraded_at: new Date().toISOString()
          }
        });
        
        if (error) throw error;
        
        // Update local user state
        setUser(prev => ({
          ...prev,
          user_metadata: {
            ...prev.user_metadata,
            subscription_plan: 'pro',
            upgraded_at: new Date().toISOString()
          }
        }));
      } else {
        // Fallback for localStorage
        const updatedUser = {
          ...user,
          user_metadata: {
            ...user.user_metadata,
            subscription_plan: 'pro',
            upgraded_at: new Date().toISOString()
          }
        };
        localStorage.setItem('auth-user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Upgrade error:', error);
      return { success: false, error: error.message };
    }
  }, [user]);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    loading,
    isProUser,
    subscription,
    subscriptionLoading,
    entitlements,
    hasFeature,
    isPlanActive,
    login,
    logout,
    upgradeToPro
  }), [user, isAuthenticated, loading, isProUser, subscription, subscriptionLoading, entitlements, hasFeature, isPlanActive, login, logout, upgradeToPro]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 