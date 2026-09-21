import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDishPhotos } from '../hooks/useDishPhotos'
import { useAuth } from '../context/AuthContext'
import { CameraIcon } from './CameraIcon'
import { PhotoMismatchSheet } from './PhotoMismatchSheet'

/**
 * dishName / category / restaurantId / restaurantName turn on the upload-time
 * dish check. When the photo clearly shows a different kind of food, the
 * PhotoMismatchSheet asks the user what to do — it never rejects.
 * onPhotoReassigned(row, dish) fires when they move it to another dish.
 */
export function PhotoUploadButton({
  dishId,
  dishName,
  category,
  restaurantId,
  restaurantName,
  onPhotoUploaded,
  onPhotoReassigned,
  onLoginRequired,
  compact = false,
  label,
}) {
  const fileInputRef = useRef(null)
  const { user } = useAuth()
  const {
    uploadPhoto, confirmPendingPhoto, reassignPendingPhoto, discardPendingPhoto, resolvingPending,
    uploading, analyzing, uploadProgress, error, clearError,
  } = useDishPhotos()
  const [pending, setPending] = useState(null)

  const handleClick = () => {
    if (!user) {
      onLoginRequired?.()
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    clearError()

    try {
      const result = await uploadPhoto(dishId, file, { dishName, category, restaurantName })

      // If rejected by quality checks, error is set in the hook
      if (result?.rejected) {
        // Error already displayed via the hook's error state
        return
      }

      // Dish check says this looks like something else — ask, don't decide.
      if (result?.pending) {
        setPending(result)
        return
      }

      onPhotoUploaded?.(result)
    } catch {
      // Error is already set in the hook
    } finally {
      // Clear the input so the same file can be selected again (also after a
      // "don't add" on the mismatch sheet).
      e.target.value = ''
    }
  }

  const isProcessing = analyzing || uploading

  const handleConfirm = async () => {
    try {
      const row = await confirmPendingPhoto(pending)
      setPending(null)
      onPhotoUploaded?.(row)
    } catch {
      // error state set in hook
    }
  }
  const handleReassign = async (dish) => {
    try {
      const row = await reassignPendingPhoto(pending, dish.dish_id)
      setPending(null)
      toast.success(`Added to ${dish.dish_name}`)
      onPhotoReassigned?.(row, dish)
    } catch {
      // error state set in hook
    }
  }
  const handleDiscard = async () => {
    const p = pending
    setPending(null)
    await discardPendingPhoto(p)
  }

  const mismatchSheet = pending ? (
    <PhotoMismatchSheet
      pending={pending}
      dishName={dishName}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      busy={resolvingPending}
      onConfirm={handleConfirm}
      onReassign={handleReassign}
      onDiscard={handleDiscard}
    />
  ) : null

  if (compact) {
    return (
      <>
        {mismatchSheet}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
                    onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          onClick={handleClick}
          disabled={isProcessing}
          className="photo-upload-btn-compact tap-target"
          title="Add photo"
          aria-label="Add photo"
        >
          {isProcessing ? (
            <span className="upload-spinner" />
          ) : (
            <CameraIcon size={18} />
          )}
        </button>
      </>
    )
  }

  const getButtonText = () => {
    if (analyzing) return 'Checking photo quality...'
    if (uploading) return `Uploading... ${uploadProgress}%`
    return label || 'Add Photo'
  }

  return (
    <div className="photo-upload-container">
      {mismatchSheet}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
                onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <button
        onClick={handleClick}
        disabled={isProcessing}
        className="photo-upload-btn tap-target"
      >
        {isProcessing ? (
          <>
            <span className="upload-spinner" />
            <span>{getButtonText()}</span>
          </>
        ) : (
          <>
            <CameraIcon size={18} />
            <span>{label || 'Add Photo'}</span>
          </>
        )}
      </button>

      {error && (
        <div className="photo-upload-error-container">
          <p className="photo-upload-error">{error}</p>
          <button
            onClick={handleClick}
            className="photo-upload-retry-btn tap-target"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
