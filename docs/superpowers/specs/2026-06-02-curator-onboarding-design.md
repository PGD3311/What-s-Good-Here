# Curator Onboarding — Design Spec

**Date:** 2026-06-02
**Status:** Approved (brainstorm), pending implementation plan
**Author:** Dan + Claude

## Problem

New local curators are confused when they first become curators. After accepting an
invite they land on the `/my-list` editor with only a small, dismissable banner. Three
specific failure modes:

1. They don't know the flow — what to do, how to add dishes.
2. They hit the **rate-first gate** (shipped 2026-06-02) — tapping "+" on a dish blocks
   them with "Rate it first," and they don't understand why.
3. They skip the bio (an easily-ignored 80-char tagline input), so their public curator
   profile ends up bare.

The existing banner predates the rate-first gate and doesn't explain it.

## Scope

**Audience: local curators only, never regular users.**
- The full-screen splash fires **once**, only right after a user accepts a curator invite
  (gated on the `justAcceptedCuratorInvite` route flag + a one-time localStorage key).
- The checklist and publish gate live on `/my-list`, which is already curator-gated
  (non-curators hit the "Local Curators Only" wall).
- The checklist self-hides once setup is complete, so established curators with a finished
  list don't see it.

## Decisions (locked in brainstorm)

| Decision | Choice |
|---|---|
| Format | Full-screen welcome splash, **then** a persistent guided checklist on the editor |
| Enforcement | Soft gate — **bio required to publish** (rated dishes already enforced upstream; no minimum-dish gate) |
| Bio | Reuse the existing 80-char `curator_tagline` field; require it to publish; reframe as "your bio" |
| Splash delivery | Full-screen **modal overlay** on `/my-list` (not a new route) |
| Re-show | One-time via localStorage; no auto-replay |

## Design

### Visual language

No decorative emoji anywhere in the splash or checklist — emoji-as-icon reads as templatey
and violates the project's design standards. Lean on typography: Amatic SC for headings,
Outfit for body, and a restrained numbered treatment (1 / 2 / 3) for the three points. If
an icon is ever wanted, use the canonical flat illustrated brand icons, never emoji.

### 1. Welcome splash (full-screen modal, shown once)

Appears on `/my-list` when `location.state.justAcceptedCuratorInvite` is true AND the
`HAS_SEEN_CURATOR_ONBOARDING` localStorage key is unset. Warm Amatic-SC heading, three
numbered points, one CTA.

1. **Pick your Top 10** — the dishes visitors should order.
2. **Rate before you add** — "You can only add dishes you've rated — that's what makes
   your list trustworthy." (Directly defuses the rate-first-gate confusion.)
3. **Tell them who you are** — "Add a short bio so people know whose taste they're
   trusting."

CTA **"Start building"** → dismisses, sets `HAS_SEEN_CURATOR_ONBOARDING`, fires
`capture('curator_onboarding_completed')`. Never auto-shows again.

### 2. Persistent checklist (on the editor, replaces the banner)

A compact 3-step progress card. Each step marks done (a check mark or filled state — not an
emoji) when complete; the card collapses/hides once all three are done.

- **Add a dish** → done when `items.length > 0` (rating is implicit; the gate forces it).
- **Write your bio** → done when the tagline field is non-empty.
- **Publish** → done when the list is saved live with ≥1 dish (`is_active` + items > 0).

### 3. Soft publish gate

`Save & Publish` (the `items.length > 0` case) requires a non-empty tagline. If empty, the
button nudges "Add a bio first" and focuses/scrolls to the bio field. `Save (Unpublished)`
stays **ungated** so curators can park work in progress. Rated-dishes integrity is already
enforced by `add_dish_to_my_local_list` and the client gate.

### 4. Bio framing (no schema change)

Relabel the `curator_tagline` input from "Your tagline" → **"Your bio"** with prompt
"Who are you? e.g. Manager at Nancy's, lifelong islander." Same 80-char limit, same
`curator_tagline` column, same public display on `/locals/:userId`.

## Components & footprint

- **New** `src/components/profile/CuratorOnboardingSplash.jsx` — the full-screen splash.
  Props: `onDismiss`. Self-contained; renders the three numbered points + CTA.
- **New** `src/components/profile/CuratorChecklist.jsx` — the 3-step progress card.
  Props: `{ hasDish, hasBio, isPublished }` (booleans), derives done/collapsed state.
- **Edit** `src/pages/MyList.jsx` — mount splash (gated on route flag + localStorage),
  replace the welcome banner with `CuratorChecklist`, relabel the tagline input, wire the
  publish soft-gate into `handleSave`.
- **Edit** `src/lib/storage.js` — add `HAS_SEEN_CURATOR_ONBOARDING` key + helper usage
  (all localStorage via storage.js per project rules).

## Non-goals (YAGNI)

- No new route for the splash.
- No richer/longer bio schema — the 80-char tagline is the bio.
- No minimum-dish requirement to publish.
- No multi-screen wizard with progress dots — one splash screen, three points.
- No replay affordance for the splash (revisit only if requested).
- No decorative emoji.

## Styling / conventions

- Brand colors via `var(--color-*)` only; Tailwind for layout/spacing only.
- Amatic SC for the splash heading; Outfit for body copy.
- Modal / sheet patterns follow existing app modals (explicit height, not maxHeight, where
  a scroll child is involved).
- localStorage strictly via `src/lib/storage.js`.

## Test plan

- New curator (fresh invite accept): splash shows once → dismiss → checklist visible →
  add a rated dish (step 1 done) → write bio (step 2 done) → publish (step 3 done) →
  checklist collapses. Reload `/my-list`: splash does NOT reappear.
- Publish with empty bio: blocked with nudge + field focus. `Save (Unpublished)` still works.
- Regular (non-curator) user: never sees splash or checklist (hits the curator wall).
- Established curator with a complete published list: no checklist, no splash.
