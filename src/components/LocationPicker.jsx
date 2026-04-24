import { useState, useRef, useCallback } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

var RADIUS_OPTIONS = [1, 5, 10, 25, 0]

var DISMISS_THRESHOLD = 80

/**
 * Radius selection bottom sheet — swipe down to dismiss
 */
export function RadiusSheet({ isOpen, onClose, radius, onRadiusChange }) {
  var radiusSheetRef = useFocusTrap(isOpen, onClose)
  var [dragOffset, setDragOffset] = useState(0)
  var [isDragging, setIsDragging] = useState(false)
  var dragRef = useRef({ startY: 0, isDragging: false })

  var handleRadiusSelect = function (newRadius) {
    onRadiusChange(newRadius)
    onClose()
  }

  var handleTouchStart = useCallback(function (e) {
    var touch = e.touches[0]
    dragRef.current = { startY: touch.clientY, isDragging: true }
    setIsDragging(true)
  }, [])

  var handleTouchMove = useCallback(function (e) {
    if (!dragRef.current.isDragging) return
    var touch = e.touches[0]
    var deltaY = touch.clientY - dragRef.current.startY
    // Only allow dragging down (positive delta)
    if (deltaY > 0) {
      setDragOffset(deltaY)
    }
  }, [])

  var handleTouchEnd = useCallback(function () {
    dragRef.current.isDragging = false
    setIsDragging(false)
    if (dragOffset > DISMISS_THRESHOLD) {
      onClose()
    }
    setDragOffset(0)
  }, [dragOffset, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: dragOffset > 0 ? Math.max(0.2, 1 - dragOffset / 300) : 1,
        }}
        aria-hidden="true"
      />

      {/* Sheet Content */}
      <div
        ref={radiusSheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="radius-sheet-title"
        className="relative w-full max-w-lg rounded-t-3xl"
        style={{
          background: 'var(--color-bg)',
          transform: 'translateY(' + dragOffset + 'px)',
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
          touchAction: 'none',
        }}
        onClick={function (e) { e.stopPropagation() }}
        onTouchStart={function (e) { e.stopPropagation() }}
        onTouchMove={function (e) { e.stopPropagation() }}
        onPointerDown={function (e) { e.stopPropagation() }}
      >
        {/* Drag handle — swipe down to dismiss */}
        <div
          className="flex justify-center pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: 'grab', touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-divider)' }} />
        </div>

        {/* Header — also draggable */}
        <div
          className="px-6 pb-4 border-b"
          style={{ borderColor: 'var(--color-divider)' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <h3 id="radius-sheet-title" className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Search radius
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            How far should we look for dishes?
          </p>
        </div>

        {/* Radius Options — tappable, not drag area */}
        <div className="p-4 space-y-2 overflow-y-auto" style={{ touchAction: 'pan-y', maxHeight: '60vh' }}>
          {RADIUS_OPTIONS.map(function (r) {
            return (
              <button
                key={r}
                onClick={function () { handleRadiusSelect(r) }}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all"
                style={radius === r ? {
                  background: 'var(--color-primary-muted)',
                  borderColor: 'var(--color-primary)'
                } : {
                  background: 'var(--color-surface-elevated)',
                  borderColor: 'transparent'
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: radius === r
                        ? 'var(--color-primary)'
                        : 'var(--color-divider)'
                    }}
                  >
                    <span style={radius === r ? { color: 'var(--color-text-on-primary)' } : undefined}>
                      {r === 0 ? '\uD83C\uDF0E' : r <= 5 ? '\uD83D\uDEB6' : r <= 10 ? '\uD83D\uDE97' : r <= 25 ? '\uD83D\uDEE3\uFE0F' : r <= 100 ? '\u2708\uFE0F' : '\uD83C\uDF0E'}
                    </span>
                  </div>
                  <div className="text-left">
                    <p
                      className="font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {r === 0 ? 'Anywhere' : 'Within ' + r + ' ' + (r === 1 ? 'mile' : 'miles')}
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {r === 0 ? 'Show all dishes everywhere' : r === 1 ? 'Walking distance' : r === 5 ? 'Quick drive' : r === 10 ? 'Short trip' : r === 20 ? 'Across the area' : r === 25 ? 'Extended range' : r === 50 ? 'Island-wide' : r === 100 ? 'Regional (Boston, Cape, etc.)' : 'Cross-state'}
                    </p>
                  </div>
                </div>
                {radius === r && (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>

        {/* Clearance for bottom nav (64px) + home-indicator safe area */}
        <div style={{ height: 'calc(64px + env(safe-area-inset-bottom, 0px) + 0.5rem)' }} />
      </div>
    </div>
  )
}

/**
 * Combined LocationPicker with integrated sheet
 */
export function LocationPicker({ radius, onRadiusChange }) {
  var [showRadiusSheet, setShowRadiusSheet] = useState(false)

  return (
    <>
      <div className="px-4 py-2" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={function () { setShowRadiusSheet(true) }}
            aria-label={radius === 0 ? 'Showing dishes everywhere. Tap to change' : 'Search radius: ' + radius + ' miles. Tap to change'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-all hover:border-black/10"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-divider)',
              color: 'var(--color-text-primary)'
            }}
          >
            <span>{radius === 0 ? 'Anywhere' : 'Within ' + radius + ' mi'}</span>
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <RadiusSheet
        isOpen={showRadiusSheet}
        onClose={function () { setShowRadiusSheet(false) }}
        radius={radius}
        onRadiusChange={onRadiusChange}
      />
    </>
  )
}
