// App-wide constants

// Minimum votes required for a dish to be considered "ranked"
// Dishes with fewer votes show as "Early" with less prominent display
export const MIN_VOTES_FOR_RANKING = 5

// Maximum character length for review text
export const MAX_REVIEW_LENGTH = 200

// Minimum votes required for value score eligibility
export const MIN_VOTES_FOR_VALUE = 8

// Value percentile threshold for "GREAT VALUE" badge (top 10%)
export const VALUE_BADGE_THRESHOLD = 90

// iOS bundle identifier. Must match capacitor.config.ts appId, the App ID in
// Apple Developer portal, and the CFBundleIdentifier in the generated Xcode
// project. Used by Sign in with Apple (H2) as the native client_id when
// calling signInWithIdToken on iOS.
export const IOS_BUNDLE_ID = 'com.whatsgoodhere.app'
