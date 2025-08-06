import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';

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

  // Helper functions for feature gating
  const hasFeature = (feature) => {
    // For now, all authenticated users have access to basic features
    // You can implement subscription logic here later
    const basicFeatures = ['scenario_comparison', 'pdf_export'];
    return isAuthenticated && basicFeatures.includes(feature);
  };

  const isProUser = () => {
    // For now, all authenticated users are considered "pro"
    // You can implement subscription logic here later
    return isAuthenticated;
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
    // Mock upgrade - replace with real payment processing
    setUser(prev => ({
      ...prev,
      isProUser: true,
      subscription: {
        plan: 'pro',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        features: [
          'scenario_comparison',
          'advanced_analytics',
          'pdf_export',
          'priority_support',
          'unlimited_scenarios'
        ]
      }
    }));
    return { success: true };
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    isProUser: isProUser(),
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