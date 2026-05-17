import { useEffect, useRef, useCallback } from 'react'

/**
 * Custom hook for trapping focus within a modal/dialog
 * Also handles Escape key to close
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback to close the modal
 * @param {Object} [options] - Optional configuration
 * @param {Object} [options.initialFocusRef] - Ref to focus when modal opens (overrides first-focusable default)
 * @returns {Object} - ref to attach to the modal container
 */
export function useFocusTrap(isOpen, onClose, { initialFocusRef } = {}) {
  const containerRef = useRef(null)
  const previousActiveElement = useRef(null)

  // Store the previously focused element when modal opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement
    }
  }, [isOpen])

  // Focus first focusable element when modal opens
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus({ preventScroll: true })
        return
      }
      // Re-check containerRef.current — it may have been unmounted between
      // scheduling and running the frame (fast open→close transitions).
      if (!containerRef.current) return
      const focusableElements = getFocusableElements(containerRef.current)
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    })
  }, [isOpen, initialFocusRef])

  // Restore focus when modal closes
  useEffect(() => {
    if (!isOpen && previousActiveElement.current) {
      previousActiveElement.current.focus()
      previousActiveElement.current = null
    }
  }, [isOpen])

  // Also restore focus on unmount — many callers (e.g. FollowListModal) toggle
  // visibility by conditional render rather than flipping `isOpen` to false,
  // so the effect above never fires. Without this cleanup, keyboard focus is
  // orphaned on <body> after the modal goes away.
  useEffect(() => {
    return () => {
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
        previousActiveElement.current = null
      }
    }
  }, [])

  // Handle keyboard events
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return

    // Close on Escape
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
      return
    }

    // Trap focus on Tab
    if (e.key === 'Tab' && containerRef.current) {
      const focusableElements = getFocusableElements(containerRef.current)
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }
  }, [isOpen, onClose])

  // Add keyboard listener
  useEffect(() => {
    if (!isOpen) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  return containerRef
}

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container) {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')

  return Array.from(container.querySelectorAll(focusableSelectors))
    .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
}

export default useFocusTrap
