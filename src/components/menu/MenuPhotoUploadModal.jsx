import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { LoginModal } from '../Auth/LoginModal'
import { menuPhotosApi } from '../../api/menuPhotosApi'
import { logger } from '../../utils/logger'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// Steps: pick → working → review → done
// Explicit sheet height (not maxHeight) per feedback_bottom_sheet_explicit_height.
const SHEET_HEIGHT = '92vh'

const TITLE_STYLE = {
  fontFamily: "'Amatic SC', cursive",
  fontWeight: 700,
  fontSize: '28px',
  color: 'var(--color-text-primary)',
  letterSpacing: '0.02em',
}

const SECTION_HEADER_STYLE = {
  fontFamily: "'Amatic SC', cursive",
  fontWeight: 700,
  fontSize: '20px',
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.02em',
}

const PRIMARY_BTN = {
  display: 'block',
  width: '100%',
  padding: '14px 20px',
  borderRadius: '12px',
  border: 'none',
  background: 'var(--color-primary)',
  color: 'white',
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 700,
  fontSize: '16px',
  cursor: 'pointer',
  transition: 'opacity 0.15s',
}

const SECONDARY_BTN = {
  display: 'block',
  width: '100%',
  padding: '12px 20px',
  borderRadius: '12px',
  border: '1px solid var(--color-divider)',
  background: 'var(--color-surface-elevated)',
  color: 'var(--color-text-primary)',
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 600,
  fontSize: '15px',
  cursor: 'pointer',
}

/**
 * MenuPhotoUploadModal — "Snap the menu" flow.
 *
 * Props:
 *   restaurantId    {string}   UUID of the restaurant
 *   restaurantName  {string}   Display name (sent to extraction edge fn)
 *   isOpen          {boolean}
 *   onClose         {() => void}
 *   onCommitted     {() => void}  Called after a successful commit so the
 *                               parent can refetch dishes
 */
