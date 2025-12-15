import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseAvailable } from '../supabaseClient';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState({ type: 'idle', message: '' }); // idle | loading | error | ready | success
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const code = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('code');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!isSupabaseAvailable) {
        setStatus({ type: 'error', message: 'Password reset is unavailable (authentication service not configured).' });
        return;
      }

      setStatus({ type: 'loading', message: 'Validating reset link…' });

      try {
        // If Supabase is using PKCE, the reset link may provide a `code` param.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data?.session) {
          setStatus({
            type: 'error',
            message: 'Reset link is invalid or expired. Please request a new password reset email.',
          });
          return;
        }

        setStatus({ type: 'ready', message: '' });
      } catch (e) {
        setStatus({
          type: 'error',
          message: e?.message || 'Reset link could not be validated. Please request a new reset email.',
        });
      }
    };

    init();
  }, [code]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isSupabaseAvailable) return;

    if (!password || password.length < 6) {
      setStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setStatus({ type: 'loading', message: 'Updating password…' });
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Optional: sign out so user must re-login with the new password.
      await supabase.auth.signOut();
      setStatus({ type: 'success', message: 'Password updated. Please sign in with your new password.' });
    } catch (e) {
      setStatus({ type: 'error', message: e?.message || 'Failed to update password.' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">Reset your password</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter a new password for your account.
          </p>
        </div>

        {status.message && (
          <div
            className={`text-sm text-center ${
              status.type === 'error' ? 'text-red-600' : status.type === 'success' ? 'text-green-600' : 'text-gray-700'
            }`}
          >
            {status.message}
          </div>
        )}

        {status.type === 'ready' && (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="sr-only" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={status.type === 'loading'}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Update password
            </button>
          </form>
        )}

        {(status.type === 'success' || status.type === 'error') && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full text-sm text-indigo-600 hover:text-indigo-500"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}


