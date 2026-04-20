# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-04-20 (end of night)

---

## Active handoff

**No active sessions.** Xcode-simulator phase wrapped tonight. Dan is stopping here.

---

## Where we are

Went from Capacitor scaffold → working native iOS app in one session. Six PRs merged to main (#67–#72), all on simulator:

- #67 `places-details` — disable gateway JWT verify so new anon key works
- #68 `add-restaurant` — surface real error (catch block was swallowing it)
- #69 `BottomNav` — don't crush icons under iOS home-indicator safe area
- #70 `edge-fns` — allowlist Capacitor origins so native iOS reaches Places + parse-menu
- #71 `ios` — radius sheet bottom clipping + `NSLocationWhenInUseUsageDescription`
- #72 `useRestaurantManager` — Rules of Hooks fix (early return after `useEffect`); ErrorBoundary + logger now surface real errors

What works on simulator: app boot, Add Restaurant end-to-end, sign-in (email), location permission, safe-area handling everywhere, clean icons, real error reporting.

## Next session — real-device testing

Plug in a real iPhone, pick it from Xcode's device selector, run. Simulator ≠ device for:

- Haptics
- Push notifications
- Deep links / universal links
- Real network conditions
- Actual GPS (not simulated Cupertino)
- Camera / photo picker

Fix anything that breaks on device that didn't break in simulator.

## Known launch risks (not tonight)

- **OAuth on native is probably broken.** `LoginModal.buildOAuthRedirect()` uses `window.location.href`, which in Capacitor is `capacitor://localhost/...`. Google won't redirect back to a custom scheme. Fix is `@capacitor/browser` + deep-link return, or native Google Sign-In plugin. Dan signed in with email tonight — verify Google path before launch.
- **Google Places TOS deferrals** (per memory `project_google_places_compliance`): Leaflet map showing Places pins, and missing `attributions` field from Places Details. Both flagged for pre-submission.
- **Virtual business address** not set up yet — Privacy/Terms ship with email-only for now.
- **2026-04-30 checkpoint:** if no TestFlight build + account deletion live by then, flip to PWA-primary per the App Store launch memory.

## App Store path (rough order)

1. Confirm certs + provisioning profiles in Xcode Signing & Capabilities
2. Real-device run
3. Fix OAuth-on-native
4. Resolve Google Places deferrals
5. App Store Connect setup (screenshots, description, privacy, age rating)
6. TestFlight build + internal testers
7. Submit

## Not this session

- Menu-refresh 401 fix (still open per memory)
- Post-launch features deferred: scoring history, Ask WGH, FriendsFeed, TastePersonalityCard

---

## Protocol

- **Update BEFORE touching files.** If you skip the update, you are the collision.
- **Clear the "Active handoff" block when the session ends.** Stale handoff is worse than none.
- **If `Last updated` is >24h old, treat the file as stale** — ask Dan what's current.
- **One active handoff per surface.** Parallel sessions OK if scopes don't overlap; append a second handoff block.
