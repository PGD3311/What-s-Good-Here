import { useEffect } from 'react'

const BASE_TITLE = "What's Good Here"

/**
 * Sets document.title to `${title} — What's Good Here`, restoring the bare
 * BASE_TITLE on unmount. Pass `null` or an empty string while data is loading
 * (e.g. waiting on a dish or restaurant name) — the title stays as BASE_TITLE
 * until you have something specific to surface.
 *
 * Web only: iOS Capacitor users don't see this. SEO crawlers and shared-link
 * previews are the audience.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE_TITLE}` : BASE_TITLE
    return () => { document.title = BASE_TITLE }
  }, [title])
}
