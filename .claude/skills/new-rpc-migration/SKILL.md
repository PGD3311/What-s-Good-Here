---
name: new-rpc-migration
description: Scaffold a new Supabase migration file with the canonical template — rollback block, ::NUMERIC cast reminder, qualified column-ref reminder, and SQL Editor deploy checklist. Use when adding a new RPC function, schema change, or table modification in this repo.
disable-model-invocation: true
---

# new-rpc-migration

Creates a new migration in `supabase/migrations/` pre-loaded with the §1.5 gotcha reminders and a rollback footer, so none of them get forgotten.

## When to invoke

User runs `/new-rpc-migration <short-name-with-dashes>`. Example: `/new-rpc-migration add-dish-variants-index`.

If the user invokes this skill without an argument, ask for the short name first (kebab-case, describes the change in 2–5 words).

## What to do

1. Derive the filename (use UTC consistently to avoid midnight-flip surprises):
   - `timestamp=$(date -u +%Y%m%d)`
   - `filename="supabase/migrations/${timestamp}_${name}.sql"`
   - If a file with that exact name already exists, append an HHMMSS suffix: `${timestamp}$(date -u +%H%M%S)_${name}.sql`.

2. Copy `assets/template.sql` (relative to this skill) to that path using the Write tool. Replace these tokens in the template before writing:
   - `<NAME>` → the `<short-name-with-dashes>` argument
   - `<TIMESTAMP>` → ISO-8601 UTC timestamp from `date -u +%Y-%m-%dT%H:%M:%SZ` (e.g. `2026-04-24T17:00:00Z`)

3. After writing, tell the user:
   - The file path.
   - Checklist from CLAUDE.md §1.5 that still needs their attention (don't ask; just state):
     - **`supabase/schema.sql` is the source of truth** — update the schema file first, then mirror the change in this migration.
     - **Deploy**: run the migration in the Supabase SQL Editor. Adding the file does NOT deploy.
     - **Verify**: make a test call after deploy.
     - **Rollback block required** if the migration changes column types, drops/recreates triggers, alters FK strategies, or rewrites policies. Exempt: pure additive `CREATE INDEX IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`.

4. Do NOT invent SQL content yet. The template's placeholder comments stay until the user fills them in (or asks you to). The skill scaffolds; the user (or a follow-up request) writes the SQL.

## Gotchas the template already bakes in

These are in the template as comment reminders — do not remove them unless the user explicitly says so:
- `ROUND()` on float expressions needs `::NUMERIC` cast.
- PL/pgSQL `RETURNS TABLE` columns become variables inside the function body — always qualify as `tablename.column`.
- Use `.maybeSingle()` in JS for lookups that might return zero rows (not `.single()`).
- `-- ROLLBACK:` footer block with paste-ready revert SQL (or an explicit "no SQL rollback" note).

## Naming convention

`supabase/migrations/` currently has a mix of formats: numeric prefixes (`025-`, `030-`), date-only (`20260421_`), date-with-time (`20260216120000_`), ISO-style (`2026-04-10-`), and a few non-prefixed files. None is "the" convention.

This skill standardizes on `YYYYMMDD_short-name.sql` (UTC date, `HHMMSS` appended on collision) for new files going forward. Don't use the integer prefixes (`025-`, `026-`) — those are the oldest pattern and would conflict with sort order if they grew further.
