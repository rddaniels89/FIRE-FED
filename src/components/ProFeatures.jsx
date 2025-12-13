import { useState } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/telemetry';

const ProFeatures = () => {
  const { user, isAuthenticated, isProUser } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const features = [
    {
      icon: '💾',
      title: 'Save and manage unlimited retirement scenarios',
      description: 'Create, save, and switch between multiple retirement plans. Compare different strategies side-by-side.',
      status: 'coming-soon'
    },
    {
      icon: '📄',
      title: 'Export personalized PDF reports',
      description: 'Generate professional, personalized retirement reports with your TSP, FERS, and FIRE projections.',
      status: 'coming-soon'
    },
    {
      icon: '🤖',
      title: 'Get AI-powered insights',
      description: 'Ask questions like "Can I retire at 55?" and get personalized analysis based on your federal benefits.',
      status: 'coming-soon'
    },
    {
      icon: '📊',
      title: 'Advanced retirement analytics',
      description: 'Monte Carlo simulations, inflation adjustments, and detailed scenario comparisons.',
      status: 'coming-soon'
    },
    {
      icon: '🎯',
      title: 'Retirement optimization suggestions',
      description: 'Get personalized recommendations to optimize your TSP allocation and retirement timeline.',
      status: 'coming-soon'
    },
    {
      icon: '⚡',
      title: 'Early access to new planning tools',
      description: 'Be the first to try new calculators, features, and federal retirement planning tools.',
      status: 'coming-soon'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            🚀 Pro Features Coming Soon
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Take your federal retirement planning to the next level with advanced features designed for serious planners.
          </p>
          
          {/* User Status */}
          {isAuthenticated && isProUser ? (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full text-sm font-medium mb-8">
              <span className="mr-2">✅</span>
              Pro User - Early Access Active
            </div>
          ) : isAuthenticated ? (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full text-sm font-medium mb-8">
              <span className="mr-2">⭐</span>
              Ready to Upgrade - Join the Waitlist
            </div>
          ) : (
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full text-sm font-medium mb-8">
              <span className="mr-2">⭐</span>
              Limited Beta Access - Join the Waitlist
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-start space-x-4">
                <div className="text-3xl">{feature.icon}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-3">
                    {feature.description}
                  </p>
                  <span className="inline-flex items-center px-2.5 py-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-xs font-medium rounded-full">
                    🚧 Coming Soon
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Waitlist Form / Upgrade Section */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="max-w-md mx-auto text-center">
            {isAuthenticated && isProUser ? (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  🎉 Welcome, Pro User!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  You have access to all Pro features. New features will be automatically available to you as they launch.
                </p>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-green-600 dark:text-green-400 font-medium">
                    ✅ Pro subscription active
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  🎯 Join the Pro Waitlist
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Be among the first to access these powerful features when they launch. We'll notify you as soon as Pro features are available.
                </p>
              </div>
            )}
            
            {/* Only show waitlist form for non-Pro users */}
            {!(isAuthenticated && isProUser) && (
              <form onSubmit={handleWaitlistSubmit} className="space-y-4">
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
                {isSubmitting ? (
                  <>
                    <span className="animate-spin inline-block mr-2">⏳</span>
                    Adding to waitlist...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🚀</span>
                    Join the Waitlist
                  </>
                )}
              </button>
            </form>
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

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              We respect your privacy. Your email will only be used to notify you about Pro features.
            </p>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mt-16 text-center">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            Why join the Pro waitlist?
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