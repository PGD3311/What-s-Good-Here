# B3-activate + B5 — Execution Prep

**Date:** 2026-05-07
**Status:** Pre-staged. Open this doc the moment Apple Dev ID verification clears. Walk top-to-bottom.
**Estimated time end-to-end:** 8–13h focused work, split across two days is reasonable. Critical path is single-threaded — Dan must do most steps personally because they involve credentials + Apple Developer portal access.

This is the practical execution view. The canonical task spec lives at `docs/superpowers/plans/2026-04-21-oauth-native-plan-b.md` lines 3499–3601 (B3-activate) and lines ~3970+ (B5). This doc adds the sequencing, time budgets, and checkpoints so Dan doesn't have to figure out the order at 11pm.

---

## §0 — Prerequisites (must be ✅ before starting)

- [ ] **Apple Dev enrollment is ACTIVE** (not pending) — verify at https://developer.apple.com/account → Membership shows "Apple Developer Program" with active dates
- [ ] You are signed in to developer.apple.com with the Apple ID tied to enrollment
- [ ] You have access to the Supabase dashboard for project `vpioftosgdkyiwvhxewy`
- [ ] You have access to Vercel project settings to flip env vars
- [ ] You have your iPhone + Lightning/USB-C cable for the B5 real-device smoke test
- [ ] PR #143 (iPad drop) is merged — verified ✅ as of 2026-05-07

If any unchecked, stop and resolve. Don't try to acquire credentials before enrollment is fully active — Apple's developer portal will not let you create a Services ID or generate a SIWA key until the membership is fully active. (The Vault is Supabase's, not Apple's.)

---

## §1 — Phase A: Acquire Apple credentials (~45 min)

Done on developer.apple.com. **You'll need 5 values total** when this is over: Team ID, Bundle ID, Services ID, Key ID, and the .p8 private key file.

### A.1 Capture Team ID (1 min)

1. Sign in to https://developer.apple.com/account
2. Click **Membership** in the left sidebar
3. Copy the **Team ID** (10-character string, e.g. `7B2K9XYZ12`)
4. **Save it somewhere safe** — you need it 4 times in this flow:
   - Vault upload (`apple_team_id`)
   - AASA file replacement (`<TEAMID>` placeholder in `public/.well-known/apple-app-site-association`)
   - Supabase Apple provider config
   - Xcode signing (auto-detected but worth verifying)

### A.2 Bundle ID (already locked, 30 sec)

`com.whatsgoodhere.app` — already configured in Xcode + AASA + Capacitor. Do NOT change. Per `project_bundle_id` memory, this is locked for the lifetime of the app.

### A.3 Create Services ID (~10 min)

The Services ID is what Apple's web SIWA flow uses (in addition to the Bundle ID for native).

