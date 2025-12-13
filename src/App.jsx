import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Suspense, lazy, useState } from 'react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ScenarioProvider } from './contexts/ScenarioContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Footer from './components/Footer';
import AppErrorBoundary from './components/AppErrorBoundary';

const HomePage = lazy(() => import('./components/HomePage'));
const TSPForecast = lazy(() => import('./components/TSPForecast'));
const FERSPensionCalc = lazy(() => import('./components/FERSPensionCalc'));
const SummaryDashboard = lazy(() => import('./components/SummaryDashboard'));
const ScenariosPage = lazy(() => import('./components/ScenariosPage'));
const ScenarioCompare = lazy(() => import('./components/ScenarioCompare'));
const Auth = lazy(() => import('./components/Auth'));
const ProFeatures = lazy(() => import('./components/ProFeatures'));
const LegalTerms = lazy(() => import('./components/LegalTerms'));
const LegalPrivacy = lazy(() => import('./components/LegalPrivacy'));
const LegalDisclaimer = lazy(() => import('./components/LegalDisclaimer'));

function RouteLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-navy-600 mx-auto"></div>
        <p className="mt-4 text-slate-600 dark:text-slate-300">Loading...</p>
      </div>
    </div>
  );
}

function Navigation() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/tsp-forecast', label: 'TSP Forecast', icon: '📈' },
    { path: '/fers-pension', label: 'FERS Pension', icon: '💰' },
    { path: '/summary', label: 'Summary', icon: '📊' },
    { path: '/scenarios', label: 'Scenarios', icon: '💼' },
    { path: '/pro-features', label: 'Pro Features', icon: '🚀' },
  ];

  return (
    <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-3">
              <span className="text-2xl">🏛️</span>
              <span className="text-xl font-bold navy-text dark:text-navy-300">🔥 FireFed</span>
            </Link>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated && (
              <div className="flex items-baseline space-x-6">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      location.pathname === item.path
                        ? 'bg-navy-600 text-white shadow-md'
                        : 'text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
            
            {/* User Info and Logout */}
            {isAuthenticated && (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  👋 Welcome, {user?.email || user?.user_metadata?.email}
                </span>
                <button
                  onClick={logout}
                  className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-all duration-200"
                >
                  Logout
                </button>
              </div>
            )}
            
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            {/* Mobile Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-navy-500 transition-all duration-200"
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <span className="text-xl">✕</span>
              ) : (
                <span className="text-xl">☰</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-700">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-slate-50 dark:bg-slate-800">
            {isAuthenticated && (
              <>
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium transition-all duration-200 ${
                      location.pathname === item.path
                        ? 'bg-navy-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                  <div className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                    👋 Welcome, {user?.email || user?.user_metadata?.email}
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2 text-base font-medium text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-all duration-200"
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  const handleAuthSuccess = () => {
    // Auth state will be handled by the AuthContext listener
    // No need to do anything here since useAuth will automatically update
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-navy-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Auth onAuthSuccess={handleAuthSuccess} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tsp-forecast" element={<TSPForecast />} />
            <Route path="/fers-pension" element={<FERSPensionCalc />} />
            <Route path="/summary" element={<SummaryDashboard />} />
            <Route path="/scenarios" element={<ScenariosPage />} />
            <Route path="/scenarios/compare" element={<ScenarioCompare />} />
            <Route path="/pro-features" element={<ProFeatures />} />
            <Route path="/legal/terms" element={<LegalTerms />} />
            <Route path="/legal/privacy" element={<LegalPrivacy />} />
            <Route path="/legal/disclaimer" element={<LegalDisclaimer />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ScenarioProvider>
          <Router>
            <AppErrorBoundary>
              <AppContent />
            </AppErrorBoundary>
          </Router>
        </ScenarioProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