export function MenuPhotoUploadModal({ restaurantId, restaurantName, isOpen, onClose, onCommitted }) {
  const { user } = useAuth()

  // Show LoginModal instead of the snap flow when not authenticated
  const [loginOpen, setLoginOpen] = useState(false)

  // Step machine: 'pick' | 'working' | 'review' | 'done'
  const [step, setStep] = useState('pick')

  // pick step
  const [selectedFiles, setSelectedFiles] = useState([])
  const fileInputRef = useRef(null)

  // working step
  const [workingMsg, setWorkingMsg] = useState('')

  // review step
  const [extractionId, setExtractionId] = useState(null)
  const [extractedDishes, setExtractedDishes] = useState([])
  const [menuSectionOrder, setMenuSectionOrder] = useState([])
  const [includes, setIncludes] = useState([])                  // set of checked indices
  const [priceOverrides, setPriceOverrides] = useState({})      // { [index]: number }

  // done step
  const [commitResult, setCommitResult] = useState(null)

  // error (any step)
  const [errorMsg, setErrorMsg] = useState(null)

  const modalRef = useFocusTrap(isOpen, onClose)

  // ---- reset on close ----
  const handleClose = useCallback(() => {
    setStep('pick')
    setSelectedFiles([])
    setWorkingMsg('')
    setExtractionId(null)
    setExtractedDishes([])
    setMenuSectionOrder([])
    setIncludes([])
    setPriceOverrides({})
    setCommitResult(null)
    setErrorMsg(null)
    onClose()
  }, [onClose])

  // ---- file selection ----
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4)
    setSelectedFiles(files)
    setErrorMsg(null)
  }

  // ---- main flow: upload → extract ----
  const handleStartReading = async () => {
    if (!user) {
      setLoginOpen(true)
      return
    }
    if (selectedFiles.length === 0) {
      setErrorMsg('Please choose at least one photo.')
      return
    }

    setErrorMsg(null)
    setStep('working')
    setWorkingMsg('Uploading photos…')

    let photoUrls
    try {
      photoUrls = await menuPhotosApi.uploadMenuPhotos(restaurantId, selectedFiles)
    } catch (err) {
      logger.error('MenuPhotoUploadModal: upload failed', err)
      setErrorMsg(err?.message || 'Upload failed — please try again.')
      setStep('pick')
      return
    }

    setWorkingMsg('Reading the menu…')
    let extraction
    try {
      extraction = await menuPhotosApi.extractFromPhotos({
        restaurantId,
        restaurantName,
        photoUrls,
      })
    } catch (err) {
      logger.error('MenuPhotoUploadModal: extract failed', err)
      setErrorMsg(err?.message || 'Couldn\'t read the menu — please try a clearer photo.')
      setStep('pick')
      return
    }

    if (!extraction.dishes || extraction.dishes.length === 0) {
      setStep('pick')
      setErrorMsg('Couldn\'t read a menu from that photo — try a clearer shot.')
      return
    }

    setExtractionId(extraction.extractionId)
    setExtractedDishes(extraction.dishes)
    setMenuSectionOrder(extraction.menu_section_order || [])
    // default: all included
    setIncludes(extraction.dishes.map((_, i) => i))
    setPriceOverrides({})
    setStep('review')
  }

  // ---- review: toggle include ----
  const toggleInclude = (index) => {
    setIncludes(prev => {
      const next = prev.slice()
      const pos = next.indexOf(index)
      if (pos === -1) next.push(index)
      else next.splice(pos, 1)
      return next
    })
  }

  // ---- review: price edit ----
  const handlePriceChange = (index, raw) => {
    const val = parseFloat(raw)
    setPriceOverrides(prev => {
      if (!raw || isNaN(val) || val < 0 || val > 1000) {
        const next = Object.assign({}, prev)
        delete next[index]
        return next
      }
      return Object.assign({}, prev, { [index]: val })
    })
  }

  // ---- commit ----
  const handleCommit = async () => {
    if (includes.length === 0) {
      setErrorMsg('Select at least one dish to add.')
      return
    }
    setErrorMsg(null)
    setStep('working')
    setWorkingMsg('Adding dishes…')

    try {
      const result = await menuPhotosApi.commitDishes({
        extractionId,
        includes,
        priceOverrides,
      })
      setCommitResult(result)
      setStep('done')
      if (onCommitted) onCommitted()
    } catch (err) {
      logger.error('MenuPhotoUploadModal: commit failed', err)
      setErrorMsg(err?.message || 'Something went wrong — please try again.')
      setStep('review')
    }
  }

  if (!isOpen) return null

  // Show login gate instead of the flow
  if (loginOpen || (!user && step !== 'pick')) {
    return (
      <LoginModal
        isOpen={true}
        onClose={() => {
          setLoginOpen(false)
          handleClose()
        }}
      />
    )
  }

  // --- group extracted dishes by section for the review list ---
  const dishGroups = buildDishGroups(extractedDishes, menuSectionOrder)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={handleClose}
      role="presentation"
    >
      {/* backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }}
        aria-hidden="true"
      />

      {/* sheet */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-photo-modal-title"
        style={{
          position: 'relative',
          left: 0,
          right: 0,
          width: '100%',
          height: SHEET_HEIGHT,
          background: 'var(--color-surface-elevated)',
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* grabber */}
        <div style={{ padding: '10px 0 4px', flexShrink: 0, textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 4,
              background: 'var(--color-divider)',
              borderRadius: 2,
              margin: '0 auto',
            }}
            aria-hidden="true"
          />
        </div>

        {/* header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 16px 12px',
            borderBottom: '1px solid var(--color-divider)',
            flexShrink: 0,
          }}
        >
          <h2 id="menu-photo-modal-title" style={TITLE_STYLE}>
            {step === 'done' ? 'Menu updated!' : 'Add the menu'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '8px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
            aria-label="Close"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* scrollable body */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            padding: '20px 16px',
          }}
        >
          {/* STEP: pick */}
          {step === 'pick' && (
            <PickStep
              selectedFiles={selectedFiles}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              onStart={handleStartReading}
              errorMsg={errorMsg}
              user={user}
              onLoginNeeded={() => setLoginOpen(true)}
            />
          )}

          {/* STEP: working */}
          {step === 'working' && (
            <WorkingStep message={workingMsg} />
          )}

          {/* STEP: review */}
          {step === 'review' && (
            <ReviewStep
              dishes={extractedDishes}
              dishGroups={dishGroups}
              includes={includes}
              priceOverrides={priceOverrides}
              onToggle={toggleInclude}
              onPriceChange={handlePriceChange}
              onCommit={handleCommit}
              onCancel={handleClose}
              errorMsg={errorMsg}
            />
          )}

          {/* STEP: done */}
          {step === 'done' && (
            <DoneStep result={commitResult} onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-steps
// ---------------------------------------------------------------------------

function PickStep({ selectedFiles, fileInputRef, onFileChange, onStart, errorMsg, user, onLoginNeeded }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
        Snap a photo of the paper menu and we'll add the dishes for you.
      </p>

      {/* file pick area */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onFileChange}
          style={{ display: 'none' }}
          aria-label="Choose menu photos"
          id="menu-photo-file-input"
        />
        <label
          htmlFor="menu-photo-file-input"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '10px',
            padding: '32px 16px',
            border: '2px dashed var(--color-divider)',
            borderRadius: '14px',
            background: 'var(--color-bg)',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
        >
          <span style={{ fontSize: '36px' }}>📷</span>
          <span style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 600,
            fontSize: '15px',
            color: 'var(--color-text-secondary)',
          }}>
            {selectedFiles.length > 0
              ? `${selectedFiles.length} photo${selectedFiles.length > 1 ? 's' : ''} selected`
              : 'Tap to take a photo or choose from library'}
          </span>
          <span style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
          }}>
            Up to 4 photos — JPEG, PNG, WebP, or HEIC
          </span>
        </label>

        {selectedFiles.length > 0 && (
          <div style={{
            marginTop: '8px',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            {selectedFiles.map((f, i) => (
              <span
                key={i}
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-divider)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'Outfit, sans-serif',
                  maxWidth: '150px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {errorMsg && (
        <p
          role="alert"
          style={{
            color: 'var(--color-danger)',
            fontSize: '14px',
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        style={{
          ...PRIMARY_BTN,
          opacity: selectedFiles.length === 0 ? 0.55 : 1,
        }}
        onClick={user ? onStart : onLoginNeeded}
        disabled={selectedFiles.length === 0}
      >
        Read the menu
      </button>
    </div>
  )
}

function WorkingStep({ message }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        paddingTop: '60px',
        paddingBottom: '60px',
      }}
      role="status"
      aria-live="polite"
    >
      {/* spinner */}
      <div
        style={{
          width: '44px',
          height: '44px',
          border: '3px solid var(--color-divider)',
          borderTopColor: 'var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
        aria-hidden="true"
      />
      <p
        style={{
          ...TITLE_STYLE,
          fontSize: '26px',
          textAlign: 'center',
          margin: 0,
        }}
      >
        {message || 'Reading the menu…'}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ReviewStep({
  dishes,
  dishGroups,
  includes,
  priceOverrides,
  onToggle,
  onPriceChange,
  onCommit,
  onCancel,
  errorMsg,
}) {
  const checkedCount = includes.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: '15px',
          color: 'var(--color-text-secondary)',
          margin: 0,
        }}>
          Found {dishes.length} dish{dishes.length === 1 ? '' : 'es'}
        </p>
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '13px',
          color: 'var(--color-text-tertiary)',
          margin: 0,
        }}>
          {checkedCount} selected
        </p>
      </div>

      <p style={{
        fontFamily: 'Outfit, sans-serif',
        fontSize: '13px',
        color: 'var(--color-text-tertiary)',
        margin: 0,
        lineHeight: '1.5',
      }}>
        Uncheck any dishes that don't look right. You can also correct a price.
      </p>

      {/* dish list grouped by section */}
      {dishGroups.map((group) => (
        <div key={group.section || '__none'}>
          {group.section && (
            <p style={{ ...SECTION_HEADER_STYLE, marginBottom: '8px', marginTop: '8px' }}>
              {group.section}
            </p>
          )}
          {group.dishes.map(({ dish, index }) => {
            const checked = includes.indexOf(index) !== -1
            const overridePrice = priceOverrides[index]
            const displayPrice = overridePrice != null
              ? overridePrice
              : (dish.price != null ? dish.price : '')

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  opacity: checked ? 1 : 0.45,
                }}
              >
                {/* checkbox */}
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(index)}
                  id={`dish-include-${index}`}
                  style={{
                    width: '18px',
                    height: '18px',
                    flexShrink: 0,
                    accentColor: 'var(--color-primary)',
                    cursor: 'pointer',
                  }}
                  aria-label={`Include ${dish.name || dish.dish_name || 'dish'}`}
                />

                {/* name + category (read-only) */}
                <label
                  htmlFor={`dish-include-${index}`}
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                >
                  <span style={{
                    display: 'block',
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 600,
                    fontSize: '14px',
                    color: 'var(--color-text-primary)',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {dish.name || dish.dish_name || '—'}
                  </span>
                  {dish.category && (
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 8px',
                      borderRadius: '10px',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-divider)',
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      fontFamily: 'Outfit, sans-serif',
                    }}>
                      {dish.category}
                    </span>
                  )}
                </label>

                {/* price (editable) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '13px',
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'Outfit, sans-serif',
                  }}>$</span>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.01"
                    value={displayPrice}
                    onChange={(e) => onPriceChange(index, e.target.value)}
                    placeholder="—"
                    aria-label={`Price for ${dish.name || dish.dish_name || 'dish'}`}
                    style={{
                      width: '64px',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-divider)',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                      fontFamily: 'Outfit, sans-serif',
                      textAlign: 'right',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {errorMsg && (
        <p
          role="alert"
          style={{
            color: 'var(--color-danger)',
            fontSize: '14px',
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          {errorMsg}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', paddingBottom: '16px' }}>
        <button
          type="button"
          style={{
            ...PRIMARY_BTN,
            opacity: checkedCount === 0 ? 0.55 : 1,
          }}
          onClick={onCommit}
          disabled={checkedCount === 0}
        >
          Add {checkedCount} dish{checkedCount === 1 ? '' : 'es'}
        </button>
        <button
          type="button"
          style={SECONDARY_BTN}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function DoneStep({ result, onClose }) {
  const added = result ? (result.inserted || 0) + (result.updated || 0) : 0
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        paddingTop: '40px',
        paddingBottom: '40px',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '48px' }} role="img" aria-label="checkmark">✅</span>
      <h3 style={{ ...TITLE_STYLE, fontSize: '32px', margin: 0 }}>
        {added > 0
          ? `Added ${added} dish${added === 1 ? '' : 'es'}!`
          : 'Menu updated'}
      </h3>
      {result && result.skipped > 0 && (
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '13px',
          color: 'var(--color-text-tertiary)',
          margin: 0,
        }}>
          {result.skipped} {result.skipped === 1 ? 'dish was' : 'dishes were'} already in the menu.
        </p>
      )}
      <button
        type="button"
        style={{ ...PRIMARY_BTN, marginTop: '12px' }}
        onClick={onClose}
      >
        Done
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Group extracted dishes by menu_section, ordered by menuSectionOrder.
 * Returns [{ section: string|null, dishes: [{dish, index}] }]
 */
function buildDishGroups(dishes, menuSectionOrder) {
  const groups = {}
  const unsectioned = []

  dishes.forEach((dish, i) => {
    const section = dish.menu_section || null
    if (!section) {
      unsectioned.push({ dish, index: i })
      return
    }
    if (!groups[section]) groups[section] = []
    groups[section].push({ dish, index: i })
  })

  const sectionKeys = Object.keys(groups)
  sectionKeys.sort((a, b) => {
    const ai = menuSectionOrder.indexOf(a)
    const bi = menuSectionOrder.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  const result = sectionKeys.map((s) => ({ section: s, dishes: groups[s] }))
  if (unsectioned.length > 0) {
    // If there are also sectioned groups, label the unsectioned batch "Other"
    result.push({ section: sectionKeys.length > 0 ? 'Other' : null, dishes: unsectioned })
  }
  return result
}
