-- 2026-06-01 — Convert dishes.name content filter from a hard CHECK to an
-- INSERT/UPDATE-OF-name trigger.
--
-- ROOT CAUSE: dishes_name_content_filter_check = CHECK (NOT is_offensive(name))
-- (added NOT VALID on 2026-04-24) re-validates the ENTIRE row on every UPDATE,
-- not just on name changes. So the vote trigger's `UPDATE dishes SET total_votes…`
-- re-checks the name and rolls back for any dish whose name trips is_offensive
-- — meaning users silently CANNOT vote on such dishes (e.g. the real product
-- "Smack My Ass Hot Sauce"), and the vote-count backfill fails on them too.
--
-- FIX: drop the CHECK; enforce the same is_offensive() guard via a BEFORE
-- INSERT OR UPDATE OF name trigger. New dishes and name edits are still blocked
-- if offensive, but updates that don't touch `name` (vote counts, ratings,
-- value scores) no longer re-validate it. Input-time filtering in the app
-- (validateUserContent, per content-safety rule) remains the first line.
--
-- NOTE: the same CHECK-on-UPDATE flaw exists on restaurants.name,
-- profiles.display_name, and votes.review_text. Not changed here (dishes is the
-- acute path — the vote trigger writes dishes on every vote). Flagged to Denis.

CREATE OR REPLACE FUNCTION public.check_dish_name_offensive()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_offensive(NEW.name) THEN
    RAISE EXCEPTION 'Dish name contains inappropriate content'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS dishes_name_content_filter_trigger ON public.dishes;
CREATE TRIGGER dishes_name_content_filter_trigger
  BEFORE INSERT OR UPDATE OF name ON public.dishes
  FOR EACH ROW EXECUTE FUNCTION public.check_dish_name_offensive();

ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_name_content_filter_check;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS dishes_name_content_filter_trigger ON public.dishes;
-- DROP FUNCTION IF EXISTS public.check_dish_name_offensive();
-- ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_name_content_filter_check;
-- ALTER TABLE public.dishes
--   ADD CONSTRAINT dishes_name_content_filter_check CHECK (NOT public.is_offensive(name)) NOT VALID;
-- (Note: re-adding the CHECK restores the bug where votes on offensive-named dishes fail.)
