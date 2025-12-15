import { useEffect, useRef, useState } from 'react';
import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AccountMenu() {
  const { user, logout, isProUser } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const email = user?.email || user?.user_metadata?.email || 'Account';
  const planLabel = isProUser ? 'Pro' : 'Free';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open account menu"
        className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <UserRound className="h-5 w-5 text-slate-600 dark:text-slate-200" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {email}
            </div>
            <div className="mt-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              {planLabel} plan
            </div>
          </div>

          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


