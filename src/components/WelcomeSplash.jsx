import { useState, useEffect } from 'react'
import { SmileyPin } from './SmileyPin'

// Total visible time before fade-out starts. CSS choreography lands by ~0.8s;
// we hold until 1.2s, then fade out 0.3s — total 1.5s splash.
const SPLASH_DURATION_MS = 1200
const FADE_OUT_MS = 300

// Module-level flag — persists across re-renders within a session so
// the splash doesn't replay when Layout remounts for any reason.
let hasShownThisSession = false

export function WelcomeSplash() {
  const [phase, setPhase] = useState('visible')
  const [shouldShow, setShouldShow] = useState(() => !hasShownThisSession)

  useEffect(() => {
    if (hasShownThisSession) return
    hasShownThisSession = true

    const fadeTimer = setTimeout(() => setPhase('fade-out'), SPLASH_DURATION_MS)
    const hideTimer = setTimeout(() => setShouldShow(false), SPLASH_DURATION_MS + FADE_OUT_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  const handleSkip = () => {
    setPhase('fade-out')
    setTimeout(() => setShouldShow(false), FADE_OUT_MS)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSkip()
    }
  }

  if (!shouldShow) return null

  return (
    <div
      className="wgh-splash"
      style={{ opacity: phase === 'fade-out' ? 0 : 1 }}
      onClick={handleSkip}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Welcome splash screen. Press Enter or tap to skip."
    >
      <SmileyPin size={186} animated />
      <div className="wgh-splash__wordmark">
        <div className="wgh-splash__rule" />
        <div className="wgh-splash__text">
          <span className="wgh-splash__b1" style={{ display: 'inline-block' }}>
            <span className="wgh-splash__line wgh-splash__letter">what&rsquo;s</span>
            <span className="wgh-splash__line wgh-splash__letter">good</span>
            <span className="wgh-splash__line wgh-splash__letter">
              here<span className="wgh-splash__period">.</span>
            </span>
          </span>
        </div>
        <div className="wgh-splash__rule" />
      </div>
    </div>
  )
}
