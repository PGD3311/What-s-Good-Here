import { useMenuImportStatus } from '../../hooks/useMenuImportStatus'

const headingStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '18px',
  color: 'var(--color-text-primary)',
  marginBottom: '8px',
}

export function MenuImportStatus({ restaurantId, dishCount }) {
  const { status, isImporting, hasFailed, loading } = useMenuImportStatus(restaurantId)

  if (loading || dishCount > 0) return null
  if (status === null) return null
  if (status === 'completed' && dishCount > 0) return null

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
      {status === 'completed' && dishCount === 0 && (
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
    </div>
  )
}
