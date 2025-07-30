import { createContext, useContext, useState } from 'react';

/**
 * AuthContext - Basic authentication context for FireFed SaaS
 * 
 * Provides user authentication state and Pro feature gating
 * Currently uses dummy data - will be replaced with real auth (Supabase, Auth0, etc.)
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
  // Dummy authentication state - replace with real auth later
  const [user, setUser] = useState({
    id: 'demo-user-123',
    email: 'demo@firefed.com',
    name: 'Demo User',
    isProUser: true, // Set to false to test free tier features
    subscription: {
      plan: 'pro', // 'free' | 'pro' | 'enterprise'
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      features: [
        'scenario_comparison',
        'advanced_analytics',
        'pdf_export',
        'priority_support'
      ]
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(true);

  // Helper functions for feature gating
  const hasFeature = (feature) => {
    return user?.subscription?.features?.includes(feature) || false;
  };

  const isProUser = () => {
    return user?.isProUser || false;
  };

  const isPlanActive = () => {
    if (!user?.subscription?.expiresAt) return false;
    return new Date(user.subscription.expiresAt) > new Date();
  };

  // Mock authentication functions - replace with real implementation
  const login = async (email, password) => {
    // Mock login - replace with real auth
    setIsAuthenticated(true);
    return { success: true, user };
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
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