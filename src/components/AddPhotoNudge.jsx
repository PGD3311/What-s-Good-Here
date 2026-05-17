import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { profileApi } from '../api/profileApi'
import { setStorageItem, STORAGE_KEYS } from '../lib/storage'
import { logger } from '../utils/logger'
import { useFocusTrap } from '../hooks/useFocusTrap'

// Soft nudge shown to logged-in users without an avatar after a successful
// rating. Identity scaffolding, not anti-bot gating — motivated bots can
// always grab a generated face. Any close path (backdrop click, Escape,
// "Maybe later", successful upload) marks HAS_SEEN_PHOTO_NUDGE so the
// sheet never reappears.
export function AddPhotoNudge({ isOpen, onClose, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Single close path: always mark-seen, then notify parent. Escape via
  // useFocusTrap routes through this too, so keyboard users get the same
  // "dismiss = never reappear" behavior as touch/click.
  const closeAndMarkSeen = () => {
    if (uploading) return
    setStorageItem(STORAGE_KEYS.HAS_SEEN_PHOTO_NUDGE, '1')
    onClose()
  }

  const modalRef = useFocusTrap(isOpen, closeAndMarkSeen)

  const handlePick = () => {
    if (uploading) return
    fileInputRef.current?.click()
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await profileApi.uploadAvatar(file)
      setStorageItem(STORAGE_KEYS.HAS_SEEN_PHOTO_NUDGE, '1')
      toast.success('Looking good.')
      onUploaded?.()
      onClose()
    } catch (error) {
      logger.error('Avatar upload from nudge failed:', error)
      toast.error(error?.message || "Couldn't upload your photo.")
    } finally {
      setUploading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={closeAndMarkSeen}
      role="presentation"
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-photo-nudge-title"
        className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--color-surface-elevated)',
          maxHeight: '85vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '8px auto 4px', flex: '0 0 auto' }}
          aria-hidden="true"
        />

        <div
          className="px-6 pt-2 pb-6 text-center"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
            style={{ background: 'var(--color-primary-muted)' }}
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8"
              style={{ color: 'var(--color-primary)' }}
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>

          <h2
            id="add-photo-nudge-title"
            style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '40px',
              color: 'var(--color-text-primary)',
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            You&apos;re a real one.
          </h2>
          <p className="text-base px-2" style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
            Add a face so people know who you are. Profiles with photos get followed more.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleFile}
            style={{ display: 'none' }}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className="w-full rounded-2xl py-3.5 font-bold mb-2"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-text-on-primary)',
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Add a photo'}
          </button>

          <button
            type="button"
            onClick={closeAndMarkSeen}
            disabled={uploading}
            className="w-full py-2 font-medium"
            style={{
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              fontSize: 14,
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddPhotoNudge
