# Current Focus

*Dan (or any Claude session starting work) updates this file at session start. Every other Claude session reads it first to avoid collisions.*

**Last updated:** 2026-04-17

---

## Active handoff

<!-- Fill this in BEFORE touching files. Clear it when done.
     This is the collision-prevention surface — if it's stale, the whole
     system weakens. Keep it honest. -->

- **Owner / session:** _(Dan's terminal | Dan's other Claude | Denis's Claude | scheduled agent name)_
- **Branch:** _(e.g., audit/supabase-2026-04-16 — or `main` if directly committing)_
- **Files / modules claimed:** _(e.g., `src/api/votesApi.js`, `supabase/schema.sql §votes`, `src/pages/Profile.jsx`)_
- **Safe for others to continue:** _(what parts of the repo are NOT touched and open for parallel work)_
- **Do not duplicate:** _(specific tasks already in-flight — PR numbers, migration filenames, feature names)_

---

## This session — the goal

<!-- One paragraph. What are we actually shipping this session?
     Skip the long context — CLAUDE.md + SPEC.md provide that. -->

_(stub)_

## Blockers / waiting on

<!-- Anything held up on Denis, Apple review, a design decision, etc.
     Claude should NOT quietly start work that's waiting on someone else. -->

- _(nothing)_

## Not this session

<!-- Stuff explicitly parked. Claude: don't pick this up even if it looks tempting. -->

- _(nothing)_

---

## Protocol

- **Update BEFORE touching files.** If you skip the update, you are the collision.
- **Clear the "Active handoff" block when the session ends** (commit or stash, then reset this section). A stale handoff is worse than none — the next session will assume it's accurate.
- **If `Last updated` is >24h old, treat the whole file as stale** — ask Dan what's current before assuming anything.
- **One active handoff per surface.** Two sessions can run in parallel if their scopes don't overlap — append a second handoff block, clearly labeled. But never two sessions on the same files at the same time.
