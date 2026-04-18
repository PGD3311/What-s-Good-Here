import { useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useBlockedUsers } from '../hooks/useBlockedUsers'

export function BlockUserModal({ isOpen, onClose, user }) {
  const [loading, setLoading] = useState(false)
  const { blockUser } = useBlockedUsers()

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  const modalRef = useFocusTrap(isOpen, handleClose)

  if (!isOpen || !user) return null

  const handleConfirm = async () => {
    setLoading(true)
    const { error } = await blockUser(user.id)
    setLoading(false)
    if (!error) onClose()
  }

  const displayName = user.displayName || user.display_name || 'this user'

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
        aria-labelledby="block-user-title"
        className="relative rounded-3xl max-w-md w-full shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface-elevated)' }}
      >
        <div className="p-8">
          <h2
            id="block-user-title"
            className="text-2xl font-bold mb-3"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Block {displayName}?
          </h2>
          <p
            className="text-sm leading-relaxed mb-5"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            You won't see their reviews, ratings, photos, or profile. They won't
            see yours either. You'll stop following each other, and neither of you
            can re-follow until you unblock them.
          </p>
          <p
            className="text-sm leading-relaxed mb-6"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            You can unblock anytime from Settings → Blocked users.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-5 py-3 rounded-xl font-semibold transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-divider)',
                color: 'var(--color-text-primary)',
                fontSize: '15px',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 px-5 py-3 rounded-xl font-semibold transition-colors"
              style={{
                background: 'var(--color-danger)',
                color: '#FFFFFF',
                fontSize: '15px',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Blocking…' : 'Block'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
