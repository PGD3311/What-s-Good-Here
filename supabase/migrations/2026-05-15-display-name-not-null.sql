-- ============================================================================
-- Migration: display_name NOT NULL invariant + placeholder-generating trigger
-- Date: 2026-05-15
-- Related: PR #170 (initial display_name backfill via authApi.ensureDisplayName)
--          Tier B of the 2026-05-15 ultra-review punch list
-- ============================================================================
-- Moves the "every profile has a non-null display_name" invariant from
-- runtime client-side backfill into the database itself.
--
-- Before this migration, three soft layers cooperated to maintain the
-- invariant:
--   1. RLS policy `profiles_select_public_or_own` hides null-named rows
--      from public reads (silent invisibility for affected users).
--   2. `authApi.ensureDisplayName` runtime helper fills the gap on every
--      SIGNED_IN event.
--   3. `signInWithApple` awaits the same helper on the native branch.
--
-- That arrangement leaked null into the UI during the gap between profile
-- INSERT (via handle_new_user trigger) and ensureDisplayName completing.
-- It also made every consumer defensive-optional-chain `profile?.display_name`
-- when the invariant should have made null impossible.
--
-- After this migration the trigger is the single source of truth: every
-- profile row has display_name set before INSERT returns, and the column
-- constraint makes null unrepresentable.
--
-- ORDER MATTERS — and not just for the obvious reason. Step 1 updates the
-- trigger BEFORE the backfill, so any signup landing mid-migration uses
-- the new placeholder-generating trigger and can't introduce a fresh NULL
-- row that would then make Step 3 (SET NOT NULL) fail. If we did it in
-- the naïve order (backfill → trigger → constraint), a signup between
-- backfill and trigger update would sneak a NULL in and break the deploy.

-- ---------------------------------------------------------------------------
-- Step 1: Update handle_new_user FIRST so concurrent signups during this
-- migration use the new placeholder-generating logic. Reads
-- raw_user_meta_data.display_name (set by email signup) as a third metadata
-- source so signUpWithPassword no longer needs a post-INSERT UPDATE.
-- NULLIF(TRIM(...), '') guards against whitespace-only metadata values.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, has_onboarded)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      'eater-' || SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 12)
    ),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Step 2: Backfill any existing NULL display_names.
-- Format: 'eater-{12charsOfUserIdHex}'. Deterministic on user.id, so re-running
-- this UPDATE is a no-op. Collision space is 16^12 ≈ 281 trillion — birthday
-- collision risk doesn't matter until ~16M users.
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET display_name = 'eater-' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 12)
WHERE display_name IS NULL;

-- ---------------------------------------------------------------------------
-- Step 3: Promote the invariant to a hard schema constraint.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN display_name SET NOT NULL;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- The schema/trigger pieces are fully reversible:
--   ALTER TABLE public.profiles ALTER COLUMN display_name DROP NOT NULL;
--   -- (Optional) restore the prior trigger shape — same body but with the
--   -- final COALESCE branch as plain NULL instead of the 'eater-…'
--   -- placeholder. See git history for the exact prior CREATE OR REPLACE.
--
-- The Step-2 backfill is durable user-visible data and is NOT auto-reverted.
-- If a rollback genuinely needs the original NULLs back (very unlikely —
-- those NULL states were the bug we just fixed), run explicitly:
--   UPDATE public.profiles
--   SET display_name = NULL
--   WHERE display_name LIKE 'eater-%';
-- That wipes legitimate users who happened to pick this naming convention
-- themselves, so verify the LIKE pattern against the actual placeholder
-- format before running.
