import { useFocusTrap } from '../hooks/useFocusTrap'
import { useBlockedUsers } from '../hooks/useBlockedUsers'

export function BlockedUsersModal({ isOpen, onClose }) {
  const { blocks, loading, unblockUser, unblocking } = useBlockedUsers()
  const modalRef = useFocusTrap(isOpen, onClose)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in-up"
      onClick={onClose}
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
        aria-labelledby="blocked-users-title"
        className="relative rounded-3xl max-w-md w-full shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface-elevated)', maxHeight: '80vh' }}
      >
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-divider)' }}>
          <h2
            id="blocked-users-title"
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Blocked users
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full"
            aria-label="Close"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              Loading…
            </div>
          ) : blocks.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                You haven't blocked anyone. When you block someone, you can manage them here.
              </p>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-divider)' }}>
              {blocks.map((block) => (
                <li key={block.blockedId} className="px-6 py-4 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ background: 'var(--color-surface)' }}
                  >
                    {block.avatarUrl ? (
                      <img src={block.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
                        {(block.displayName || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {block.displayName || 'Unknown user'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => unblockUser(block.blockedId)}
                    disabled={unblocking}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-primary)',
                      color: 'var(--color-primary)',
                      opacity: unblocking ? 0.6 : 1,
                    }}
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
