-- Rename category: 'drinks' → 'cocktails'
--
-- Why: 'Drinks' was too vague (covered alcoholic AND non-alcoholic). Per Dan,
-- this category is now strictly handcrafted alcoholic cocktails only. Mocktails,
-- smoothies, frappes, and other non-alcoholic drinks no longer belong here.
--
-- The renamed prompt + bumped extractor_fingerprint (cocktails-v1) will cause
-- the menu-refresh cron to re-extract every restaurant with the new strict
-- alcohol-only definition. Existing rows that ARE actually cocktails get
-- preserved by this rename; rows that aren't cocktails (e.g. "Pour Over Coffee"
-- miscategorized as 'drinks') will be re-categorized correctly by the new
-- extraction (or skipped if they're mocktails / smoothies).
--
-- The previous migration (20260517_cocktails_to_drinks.sql) renamed in the
-- opposite direction (cocktails → drinks). This migration reverses that.

UPDATE dishes
SET category = 'cocktails'
WHERE category = 'drinks';

-- ROLLBACK:
-- UPDATE dishes SET category = 'drinks' WHERE category = 'cocktails';
