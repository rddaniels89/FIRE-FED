import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ScenarioProvider } from './contexts/ScenarioContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  Home as HomeIcon,
  Route as RouteIcon,
  TrendingUp,
  Landmark,
  LayoutDashboard,
  Layers,
  Sparkles,
  Menu as MenuIcon,
  X as XIcon,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import AnimatedFlame from './components/AnimatedFlame';
import Footer from './components/Footer';
import AppErrorBoundary from './components/AppErrorBoundary';
import CloudSyncBanner from './components/CloudSyncBanner';
import { trackPageView } from './lib/telemetry';

const HomePage = lazy(() => import('./components/HomePage'));
const TSPForecast = lazy(() => import('./components/TSPForecast'));
const FERSPensionCalc = lazy(() => import('./components/FERSPensionCalc'));
const SummaryDashboard = lazy(() => import('./components/SummaryDashboard'));
const ScenariosPage = lazy(() => import('./components/ScenariosPage'));
const ScenarioCompare = lazy(() => import('./components/ScenarioCompare'));
const Auth = lazy(() => import('./components/Auth'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const ProFeatures = lazy(() => import('./components/ProFeatures'));
const LegalTerms = lazy(() => import('./components/LegalTerms'));
const LegalPrivacy = lazy(() => import('./components/LegalPrivacy'));
const LegalDisclaimer = lazy(() => import('./components/LegalDisclaimer'));
const PublicLayout = lazy(() => import('./components/public/PublicLayout'));
const LandingPage = lazy(() => import('./components/public/LandingPage'));
const PricingPage = lazy(() => import('./components/public/PricingPage'));
const PublicFersCalculator = lazy(() => import('./components/public/PublicFersCalculator'));
const PublicSrsCalculator = lazy(() => import('./components/public/PublicSrsCalculator'));
const PlanDashboard = lazy(() => import('./components/plan/PlanDashboard'));
const PlanInputs = lazy(() => import('./components/plan/PlanInputs'));
const CareerSimulator = lazy(() => import('./components/plan/CareerSimulator'));
const AssumptionsPage = lazy(() => import('./components/AssumptionsPage'));

/** Routing is client-side, so pageviews have to be reported explicitly. */
function PageViewTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
    // Without this, focus stays on the link that was clicked and the new page
    // is never announced, leaving a keyboard user to tab past the whole nav.
    const main = document.getElementById('main-content');
    if (main) main.focus({ preventScroll: true });
  }, [location.pathname]);
  return null;
}

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

  // Drawn icons rather than emoji: emoji render differently on every platform,
  // carry their own colours, and read as consumer rather than considered.
  const navItems = [
    { path: '/', label: 'Home', Icon: HomeIcon },
    { path: '/plan', label: 'My Plan', Icon: RouteIcon },
    { path: '/tsp-forecast', label: 'TSP Forecast', Icon: TrendingUp },
    { path: '/fers-pension', label: 'FERS Pension', Icon: Landmark },
    { path: '/summary', label: 'Summary', Icon: LayoutDashboard },
    { path: '/scenarios', label: 'Scenarios', Icon: Layers },
    { path: '/pro-features', label: 'Pro', Icon: Sparkles },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="focus-ring flex items-center gap-2.5 rounded-lg">
              <AnimatedFlame className="h-7 w-7" />
              <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                Fire<span className="text-navy-600 dark:text-navy-300">Fed</span>
              </span>
            </Link>
          </div>

          <div className="hidden lg:flex items-center space-x-2 min-w-0">
            {isAuthenticated && (
              <div className="flex items-baseline space-x-1 min-w-0">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                    className={`focus-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                      location.pathname === item.path
                        ? 'bg-navy-50 text-navy-700 dark:bg-navy-600/20 dark:text-navy-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <item.Icon className="hidden h-4 w-4 xl:block" aria-hidden="true" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            {isAuthenticated && (
              <div className="flex items-center space-x-3 shrink-0">
                <span
                  className="hidden xl:inline text-sm text-slate-600 dark:text-slate-300 truncate max-w-[12rem]"
                  title={user?.email || user?.user_metadata?.email}
                >
                  {user?.email || user?.user_metadata?.email}
                </span>
                <button
                  onClick={logout}
                  className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-all duration-200"
                >
                  Logout
                </button>
              </div>
            )}

            <button
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={isDarkMode}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <Sun className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
              ) : (
                <Moon className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
              )}
            </button>
          </div>

          <div className="lg:hidden flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={isDarkMode}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <Sun className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
              ) : (
                <Moon className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
              )}
            </button>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-400 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-navy-500 transition-all duration-200"
            >
              <span className="sr-only">{isMenuOpen ? 'Close main menu' : 'Open main menu'}</span>
              {isMenuOpen ? (
                <XIcon className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
              ) : (
                <MenuIcon className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div id="mobile-menu" className="lg:hidden border-t border-slate-200 dark:border-slate-700">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-slate-50 dark:bg-slate-800">
            {isAuthenticated && (
              <>
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMenuOpen(false)}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors duration-150 ${
                      location.pathname === item.path
                        ? 'bg-navy-50 text-navy-700 dark:bg-navy-600/20 dark:text-navy-200'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                    }`}
                  >
                    <item.Icon className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                  <div className="truncate px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                    {user?.email || user?.user_metadata?.email}
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base font-medium text-slate-600 transition-colors duration-150 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <LogOut className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.75} />
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

function NotFound() {
  return (
    <div className="text-center py-16">
      <p className="text-sm font-semibold text-navy-600 dark:text-navy-300">404</p>
      <h1 className="mt-2 text-3xl font-bold navy-text">Page not found</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">
        That page doesn&rsquo;t exist. It may have moved, or the link may be mistyped.
      </p>
      <Link to="/" className="btn-primary inline-block mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}

function AuthenticatedApp() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-navy-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Navigation />
      <main
        id="main-content"
        tabIndex={-1}
        /* Hover tooltips are absolutely positioned and stay laid out while
           hidden, so near the right edge they pushed the page wider than the
           viewport. `clip` contains them without creating a scroll container,
           so sticky headers inside still work. */
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-clip focus:outline-none"
      >
        <CloudSyncBanner />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/plan" element={<PlanDashboard />} />
            <Route path="/plan/inputs" element={<PlanInputs />} />
            <Route path="/plan/career" element={<CareerSimulator />} />
            <Route path="/assumptions" element={<AssumptionsPage />} />
            <Route path="/tsp-forecast" element={<TSPForecast />} />
            <Route path="/fers-pension" element={<FERSPensionCalc />} />
            <Route path="/summary" element={<SummaryDashboard />} />
            <Route path="/scenarios" element={<ScenariosPage />} />
            <Route path="/scenarios/compare" element={<ScenarioCompare />} />
            <Route path="/pro-features" element={<ProFeatures />} />
            <Route path="/legal/terms" element={<LegalTerms />} />
            <Route path="/legal/privacy" element={<LegalPrivacy />} />
            <Route path="/legal/disclaimer" element={<LegalDisclaimer />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  const handleAuthSuccess = () => {
    // Auth state is updated by AuthContext listener
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

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/auth/reset" element={<ResetPassword />} />

        {isAuthenticated ? (
          <Route path="*" element={<AuthenticatedApp />} />
        ) : (
          <>
            {/* Reachable with no account. Someone arriving from a video needs to
                see what this is, try it, and find the price before signing up. */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/calculators/fers-pension" element={<PublicFersCalculator />} />
              <Route
                path="/calculators/special-retirement-supplement"
                element={<PublicSrsCalculator />}
              />
              <Route path="/legal/terms" element={<LegalTerms />} />
              <Route path="/legal/privacy" element={<LegalPrivacy />} />
              <Route path="/legal/disclaimer" element={<LegalDisclaimer />} />
            </Route>

            <Route path="*" element={<Auth onAuthSuccess={handleAuthSuccess} />} />
          </>
        )}
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ScenarioProvider>
          <Router>
            <AppErrorBoundary>
              <PageViewTracker />
              <AppContent />
            </AppErrorBoundary>
          </Router>
        </ScenarioProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
