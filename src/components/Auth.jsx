import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseAvailable } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { trackEvent } from '../lib/telemetry'

const allowGuestPreview = import.meta.env.VITE_ALLOW_GUEST_PREVIEW === 'true'

const Auth = ({ onAuthSuccess }) => {
  const { login, loginAsGuest } = useAuth()
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Almost every arrival is new, so "create an account" is the default unless
  // the visitor explicitly came to sign in.
  const [searchParams] = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') !== 'signin')
  const [message, setMessage] = useState('')

  const handleAuth = async (e) => {
    e.preventDefault()
    
    if (!isSupabaseAvailable) {
      setMessage('Authentication service is not available. Using guest mode.')
      const result = await login(email || 'guest@example.com', password || '')
      if (result?.success) onAuthSuccess?.(result.user)
      return
    }

    setLoading(true)
    setMessage('')

    try {
      let result
      if (isSignUp) {
        result = await supabase.auth.signUp({
          email,
          password,
        })
        if (result.error) throw result.error
        if (result.data?.user && !result.data.user.email_confirmed_at) {
          setMessage('Check your email for the confirmation link!')
          trackEvent('signup_completed', { email_domain: (email || '').split('@')[1] || null })
        } else {
          setMessage('Account created successfully!')
          trackEvent('signup_completed', { email_domain: (email || '').split('@')[1] || null })
          onAuthSuccess?.(result.data.user)
        }
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (result.error) throw result.error
        setMessage('Signed in successfully!')
        trackEvent('login_completed', { email_domain: (email || '').split('@')[1] || null })
        onAuthSuccess?.(result.data.user)
      }
    } catch (error) {
      setMessage(error.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!isSupabaseAvailable) {
      setMessage('Password reset is unavailable in guest mode.')
      return
    }

    if (!email) {
      setMessage('Enter your email above, then click “Forgot password?”')
      return
    }

    setResetLoading(true)
    setMessage('')
    try {
      const redirectTo = `${window.location.origin}/auth/reset`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setMessage('If that email exists, a password reset link has been sent.')
      trackEvent('password_reset_requested', { email_domain: (email || '').split('@')[1] || null })
    } catch (error) {
      setMessage(error.message || 'Failed to request a reset email')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-md w-full mx-auto space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2 font-bold text-2xl navy-text">
            <span aria-hidden="true">🔥</span>
            <span>FireFed</span>
          </Link>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Retirement planning built for federal employees
          </p>

          <h2 className="mt-8 text-3xl font-bold text-slate-900 dark:text-white">
            {isSignUp ? 'Create your free account' : 'Sign in to your account'}
          </h2>

          {isSignUp && (
            <ul className="mt-5 text-sm text-slate-600 dark:text-slate-300 space-y-1.5 text-left inline-block">
              <li>✅ Save and revisit up to three retirement scenarios</li>
              <li>✅ FERS pension, TSP projection, and the gap to age 62</li>
              <li>✅ Free forever &mdash; Pro is $9.99/month if you want more</li>
            </ul>
          )}

          {!isSupabaseAvailable && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 rounded-lg">
              <p className="text-sm">
                Sign-in is unavailable right now. You can still use the app in guest mode, with scenarios
                saved on this device only.
              </p>
            </div>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required={isSupabaseAvailable}
                className="input-field w-full"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required={isSupabaseAvailable}
                className="input-field w-full"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={isSupabaseAvailable ? 6 : 0}
              />
            </div>
          </div>

          {message && (
            <div className={`text-sm text-center ${message.includes('error') || message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Working…' : isSignUp ? 'Create free account' : 'Sign in'}
            </button>
          </div>

          {!isSignUp && isSupabaseAvailable && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading}
                className="navy-text hover:underline text-sm disabled:opacity-50"
              >
                {resetLoading ? 'Sending reset email…' : 'Forgot password?'}
              </button>
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              className="navy-text hover:underline text-sm"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setMessage('')
              }}
            >
              {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          </div>

          {(!isSupabaseAvailable || allowGuestPreview) && (
            <div className="text-center">
              <button
                type="button"
                className="text-slate-600 dark:text-slate-400 hover:underline text-sm"
                onClick={() => {
                  const run = isSupabaseAvailable ? loginAsGuest : () => login('guest@example.com', '')
                  run().then((result) => {
                    if (result?.success) onAuthSuccess?.(result.user)
                  })
                }}
              >
                Continue as Guest
              </button>
              {allowGuestPreview && isSupabaseAvailable && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Guest mode saves scenarios on this device only. Sign up to sync across devices.
                </p>
              )}
            </div>
          )}
        </form>

        <div className="text-center pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 pt-4">
            Not ready to sign up?{' '}
            <Link to="/calculators/fers-pension" className="navy-text hover:underline font-medium">
              Try the free FERS calculator
            </Link>{' '}
            &mdash; no account needed.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Auth