import { Capacitor } from '@capacitor/core'

// Jitter trust scoring measures per-keystroke typing rhythm, captured from
// keydown/keyup events. On native iOS (Capacitor WKWebView) the soft keyboard
// — autocorrect, predictive text, swipe-typing, dictation — does not emit
// reliable per-character keydown events, so rhythm samples never reach the
// 10-flight-time floor and the score can never advance past "Building".
// Showing a "building trust / verify yourself" state there is a promise no
// mobile user can fulfill, so we suppress the Building state on native.
//
// Verified/Trusted states still render (a user who reached them on web keeps
// the credit when viewing on the app). Only the dead-end Building state is hidden.
//
// Background: wgh-phone #180 (root cause) and #174 (strategy).
export function jitterTrustVisible() {
  return !Capacitor.isNativePlatform()
}
