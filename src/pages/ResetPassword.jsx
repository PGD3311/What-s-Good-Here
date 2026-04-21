import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { supabase } from '../lib/supabase'
import { SmileyPin } from '../components/SmileyPin'

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [isValidSession, setIsValidSession] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // Under PKCE, Supabase exchanges ?code= asynchronously, so we subscribe
  // to auth events instead of relying on a single getSession() read that
  // can fire before the exchange completes.
  useEffect(() => {
    let decided = false
    let cancelled = false

    const decide = (session) => {
      if (cancelled || decided) return
      decided = true
      if (session) {
        setIsValidSession(true)
      } else {
        setMessage({
          type: 'error',
          text: 'Invalid or expired reset link. Please request a new one.'
        })
      }
      setCheckingSession(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        decide(session)
      } else if (event === 'INITIAL_SESSION' && session) {
        decide(session)
      }
    })

    // Fallback: if no recovery/signed-in event arrives within 5s, resolve
    // with whatever getSession reports. Guards against silent init failure.
    const timer = setTimeout(async () => {
      if (cancelled || decided) return
      const { data: { session } } = await supabase.auth.getSession()
      decide(session)
    }, 5000)

    return () => {
      cancelled = true
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    try {
      setLoading(true)
      setMessage(null)

      await authApi.updatePassword(password)

      setMessage({
        type: 'success',
        text: 'Password updated successfully! Redirecting...'
      })

      // Redirect to home after a short delay
      setTimeout(() => {
        navigate('/')
      }, 2000)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--color-surface)' }}
    >
      {/* Logo */}
      <div className="mb-6">
        <SmileyPin size={96} />
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Set New Password
      </h1>
      <p className="text-center text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
        Enter your new password below
      </p>

      {/* Messages */}
      {message && (
        <div
          className="w-full max-w-sm mb-4 p-4 rounded-xl text-sm font-medium"
          style={message.type === 'error'
            ? { background: 'rgba(var(--color-danger-rgb), 0.15)', color: 'var(--color-danger)', border: '1px solid rgba(var(--color-danger-rgb), 0.3)' }
            : { background: 'rgba(var(--color-success-rgb), 0.15)', color: 'var(--color-success)', border: '1px solid rgba(var(--color-success-rgb), 0.3)' }
          }
        >
          {message.text}
        </div>
      )}

      {checkingSession ? (
        <div className="w-full max-w-sm flex justify-center py-8" role="status">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
            aria-hidden="true"
          />
          <span className="sr-only">Loading...</span>
        </div>
      ) : isValidSession ? (
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              New Password
            </label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              autoFocus
              minLength={6}
              className="w-full px-4 py-3 rounded-xl focus:outline-none transition-colors"
              style={{ background: 'var(--color-bg)', border: '2px solid var(--color-divider)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Enter password again"
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl focus:outline-none transition-colors"
              style={{ background: 'var(--color-bg)', border: '2px solid var(--color-divider)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-4 font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      ) : (
        <div className="w-full max-w-sm">
          <button
            onClick={() => navigate('/login')}
            className="w-full px-6 py-4 font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Back to Sign In
          </button>
        </div>
      )}
    </div>
  )
}
