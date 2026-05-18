-- Rename the `cocktails` category to `drinks` to make it a broader umbrella
-- covering martinis, mixed drinks, frozen drinks, and non-alcoholic equivalents.
-- The client-side category constant (src/constants/categories.js) and the
-- parse-menu Edge Function VALID_CATEGORIES list are updated in the same PR.

UPDATE dishes
SET category = 'drinks'
WHERE category = 'cocktails';

-- ROLLBACK:
-- UPDATE dishes SET category = 'cocktails' WHERE category = 'drinks';
