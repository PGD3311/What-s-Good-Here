import { useMenuImportStatus } from '../../hooks/useMenuImportStatus'

const headingStyle = {
  fontFamily: "'Amatic SC', cursive",
  fontWeight: 700,
  fontSize: '24px',
  color: 'var(--color-text-primary)',
  marginBottom: '8px',
}

const snapBtnStyle = {
  marginTop: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  padding: '12px 22px',
  borderRadius: '12px',
  border: 'none',
  background: 'var(--color-primary)',
  color: 'white',
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 700,
  fontSize: '15px',
  cursor: 'pointer',
}

/**
 * MenuImportStatus — shown in the empty/failed menu state.
 * Props:
 *   restaurantId    {string}
 *   dishCount       {number}
 *   onAddByPhoto    {() => void}  Opens the MenuPhotoUploadModal
 */
export function MenuImportStatus({ restaurantId, dishCount, onAddByPhoto }) {
  const { status, isImporting, hasFailed, loading } = useMenuImportStatus(restaurantId)

  // Hide when: still loading, or there are dishes and no failure (real menu exists).
  if (loading) return null
  if (dishCount > 0 && !hasFailed) return null

  return (
    <div
      style={{
        padding: '24px 20px',
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
      }}
    >
      {isImporting && (
        <>
          <p style={headingStyle}>Thanks for adding this restaurant!</p>
          <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
            We're getting the menu ready — check back in a moment.
          </p>
        </>
      )}
      {!isImporting && status === null && dishCount === 0 && (
        <>
          <p style={headingStyle}>No menu yet</p>
          <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
            No menu yet — add it from a photo.
          </p>
        </>
      )}
      {!isImporting && status === 'completed' && dishCount === 0 && (
        <>
          <p style={headingStyle}>Menu coming soon</p>
          <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
            We couldn't find the menu yet — our team is working on it.
          </p>
        </>
      )}
      {hasFailed && (
        <>
          <p style={headingStyle}>Menu coming soon</p>
          <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
            We're working on getting this menu — check back soon.
          </p>
        </>
      )}
      {!isImporting && onAddByPhoto && (
        <button
          type="button"
          style={snapBtnStyle}
          onClick={onAddByPhoto}
          aria-label="Add menu by photo"
        >
          <span aria-hidden="true">📷</span>
          Add the menu
        </button>
      )}
    </div>
  )
}
