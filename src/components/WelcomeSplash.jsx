import { useState, useEffect, useMemo } from 'react'
import { SmileyPin } from './SmileyPin'

// Total animation runtime before natural dismiss (ms).
// Matches CSS timing: wink fires at 4.2s, period ghosts in at 4.7s + 0.55s.
// Hold ~0.6s after the period settles so the final state reads as intentional.
const SPLASH_DURATION_MS = 5800
const FADE_OUT_MS = 300

// Module-level flag — persists across re-renders within a session so
// the splash doesn't replay when Layout remounts for any reason.
let hasShownThisSession = false

function makeLine(chars, baseDelay) {
  const n = chars.length
  const center = (n - 1) / 2
  const maxDist = center + 0.001
  return chars.map((ch, i) => {
    const side = i - center
    const t = Math.abs(side) / maxDist
    // V-shape: outer letters lift highest, center letters lift least. Negative = up.
    const dy = -(6 + t * 32)
    // Tilt outward — left CCW, right CW — strongest at edges.
    const rot = Math.sign(side) * t * 14
    const style = {
      '--dy': `${dy}px`,
      '--rot': `${rot}deg`,
      '--delay': `${baseDelay}s`,
    }
    return (
      <span key={i} className="wgh-splash__letter" style={style}>
        {ch}
      </span>
    )
  })
}

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

  const whats = useMemo(() => makeLine(['w', 'h', 'a', 't', '\u2019', 's'], 0.65), [])
  const good = useMemo(() => makeLine(['g', 'o', 'o', 'd'], 0.85), [])
  const here = useMemo(() => makeLine(['h', 'e', 'r', 'e'], 1.05), [])

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
            <span className="wgh-splash__line">{whats}</span>
            <span className="wgh-splash__line">{good}</span>
            <span className="wgh-splash__line">
              {here}
              <span className="wgh-splash__period">.</span>
            </span>
          </span>
        </div>
        <div className="wgh-splash__rule" />
      </div>
    </div>
  )
}
