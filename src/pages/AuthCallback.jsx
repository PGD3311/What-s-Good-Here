import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/authApi'
import { logger } from '../utils/logger'

export function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hasAttemptedExchangeRef = useRef(false)

  useEffect(() => {
    if (hasAttemptedExchangeRef.current) return
    hasAttemptedExchangeRef.current = true

    const code = searchParams.get('code')
    const type = searchParams.get('type') || 'signup'

    if (!code) {
      navigate('/login', {
        replace: true,
        state: {
          authError: 'link_invalid',
          authErrorMessage: 'We could not read that confirmation link. Please request a new one.',
        },
      })
      return
    }

    let cancelled = false

    const runExchange = async () => {
      try {
        const { error } = await authApi.exchangeCodeForSession(code)
        if (cancelled) return

        if (error) {
          const msg = String(error.message || '').toLowerCase()
          if (msg.includes('code verifier') || msg.includes('verifier not found')) {
            navigate('/auth/cross-device', { replace: true, state: { type } })
            return
          }
          navigate('/login', { replace: true, state: { authError: 'link_expired' } })
          return
        }

        navigate('/', { replace: true })
      } catch (error) {
        if (cancelled) return
        logger.warn('AuthCallback exchangeCodeForSession failed', error)
        const msg = String(error?.message || '').toLowerCase()
        if (msg.includes('code verifier') || msg.includes('verifier not found')) {
          navigate('/auth/cross-device', { replace: true, state: { type } })
          return
        }
        navigate('/login', { replace: true, state: { authError: 'link_expired' } })
      }
    }

    runExchange()

    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--color-bg, var(--color-surface))', color: 'var(--color-text-primary)' }}
    >
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
          aria-hidden="true"
        />
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Confirming your email…
        </p>
      </div>
    </div>
  )
}

