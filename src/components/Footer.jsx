import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="text-slate-600 dark:text-slate-400">
            FireFed is for educational purposes only.
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link className="text-navy-600 dark:text-navy-400 hover:underline" to="/legal/terms">Terms</Link>
            <Link className="text-navy-600 dark:text-navy-400 hover:underline" to="/legal/privacy">Privacy</Link>
            <Link className="text-navy-600 dark:text-navy-400 hover:underline" to="/legal/disclaimer">Disclaimer</Link>
            <a className="text-navy-600 dark:text-navy-400 hover:underline" href="https://www.tsp.gov" target="_blank" rel="noopener noreferrer">
              TSP.gov
            </a>
            <a className="text-navy-600 dark:text-navy-400 hover:underline" href="https://www.opm.gov" target="_blank" rel="noopener noreferrer">
              OPM.gov
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;


