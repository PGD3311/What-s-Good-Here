import { Capacitor } from '@capacitor/core'
import { logger } from './logger'

// Open external links via @capacitor/browser on native iOS (SFSafariViewController)
// instead of the in-app WebView, where target="_blank" has no usable back gesture.
// On web, lets the default <a target="_blank"> behavior run unchanged.
//
// Usage: <a href={url} target="_blank" rel="noopener noreferrer"
//          onClick={(e) => openExternalLink(e, url)}>...</a>
export async function openExternalLink(event, url) {
  if (!Capacitor.isNativePlatform()) return
  event?.preventDefault?.()
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } catch (err) {
    logger.warn('openExternalLink failed; falling back to default link behavior', err)
  }
}
