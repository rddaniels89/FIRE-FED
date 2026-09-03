import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const navLinkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
    isActive
      ? 'text-navy-700 dark:text-navy-300 bg-navy-50 dark:bg-slate-800'
      : 'text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-300'
  }`;

/**
 * Shell for pages a visitor can reach without an account.
 *
 * Everything here has to work for someone who has never heard of FireFed and
 * arrived from a video: the name is visible, the tools are reachable, and the
 * price is one click away rather than behind a signup.
 */
export default function PublicLayout() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl navy-text">
              <span aria-hidden="true">🔥</span>
              <span>FireFed</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1" aria-label="Main">
              <NavLink to="/calculators/fers-pension" className={navLinkClass}>
                FERS Calculator
              </NavLink>
              <NavLink to="/calculators/special-retirement-supplement" className={navLinkClass}>
                SRS Calculator
              </NavLink>
              <NavLink to="/pricing" className={navLinkClass}>
                Pricing
              </NavLink>
            </nav>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="focus-ring p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
              <Link
                to="/signin?mode=signin"
                className="hidden sm:inline-block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-navy-700 dark:hover:text-navy-300"
              >
                Sign in
              </Link>
              <Link to="/signin?mode=signup" className="hidden sm:inline-block btn-primary text-sm py-2 px-4 whitespace-nowrap">
                Create free account
              </Link>
              <button
                onClick={() => setIsMenuOpen((v) => !v)}
                className="md:hidden focus-ring p-2 rounded-lg text-slate-600 dark:text-slate-300"
                aria-expanded={isMenuOpen}
              >
                <span className="sr-only">Toggle navigation</span>
                {isMenuOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-700 px-4 py-3 space-y-1">
            <NavLink to="/calculators/fers-pension" className={navLinkClass} onClick={() => setIsMenuOpen(false)}>
              FERS Calculator
            </NavLink>
            <NavLink to="/calculators/special-retirement-supplement" className={navLinkClass} onClick={() => setIsMenuOpen(false)}>
              SRS Calculator
            </NavLink>
            <NavLink to="/pricing" className={navLinkClass} onClick={() => setIsMenuOpen(false)}>
              Pricing
            </NavLink>
            <NavLink to="/signin?mode=signin" className={navLinkClass} onClick={() => setIsMenuOpen(false)}>
              Sign in
            </NavLink>
            <Link
              to="/signin?mode=signup"
              onClick={() => setIsMenuOpen(false)}
              className="btn-primary block text-center mt-2"
            >
              Create free account
            </Link>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
            FireFed is an educational planning tool. It models the rules you enter and does not provide
            individualized financial advice. Not affiliated with OPM, the TSP, or any federal agency.
          </p>
          <div className="flex flex-wrap gap-4 text-xs">
            <Link to="/legal/terms" className="text-slate-500 dark:text-slate-400 hover:text-navy-700 dark:hover:text-navy-300">Terms</Link>
            <Link to="/legal/privacy" className="text-slate-500 dark:text-slate-400 hover:text-navy-700 dark:hover:text-navy-300">Privacy</Link>
            <Link to="/legal/disclaimer" className="text-slate-500 dark:text-slate-400 hover:text-navy-700 dark:hover:text-navy-300">Disclaimer</Link>
            <a href="https://www.opm.gov/retirement-center/" className="text-slate-500 dark:text-slate-400 hover:text-navy-700 dark:hover:text-navy-300" target="_blank" rel="noreferrer">OPM.gov</a>
            <a href="https://www.tsp.gov" className="text-slate-500 dark:text-slate-400 hover:text-navy-700 dark:hover:text-navy-300" target="_blank" rel="noreferrer">TSP.gov</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
