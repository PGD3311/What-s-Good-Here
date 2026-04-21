import { getSessionItem, setSessionItem, removeSessionItem } from '../lib/storage'

const STATE_KEY = 'wgh_chunk_reload_state'
const MAX_ATTEMPTS = 2
const WINDOW_MS = 2 * 60 * 1000

export function isChunkLoadError(error) {
  const msg = error?.message || ''
  const name = error?.name || ''

  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch')
  ) return true

  // Safari when a missing chunk is rewritten to index.html and parsed as JS:
  // "Unexpected token '<'" (HTML's opening angle bracket) surfaces as a SyntaxError.
  if (name === 'SyntaxError' && msg.includes("Unexpected token '<'")) return true
  if (msg.includes('Unable to resolve specifier')) return true

  return false
}

function readState() {
  const raw = getSessionItem(STATE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.attempts === 'number' && typeof parsed?.firstAttemptAt === 'number') {
      return parsed
    }
  } catch {
    // Stale or corrupt entry — treat as absent.
  }
  return null
}

export function tryChunkReload(reload = () => window.location.reload()) {
  const now = Date.now()
  const state = readState()
  const withinWindow = state && now - state.firstAttemptAt <= WINDOW_MS
  const nextAttempt = withinWindow ? state.attempts + 1 : 1

  if (nextAttempt > MAX_ATTEMPTS) return false

  setSessionItem(
    STATE_KEY,
    JSON.stringify({
      attempts: nextAttempt,
      firstAttemptAt: withinWindow ? state.firstAttemptAt : now,
    })
  )
  reload()
  return true
}

export function clearChunkReloadState() {
  removeSessionItem(STATE_KEY)
}
