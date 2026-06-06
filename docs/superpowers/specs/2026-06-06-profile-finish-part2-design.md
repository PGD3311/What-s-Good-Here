# Profile Finish (Part 2) — calm header + tab cleanup

**Date:** 2026-06-06
**Status:** Design approved, pending Codex + user review
**Builds on:** the V1 food-story grid (shipped to production, PR #312) and the live tweaks (chalkboard removed, dates on tiles).

## Problem

V1 made the grid the spine of the profile, but the page around it is still busy:
a full "Find people" search bar, an unrated-photos banner, a big standalone
"Edit my Top 10" curator card, a four-tab strip (Journal/Visits/Playlists/Saved),
a now-orphaned "Your Food Story" heading, and a `HeroIdentityCard` whose right
side carries a cryptic "Building / New rhythm" Jitter box. The top of the page
doesn't read as intentional. Part 2 finishes the job: a calmer left-aligned
header (Jitter box out, conditional chips in) and a trimmed tab set.

Scope was chosen by Dan: **header polish + fold curator entry into header + tab
cleanup**. The people-search bar is deliberately **kept** as-is (not shrunk to an
icon).

## Decisions (locked in brainstorm)

1. **Header = "Left-aligned identity" (mock option B):** avatar left; to its
   right a column with the name + ✎ edit (trust chip at the far right of that
   name row), the two-tier stats stacked below, and the curator pill beneath
   them. This keeps the current left-aligned structure (consistent with the
   public profile header) — the "polish" is removing the Jitter box and adding
   the two conditional chips, not re-centering.
2. **Kill the "Building / New rhythm" Jitter box** in `HeroIdentityCard`.
3. **Trust chip shows only when meaningful, via the shared `TrustBadge`** —
   reuse the same component + source the public profile uses (`jitterApi.
   getTrustBadgeType`), rendering only for `human_verified` / `trusted_reviewer`.
   **Never show the "Building" state.** Reusing `TrustBadge` guarantees identical
   copy ("Verified Human" / "Trusted Reviewer") across owner and public headers.
4. **Curator "Edit Top 10" folds into the header** as an inline gold pill (only
   when `is_local_curator`); the big standalone card is removed.
5. **Tabs → Grid · Lists · Saved**, grid-first. Rename Journal→Grid,
   Playlists→Lists; **drop the Visits tab**.
6. **Drop the "Your Food Story" heading** above the grid.
7. **No redundant 🔍** in the header — the search bar stays, so no icon dupe; the
   app's global ⚙️/🔔 already live in the top chrome.
8. **Out of scope:** the people-search bar (kept), the unrated-photos banner
   (kept as-is).

## Components & changes

### `src/components/profile/HeroIdentityCard.jsx`
- **Layout → keep left-aligned (mock B).** Avatar on the left; a right-hand
  column with the name row, the stats, and the curator pill. This is the current
  structure — do NOT re-center. Keep the name-edit affordance and `followCounts`
  tap targets (followers/following open the FollowListModal — preserve those
  handlers).
- **Name row:** name + inline ✎ edit on the left; the **trust chip** sits at the
  far right of this row (where the Jitter box used to anchor).
- **Stats → unchanged two-tier, left-aligned.** Preserve the #310/#311 split
  exactly: content line (`<b>N</b> dishes · <b>N</b> spots`, shown when
  `stats.totalVotes > 0`) and social line (`<b>N</b> followers · <b>N</b>
  following`, always) below it. Follower/following stay tappable spans wired to
  `setFollowListModal`. No change here beyond what the Jitter-box removal frees
  up.
- **Remove the Jitter "fingerprint" box** (the `reviewCount` + rhythm + tier card
  and its expand panel) from this component.
- **Chips:**
  - **Curator pill** — `✎ Edit Top 10`, beneath the stats, left-aligned; shown
    only when `isCurator` is true; calls `onEditTop10`. Gold outline pill
    (`var(--color-accent-gold)`).
  - **Trust chip** — render the shared `<TrustBadge type={trustBadgeType} />`
    (import from `../TrustBadge`) at the far right of the **non-editing** name
    row, ONLY when `trustBadgeType === 'human_verified' || trustBadgeType ===
    'trusted_reviewer'`. Do NOT use the old `getTierInfo`/`jitterTrustVisible`
    path (it leaks "Building" on web and uses different copy). For any other
    value (incl. null / "Building"), render nothing — the name row is just name +
    ✎. **Edit mode:** when `editingName` is true the row becomes the input/save/
    cancel stack — do NOT render the chip there; it only appears in the
    non-editing name view.
- **Placement summary (mock B):** trust chip rides the (non-editing) name row;
  curator pill sits below the two stat lines. Each is independently conditional —
  a non-curator Verified user shows only the chip; a curator with no badge shows
  only the pill; a plain new user shows neither (clean header).
- **New props:** `isCurator: boolean`, `onEditTop10: () => void`,
  `trustBadgeType: string | null`. (Remove the component's internal `getTierInfo`/
  jitter-box logic and the `jitterProfile`-driven fingerprint card; the chip is
  now driven purely by `trustBadgeType`.)

### `src/pages/Profile.jsx`
- **Remove the standalone curator "Edit my Top 10" card** (the
  `profile.is_local_curator` block — currently a `<Link to="/my-list">`). Instead
  pass `isCurator={profile?.is_local_curator}` and `onEditTop10={() =>
  navigate('/my-list')}` to `HeroIdentityCard`. The destination is **`/my-list`**
  (the existing card's target) — preserve it exactly.
- **Trust badge type:** fetch it the same way `UserProfile.jsx` does —
  `jitterApi.getJitterBadges([user.id])` then `jitterApi.getTrustBadgeType(badges[0])`
  — and pass the result as `trustBadgeType` to `HeroIdentityCard`. (Profile.jsx
  already imports `jitterApi` for `getMyProfile`; this is one more call in the
  same effect. The old `jitterProfile` prop wiring for the fingerprint box can be
  dropped once the box is gone.)
- **Tabs:** change the tab model from `['journal','visits','playlists','saved']`
  to `['journal','playlists','saved']`. **Keep the internal keys** (`journal`,
  `playlists`, `saved`) to avoid churn; only change the **display labels** to
  **Grid / Lists / Saved** via a `{ key → label }` map. Default tab unchanged
  (`journal`/grid first). No stale-tab fallback machinery needed — `activeTab` is
  local state initialized to `'journal'`, not persisted.
- **Remove the Visits tab content block** (the `activeTab === 'visits'` section
  rendering `RecentVisitsList`) and its tab button.
- **Delete the now-dead `RecentVisitsList`** — after dropping the Visits tab it
  has zero consumers (`Profile.jsx` is its only one). Remove
  `src/components/profile/RecentVisitsList.jsx`, its barrel export in
  `src/components/profile/index.js`, and any `RecentVisitsList.test.*` if present
  (grep to confirm zero references before deleting). Per CLAUDE.md, dead code
  isn't committed. (Check-ins data is unaffected; only this profile retrieval tab
  goes away — a decision Dan made when choosing Grid · Lists · Saved.)
- **Drop the "Your Food Story" `<h2>` heading** above `<ProfileGrid>` in the grid
  tab (the grid stands on its own).
- Keep the people-search bar and unrated-photos banner exactly as they are.

## Edge cases
- **Non-curator, no badge:** neither chip renders; the name row is just name + ✎,
  no pill below — a clean left-aligned header.
- **Verified/Trusted curator:** trust chip on the name row (right), curator pill
  below the stats — both present, in their own spots (not a shared centered row).
- **Stats with zero votes:** the dishes/spots line already guards on
  `stats.totalVotes > 0`; preserve that guard (no "0 dishes · …"). Two-tier layout
  is unchanged, so no new zero-state work.
- **iOS:** the `human_verified`/`trusted_reviewer` gate naturally excludes
  "Building" on all platforms — no regression vs. today's iOS hide.
- **Edit mode:** while editing the name, the chip is not rendered (the input row
  replaces the name row).

## Non-negotiables (CLAUDE.md)
- Brand colors via `var(--color-*)`; no Tailwind color classes.
- No `console.*`; no `toSorted`/`Array.at`.
- No direct Supabase in components.
- `DishListItem`/`ProfileGrid` untouched (this is header + tab chrome only).
- Preserve loading skeleton (`ProfileSkeleton`).

## Testing
- Unit (`HeroIdentityCard`): renders name + two-tier stats (left-aligned);
  renders curator pill only when `isCurator`; calls `onEditTop10` on pill click;
  renders `TrustBadge` only when `trustBadgeType` is `human_verified` /
  `trusted_reviewer` (NOT for null / other values); renders neither chip nor pill
  for a plain user; does NOT render the old "reviews/rhythm" Jitter box; does not
  render the chip while `editingName` is true.
- Unit (`Profile.jsx` tab labels, if testable): displayed tabs are Grid / Lists /
  Saved with no Visits; internal keys remain `journal`/`playlists`/`saved`.
- Manual / production: header reads calm; curator pill → `/my-list`; a Verified
  user shows the trust badge; a new user shows a clean header; tabs switch
  correctly; no Visits tab.

## Out of scope (YAGNI)
- People-search relocation (kept as bar).
- Unrated-photos redesign (kept).
- Any grid/tile change (V1 already shipped).
- Reworking the Jitter detail/expanded panel beyond removing it from the header
  (the standalone jitter surfaces elsewhere are untouched).

## Resolved
- **Header layout:** left-aligned (mock B), keeping the two-tier stats. This
  preserves #310/#311 and stays consistent with the public profile header (also
  left-aligned), so there is **no owner/public divergence** to reconcile — Part 2
  is owner-header chrome only (Jitter box out, two conditional chips in).
- **Trust chip:** shared `TrustBadge`, gated to `human_verified`/`trusted_reviewer`
  (same source/copy as the public header); hidden in edit mode.
- **Curator pill destination:** `/my-list`.
- **Tab keys:** unchanged (`journal`/`playlists`/`saved`); labels only.
- **Dead code:** `RecentVisitsList` deleted with the Visits tab.
