import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { localListsApi } from '../api/localListsApi'
import { logger } from '../utils/logger'

export function AcceptCuratorInvite() {
  var { token } = useParams()
  var navigate = useNavigate()
  var location = useLocation()
  var { user, loading: authLoading } = useAuth()

  var [invite, setInvite] = useState(null)
  var [loading, setLoading] = useState(true)
  var [accepting, setAccepting] = useState(false)
  var [error, setError] = useState(null)

  useEffect(function () {
    var cancelled = false

    async function fetchInvite() {
      try {
        var details = await localListsApi.getCuratorInviteDetails(token)
        if (cancelled) return
        if (!details.valid) {
          setError(details.error || 'Invalid invite link')
        } else {
          setInvite(details)
        }
      } catch (err) {
        if (cancelled) return
        logger.error('Error fetching curator invite:', err)
        setError('Failed to load invite details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchInvite()
    return function () { cancelled = true }
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    setError(null)

    try {
      var result = await localListsApi.acceptCuratorInvite(token)
      if (result.success) {
        navigate('/my-list', { state: { justAcceptedCuratorInvite: true } })
      } else {
        setError(result.error || 'Failed to accept invite')
      }
    } catch (err) {
      logger.error('Error accepting curator invite:', err)
      setError(err.message || 'Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  function handleSignIn() {
    navigate('/login', { state: { from: location } })
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--color-primary)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading invite...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center max-w-md px-6">
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>😕</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Invalid Invite
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {error?.message || error}
          </p>
          <button
            onClick={function () { navigate('/') }}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center max-w-md px-6">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🍽️</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Become a Local Curator
        </h1>
        <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          You've been invited to share your
        </p>
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--color-primary)' }}>
          Top 10 Dishes on Martha's Vineyard
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
          Your picks help visitors discover the best food on the island.
        </p>

        {user ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: accepting ? 'default' : 'pointer' }}
          >
            {accepting ? 'Setting up...' : 'Accept & Build My Top 10'}
          </button>
        ) : (
          <button
            onClick={handleSignIn}
            className="w-full px-6 py-3 rounded-xl font-semibold transition-all"
            style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Sign In to Accept
          </button>
        )}

        <p className="mt-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Expires {new Date(invite.expires_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