1. Developer portal → **Certificates, Identifiers & Profiles** → **Identifiers** (left sidebar)
2. Click the **+** button → select **Services IDs** → Continue
3. Description: `WGH Web Sign in with Apple`
4. Identifier: `com.whatsgoodhere.service`
5. Continue → Register
6. After creation, click into the new Services ID → check **Sign In with Apple** → click **Configure**
7. Primary App ID: select `com.whatsgoodhere.app`
8. In the Website URLs section (Apple's portal labels this as "Domains and Subdomains" + "Return URLs", or sometimes a single "Website URLs" section depending on portal version) — enter:
   - **Domain:** `wghapp.com`
   - **Return URL:** `https://vpioftosgdkyiwvhxewy.supabase.co/auth/v1/callback` (Supabase Auth callback)
9. Save → continue

### A.4 Create Sign in with Apple Key (~5 min) ⚠️ ONE-TIME DOWNLOAD

The .p8 private key can only be downloaded ONCE — at the moment of creation. If you lose it you must revoke and create a new one. Have a secure place ready BEFORE clicking Continue.

1. Developer portal → **Certificates, Identifiers & Profiles** → **Keys** (left sidebar)
2. Click **+**
3. Key Name: `WGH SIWA Key v1`
4. Check **Sign In with Apple** → click **Configure** → select Primary App ID `com.whatsgoodhere.app` → Save
5. Continue → Register
6. **Download the .p8 file IMMEDIATELY** — it's only available on this screen. Save it as `AuthKey_<KEYID>.p8` in a secure location (1Password / encrypted drive, not Desktop).
7. Copy the **Key ID** displayed on the same screen (10-character string).

If you fumble the download: revoke the key on this screen, create a new one. Don't try to work around it.

### A.5 App ID configuration (~3 min)

Confirm the existing App ID has Sign In with Apple capability enabled.

1. Developer portal → **Identifiers** → find `com.whatsgoodhere.app` (App ID, not Services ID) → click into it
2. Scroll to **Capabilities** → confirm **Sign In with Apple** is checked
3. If not checked: check it → click **Save** → confirm in dialog
4. If you had to enable it: this regenerates provisioning profiles. Xcode may need to refresh signing in step §3.B5.1 below.

### A.6 You should now have 5 values + 1 file

| Value | Format | Where it goes |
|---|---|---|
| Team ID | 10-char | Vault `apple_team_id`, AASA, Supabase Apple config |
| Bundle ID | `com.whatsgoodhere.app` | Vault `apple_bundle_id`, Supabase Client IDs |
| Services ID | `com.whatsgoodhere.service` | Vault `apple_services_id`, Supabase Client IDs |
| Key ID | 10-char | Vault `apple_key_id_v1`, Supabase Apple config |
| .p8 file | text/PEM | Vault `apple_signing_key_v1`, Supabase Apple config |

---

## §2 — Phase B: B3-activate (~3–4h)

### B.1 Vault upload (~15 min)

Supabase dashboard → SQL Editor → run:

```sql
SELECT vault.create_secret(
  '<paste FULL .p8 contents here, including BEGIN/END PRIVATE KEY lines>',
  'apple_signing_key_v1',
  'Apple SIWA .p8 private key for signing client secret JWTs. v1.'
);
SELECT vault.create_secret('<TEAM_ID>', 'apple_team_id', 'Apple Developer Team ID');
SELECT vault.create_secret('<KEY_ID>', 'apple_key_id_v1', 'Key ID for apple_signing_key_v1');
SELECT vault.create_secret('com.whatsgoodhere.service', 'apple_services_id', 'Apple Services ID for web SIWA');
SELECT vault.create_secret('com.whatsgoodhere.app', 'apple_bundle_id', 'Apple Bundle ID for native SIWA');
```

Verify all 5 are present:

```sql
SELECT name FROM vault.secrets WHERE name LIKE 'apple_%' ORDER BY name;
-- Expected 5 rows: apple_bundle_id, apple_key_id_v1, apple_services_id, apple_signing_key_v1, apple_team_id
```

⚠️ `apple_encryption_master_key_v1` MUST also be present (created in B1.2 of the canonical Plan B doc, lines 173-199). The shared Apple helpers depend on it. If missing, **stop and create it before proceeding** — this is a blocker, not optional fluff. Run:

```sql
SELECT name FROM vault.secrets WHERE name = 'apple_encryption_master_key_v1';
-- Expected: 1 row. If 0 rows, go to Plan B doc §B1.2 and create the key now.
```

### B.2 Supabase Apple provider config (~10 min)

Supabase dashboard → **Authentication** → **Providers** → **Apple** → click to expand:

- **Enabled:** ON
- **Client IDs:** `com.whatsgoodhere.app,com.whatsgoodhere.service` (comma-separated, NO spaces)
- **Secret Key:** leave blank (using .p8 flow)
- **Team ID:** paste from §1.A.1
- **Key ID:** paste from §1.A.4
- **.p8 file:** paste contents (or upload depending on dashboard UI)

Save.

Then **Authentication** → **URL Configuration** → **Additional Redirect URLs** → add (if not already present):
- `https://wghapp.com/**`
- `capacitor://localhost/**`

Keep existing `whats-good-here.vercel.app` entries — they're for preview deploys.

### B.3 AASA Team ID replacement (~2 min)

Edit `public/.well-known/apple-app-site-association` — find the `<TEAMID>` placeholder (or whatever the current placeholder string is) and replace with your Team ID:

```bash
grep -n "TEAMID\|appID" public/.well-known/apple-app-site-association
# Expected pattern: "appID": "<TEAMID>.com.whatsgoodhere.app"
# Replace <TEAMID> with the 10-char string from §1.A.1
```

After edit, `appID` should look like: `"appID": "7B2K9XYZ12.com.whatsgoodhere.app"` (your Team ID).

Commit this change. Vercel will redeploy; verify the live AASA file at `https://wghapp.com/.well-known/apple-app-site-association` reflects it.

### B.4 Activate pg_cron schedule (~5 min)

Supabase SQL Editor → run:

```sql
ALTER DATABASE postgres SET app.service_role_key = '<service-role-jwt>';

SELECT cron.schedule(
  'apple-revocation-retry',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/apple-revocation-retry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Verify
SELECT jobname, schedule FROM cron.job WHERE jobname = 'apple-revocation-retry';
-- Expected: 1 row with jobname = 'apple-revocation-retry', schedule = '*/15 * * * *'
```

Get the service-role JWT from Supabase dashboard → **Project Settings** → **API** → **service_role secret**.

### B.5 Flip prod feature flag (~5 min)

Vercel dashboard → **Project Settings** → **Environment Variables** → set for **Production**:

```
VITE_FEATURES_APPLE_SIGNIN=true
```

Trigger a rebuild. Verify on `wghapp.com` after deploy that the Apple sign-in button is visible on the login modal.

### B.6 Smoke tests (~30 min)

| Test | Steps | Expected |
|---|---|---|
| Web Apple sign-in | wghapp.com → log in modal → Continue with Apple → complete flow | New session created; row in `user_apple_tokens` with `client_id_type='web'` |
| Account deletion (Apple user, online) | Sign in with Apple → Profile → gear → Delete Account → DELETE → device online | Canonical Case A: inline revoke succeeds. **`pending_apple_revocations` should be EMPTY for this user_id after** — NOT have a queued row. A row only persists if revocation failed or device was offline. |
| Cron retry — first invocation | Insert a known-invalid pending revocation row (`attempts = 0`) → manually invoke `apple-revocation-retry` Edge Function → re-query the row | The row's `attempts` increments to 1 and `next_attempt_at` advances per the staged backoff. **It does NOT move to dead-letter on a single run** — that requires `attempts = 10`. To smoke the dead-letter path specifically, seed a row at `attempts = 9` first, then invoke. |

If any test fails: **STOP — do not proceed to B5**. Roll back the prod flag (`VITE_FEATURES_APPLE_SIGNIN=false`) until you fix.

---

## §3 — Phase C: B5 — Xcode + Real Device + TestFlight (~5–7h)

### C.1 Apple HIG button fix (~30–60 min) — **DO THIS BEFORE EVERYTHING ELSE IN PHASE C**

Codex flagged the existing hand-drawn SVG Apple sign-in button in `LoginModal.jsx:283-302` and `Login.jsx:394-413` as a known App Store rejection risk. Apple HIG requires their official asset proportions, padding, and corner radius.

Two options:
- **(A) Drop in `react-apple-signin-auth`** — use only its button styling component (`<AppleLoginButton />`); auth flow stays on Supabase. Minimal change.
- **(B) Apple's official SVG asset** — download from https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple/overview/buttons/ — replace the inline SVG with the official asset.

Recommend (A) for speed. Do this BEFORE C.2 so the first TestFlight build Apple reviews is clean.

### C.2 Add Sign in with Apple capability in Xcode (~5 min)

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** target → **Signing & Capabilities** tab
3. Click **+ Capability** → search "Sign in with Apple" → double-click
4. Confirm `App.entitlements` now contains `com.apple.developer.applesignin` (Xcode auto-edits this)
5. Verify the `Team` dropdown shows your Apple Dev account

### C.3 Info.plist + PrivacyInfo audit (~15 min)

- `Info.plist`: confirm SIWA keys present per Apple HIG checklist
- **Add `whatsgoodhere` custom URL scheme** as a fallback for when universal links fail (canonical Plan B B5.1 lines 3993-4011 requires this — currently `Info.plist:75-83` only has the Google scheme). Add a new `<dict>` entry under `CFBundleURLTypes` with `CFBundleURLSchemes` = `["whatsgoodhere"]`. Without this, password-reset / magic-link emails that fail universal-link dispatch have no fallback path back to the app.
- `PrivacyInfo.xcprivacy`: already updated 2026-05-06 in PR #140 — should reflect SearchHistory, UserID, DeviceID, OtherDataTypes, OtherDiagnosticData, no PreciseLocation. Verify nothing got reverted by the Xcode capability add.

### C.4 Real-device smoke (~60–90 min) — phone in hand, NOT simulator

Connect iPhone via cable. In Xcode → select your device → ▶ Run.

Test matrix (everything must pass):

| Flow | Steps |
|---|---|
| Cold launch | Force-quit, relaunch, verify home screen loads, demo content visible |
| Email sign-in | Sign in with `walshdaniel143+wghdemo@gmail.com` / `WGH33!` — confirm session, profile loads |
| Apple sign-in (first time) | Tap "Continue with Apple" → consent → choose Hide My Email → confirm new account created |
| Apple sign-in (returning) | Sign out → "Continue with Apple" → confirm same account returned |
| Google sign-in | "Continue with Google" → confirm session |
| Account deletion (Apple user) | Sign in with Apple → Profile → gear → Delete Account → confirm with DELETE → verify revocation row created |
| Magic link | Forgot password → enter email → check email on iPhone → tap link → app opens (universal link) |
| Universal link from Mail | Reset link should open in app, NOT Safari |
| Cold start with location prompt | First launch, allow/deny — both paths work |
| Photo upload | Take photo of demo dish → upload → confirm appears on dish detail |

**Note any device-only issues vs simulator.** Don't fix them today unless they're submission-blockers — log them.

### C.5 Build for TestFlight (~30 min)

1. Xcode → **Product** → **Archive**
2. When archive completes → **Distribute App** → **App Store Connect** → **Upload**
3. Wait for upload + Apple processing (10–30 min)
4. App Store Connect → My Apps → What's Good Here → **TestFlight** tab → confirm new build appears
5. Add yourself + Denis as internal testers (if not already done)
6. Install via TestFlight on your iPhone — confirm it installs as if from the App Store

### C.6 TestFlight smoke (~30 min)

Run the same matrix from C.4 but on the TestFlight build (not the dev build). Catches code-signing issues that don't appear in dev builds.

---

## §4 — Phase D: App Store Connect submission (~30 min)

Open `docs/superpowers/specs/2026-05-06-app-store-submission-day.md` and walk top-to-bottom. Every field has paste-ready content.

Confirm before clicking Submit:
- [ ] Phone field has a real number (not placeholder)
- [ ] Demo account works on the submitted TestFlight build
- [ ] Privacy nutrition label answers match the app — paste-ready in the doc
- [ ] Age rating answers entered — derived rating shows 12+
- [ ] Screenshots uploaded (5 at 1320×2868)
- [ ] Reviewer notes pasted (canonical block in the doc)
- [ ] Manual release selected (gives Dan launch-timing control)

Click **Add for Review** → fix any red errors → **Submit for Review**.

---

## §5 — After submission

- Apple review: typically 24–72h. SIWA + UGC may add a day.
- Watch `walshdaniel143@gmail.com` for ASC notifications + `wghapp@wghapp.com` for any reviewer follow-ups
- Don't push new TestFlight builds while in review (confuses reviewer about which build is canonical)
- If rejected: see §10 of submission-day doc for rejection playbook
- Once approved: status changes to **"Pending Developer Release"** — Dan clicks **"Release This Version"** at chosen launch moment

---

## §6 — Time budget summary

| Phase | Estimated | Critical path |
|---|---|---|
| §1 Acquire credentials | 45 min | Yes — Dan in Apple portal |
| §2 B3-activate | 3–4h | Yes — Dan in Supabase + Vercel |
| §3 B5 Xcode + device + TestFlight | **6–8h smooth, 8–10h if first signing / universal-link snag** (incl HIG button fix, Info.plist URL-scheme fallback, full smoke matrix, archive + TestFlight install + second smoke pass) | Yes — Dan in Xcode |
| §4 ASC submission | 30 min | Yes — Dan pasting |
| §5 Apple review | 24–72h | No — Apple's clock |
| **Total before Apple review** | **~11–14h focused work** | |

Realistic: spread over 1.5–2 days. Don't try to do all in one sitting — fatigue mistakes at Phase C.6 are the worst kind.

---

## §7 — If something goes wrong

| Issue | Likely cause | Fix |
|---|---|---|
| Vault upload errors on .p8 | Pasted without BEGIN/END lines | Re-paste the FULL file contents |
| Supabase Apple provider rejects key | Wrong Key ID or Team ID | Double-check the IDs match what's on developer.apple.com |
| Apple sign-in returns "invalid client" | Services ID return URL doesn't include Supabase callback | Re-check §1.A.3 step 9 |
| AASA file not validating | Vercel cache or wrong content-type | Hit https://branch.io/resources/aasa-validator/ to debug; force Vercel re-deploy |
| Xcode SIWA capability shows red | Provisioning profile not refreshed | Xcode → Signing & Capabilities → "Automatically manage signing" off-and-on, or wait 1 min |
| Real-device Apple sign-in fails silently | Capgo native plugin not installed | Verify in `package.json` + run `npx cap sync ios` again |
| TestFlight upload stuck "Processing" | Apple-side queue delay | Wait 30+ min; if still stuck, Archive again — sometimes the first upload silently fails |
| Apple sign-in returns no name/email on "first time" test | Apple only returns full name on the FIRST sign-in per Apple ID; reusing the same Apple ID without revoking app access first won't reproduce first-time behavior | Settings → Apple ID → Sign In with Apple → find "What's Good Here" → Stop Using Apple ID. Then re-test from a clean state |
| `cron.schedule` SQL fails or behaves oddly | A previous `apple-revocation-retry` job already exists | Check first: `SELECT jobname FROM cron.job WHERE jobname = 'apple-revocation-retry';` If present, unschedule before re-running: `SELECT cron.unschedule('apple-revocation-retry');` |
| Universal links still open in Safari instead of app | iOS keeps stale AASA association state even after the live file is correct | Delete the app from device → reinstall via TestFlight → Apple re-fetches AASA. Also try waiting 5–10 min for AASA cache TTL |

---

## §8 — Source docs

| Topic | Source |
|---|---|
| B3-activate canonical task list | `docs/superpowers/plans/2026-04-21-oauth-native-plan-b.md` lines 3499–3601 |
| B5 canonical task list | Same file, lines ~3970+ |
| App Store submission paste guide | `docs/superpowers/specs/2026-05-06-app-store-submission-day.md` |
| Reviewer notes (paste-ready) | `docs/superpowers/specs/2026-05-03-app-store-reviewer-notes.md` |
| Privacy nutrition label answers | `docs/app-store-connect-privacy-details.md` |
| Age rating answers | `docs/superpowers/specs/2026-05-06-app-store-age-rating.md` |
| What's New copy | `docs/superpowers/specs/2026-05-06-app-store-whats-new.md` |
| Google killswitch (contingency only) | `docs/superpowers/specs/2026-05-06-google-killswitch-contingency.md` |
| Apple Dev wait + decision tree | `docs/superpowers/plans/2026-05-06-apple-dev-wait-plan.md` |

If this doc and a source disagree, **the source wins** for canonical task content. This doc is the sequencing + practical layer on top.
