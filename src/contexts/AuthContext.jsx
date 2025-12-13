import { createContext, useContext, useState, useEffect } from 'react';
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
  // Never allow bypass in production builds.
  const bypassAuth = import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH === 'true';
  const bypassPro = import.meta.env.DEV && import.meta.env.VITE_BYPASS_PRO === 'true';

  // Check for existing session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Dev-only bypass to allow viewing the full UI without signing in
        if (bypassAuth) {
          const mockUser = {
            id: 'dev-bypass',
            email: 'dev@local',
            user_metadata: {
              email: 'dev@local',
              ...(bypassPro ? { subscription_plan: 'pro' } : {}),
            },
          };
          setUser(mockUser);
          setIsAuthenticated(true);
          return;
        }

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
    if (!bypassAuth && isSupabaseAvailable) {
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

  const isProUser = () => {
    // Check if user has pro role/subscription
    // This can be enhanced with Supabase user metadata or separate subscription table
    if (!user) return false;
    
    // Check user metadata for pro subscription
    const userMetadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};
    
    // Check for pro subscription in metadata
    return userMetadata.subscription_plan === 'pro' || 
           appMetadata.subscription_plan === 'pro' ||
           userMetadata.role === 'pro' ||
           appMetadata.role === 'pro';
  };

  // Helper functions for feature gating
  const entitlements = getEntitlements({ isAuthenticated, isProUser: isProUser() });

  const hasFeature = (feature) => {
    return hasEntitlement(entitlements, feature);
  };

  const isPlanActive = () => {
    return isAuthenticated;
  };

  // Authentication functions with Supabase integration
  const login = async (email, password) => {
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
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const upgradeToPro = async () => {
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
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    isProUser: isProUser(),
    entitlements,
    hasFeature,
    isPlanActive: isPlanActive(),
    login,
    logout,
    upgradeToPro
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 