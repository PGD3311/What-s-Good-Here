# `.well-known/` — Apple App Site Association (AASA)

This directory hosts the AASA file that iOS fetches to learn which web URLs the
What's Good Here native app should claim as universal links.

## File

- `apple-app-site-association` — JSON, **no extension** (iOS spec requirement).
- Served at `https://wghapp.com/.well-known/apple-app-site-association`.
- `Content-Type: application/json` is forced via a header rule in `vercel.json`
  (Vercel doesn't infer the type from an extensionless filename).

## ⚠️ `<TEAMID>` placeholder — must be replaced before app install

The `appIDs` field currently reads `"<TEAMID>.com.whatsgoodhere.app"`. The
literal string `<TEAMID>` is a deliberate marker, not a real Team ID.

**Why a placeholder?** As of the OAuth Plan B B4.1 ship, Apple Developer
verification has not cleared, so we don't know our 10-character Team ID yet.
Apple will reject the AASA structurally until this is replaced with the real
ID, but iOS only re-verifies AASA on app install — meaning we can replace it
in the same window we register the App ID.

**When to replace:**

- During **B3-activate**, once Apple Developer credentials land and the App ID
  `com.whatsgoodhere.app` is registered, copy the 10-character Team ID from
  the Apple Developer portal (Membership page) and replace `<TEAMID>` with it.
- The replacement is a single-string substitution in this file — no other
  changes needed.
- Re-deploy to Vercel; the next iOS app install will pick up the corrected
  AASA.

**How to verify after replacement:**

```bash
curl -sI https://wghapp.com/.well-known/apple-app-site-association \
  | grep -i content-type
# expect: content-type: application/json

curl -s https://wghapp.com/.well-known/apple-app-site-association \
  | jq '.applinks.details[0].appIDs'
# expect: ["ABCD123456.com.whatsgoodhere.app"] (no angle brackets)
```

Apple's CDN-cached AASA endpoint (`app-site-association.cdn-apple.com`) refreshes
within ~24h after the file changes; for development you can install via Xcode
which forces a direct fetch.

## CI guard

`.github/workflows/aasa-check.yml` runs on every push to `main` and validates:

- HTTP 200, no redirects
- `Content-Type: application/json`
- Schema: `applinks.details[0].appIDs` non-empty, `paths` non-empty

The CI does **not** validate that `<TEAMID>` has been replaced — it can't,
because we don't know the real ID at CI time. That's a manual checklist item
during B3-activate.
