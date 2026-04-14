import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authApi } from '../../api/authApi'
import { useAuth } from '../../context/AuthContext'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { getUserMessage } from '../../utils/errorHandler'
import { logger } from '../../utils/logger'

const CONFIRM_WORD = 'DELETE'

export function DeleteAccountSection() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <section
        className="mt-16 pt-8 px-4 pb-10"
        style={{ borderTop: '1px solid var(--color-divider)' }}
      >
        <h2
          style={{
            fontFamily: "'Amatic SC', cursive",
            color: 'var(--color-text-primary)',
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            marginBottom: '10px',
          }}
        >
          Delete Account
        </h2>
        <p
          className="leading-relaxed"
          style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '16px' }}
        >
          This permanently removes your votes, reviews, photos, favorites, and profile.
          This can't be undone.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-5 py-3 rounded-xl font-semibold transition-colors"
          style={{
            background: 'transparent',
            border: '2px solid var(--color-danger)',
            color: 'var(--color-danger)',
            fontSize: '15px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-danger)'
            e.currentTarget.style.color = '#FFFFFF'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--color-danger)'
          }}
        >
          Delete My Account
        </button>
      </section>
      {modalOpen && <DeleteAccountModal onClose={() => setModalOpen(false)} />}
    </>
  )
}

function DeleteAccountModal({ onClose }) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  const modalRef = useFocusTrap(true, handleClose)
  // Trim + uppercase: mobile keyboards auto-add whitespace and capitalize inconsistently
  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD && !loading

  const handleConfirm = async () => {
    if (!canConfirm) return
    setLoading(true)
    try {
      await authApi.deleteAccount()
      toast.success('Your account has been deleted.')
      await signOut()
      navigate('/', { replace: true })
    } catch (error) {
      logger.error('DeleteAccountSection: deletion failed', error)
      toast.error(getUserMessage(error, 'deleting your account'))
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in-up"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0, 0, 0, 0.6)' }}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative rounded-3xl max-w-md w-full shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface-elevated)' }}
      >
        <div className="h-2" style={{ background: 'var(--color-danger)' }} />
        <div className="p-8">
          <h2
            id="delete-account-title"
            className="text-2xl font-bold mb-3"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Delete your account?
          </h2>
          <p
            className="text-sm leading-relaxed mb-5"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            This is permanent. We'll remove your votes, reviews, photos, favorites, and profile
            from What's Good Here. Dish rankings that included your votes will be recalculated
            without them.
          </p>

          <label
            htmlFor="delete-account-confirm"
            className="block text-sm font-medium mb-1.5"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            id="delete-account-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-danger)] transition-colors"
            style={{
              background: 'var(--color-bg)',
              border: '2px solid var(--color-divider)',
              color: 'var(--color-text-primary)',
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              letterSpacing: '0.05em',
            }}
          />

          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-5 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
              style={{
                background: 'var(--color-bg)',
                border: '2px solid var(--color-divider)',
                color: 'var(--color-text-primary)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-1 px-5 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--color-danger)',
                color: '#FFFFFF',
              }}
            >
              {loading ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
