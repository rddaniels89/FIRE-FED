import { useState } from 'react'
import { supabase, isSupabaseAvailable } from '../supabaseClient'

const Auth = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')

  const handleAuth = async (e) => {
    e.preventDefault()
    
    if (!isSupabaseAvailable) {
      setMessage('Authentication service is not available. Using guest mode.')
      // Create a mock user for localStorage fallback
      const mockUser = {
        id: 'guest-' + Date.now(),
        email: email || 'guest@example.com',
        user_metadata: { email: email || 'guest@example.com' }
      }
      localStorage.setItem('auth-user', JSON.stringify(mockUser))
      onAuthSuccess?.(mockUser)
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
        } else {
          setMessage('Account created successfully!')
          onAuthSuccess?.(result.data.user)
        }
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (result.error) throw result.error
        setMessage('Signed in successfully!')
        onAuthSuccess?.(result.data.user)
      }
    } catch (error) {
      setMessage(error.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>
          {!isSupabaseAvailable && (
            <div className="mt-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
              <p className="text-sm">
                Authentication service unavailable. You can still use the app with guest mode (data stored locally).
              </p>
            </div>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="rounded-md shadow-sm -space-y-px">
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
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
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
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
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
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Loading...' : (isSignUp ? 'Sign up' : 'Sign in')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              className="text-indigo-600 hover:text-indigo-500 text-sm"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setMessage('')
              }}
            >
              {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          </div>

          {!isSupabaseAvailable && (
            <div className="text-center">
              <button
                type="button"
                className="text-gray-600 hover:text-gray-500 text-sm underline"
                onClick={() => {
                  const mockUser = {
                    id: 'guest-' + Date.now(),
                    email: 'guest@example.com',
                    user_metadata: { email: 'guest@example.com' }
                  }
                  localStorage.setItem('auth-user', JSON.stringify(mockUser))
                  onAuthSuccess?.(mockUser)
                }}
              >
                Continue as Guest
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export default Auth