-- is_offensive(): fix false-positive substring matches.
--
-- The long_terms block uses position(term IN value) which is plain substring,
-- so short tokens like 'spic' falsely match 'spicy', 'crap' matches 'crappie'
-- (a real fish), 'piss' matches 'piscine' / 'pissaladière' / 'Pissarro',
-- 'dick' matches 'Dickens', 'nazi' matches 'nazirite', and so on. This blocks
-- legitimate food reviews and dish/restaurant names on a Martha's Vineyard
-- food app where words like "spicy" are common.
--
-- Fix: move 4-letter tokens with food/normal-English false-positive risk
-- from long_terms (substring) into short_terms (word-boundary regex). The
-- longer tokens (fuck, asshole, etc.) stay in substring mode. 'shit' also
-- moved (so 'shiitake' passes). Adds 'fggt' (de-voweled faggot bypass).
--
-- Also drop 'damn' and 'dammit' entirely — they're mild profanity that
-- routinely appears in legitimate food reviews ("damn good lobster roll").
-- Harder swears (fuck, shit, etc.) remain blocked.
--
-- After this migration:
--   - "spicy", "crappie", "pissaladière", "Dickens cake" all pass
--   - "damn good", "dammit" pass
--   - "spic", "crap", "piss", "dick", "Moby Dick" (word-boundary match) still flag
--   - All harder slurs (n-word, f-slur, etc.) unchanged

CREATE OR REPLACE FUNCTION public.is_offensive(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT lower(coalesce(p_text, '')) AS value
  )
  SELECT CASE
    WHEN btrim(coalesce(p_text, '')) = '' THEN FALSE
    ELSE
      EXISTS (
        SELECT 1
        FROM normalized
        CROSS JOIN (
          VALUES
            -- Original short_terms
            ('fck'),
            ('ass'),
            ('fag'),
            ('f\*g'),
            ('kkk'),
            ('nft'),
            ('sex'),
            ('s\*x'),
            ('xxx'),
            -- Moved here from long_terms to dodge substring false-positives
            -- (e.g. 'spic' was matching 'spicy', 'crap' was matching 'crappie').
            ('spic'),
            ('sp\*c'),
            ('crap'),
            ('piss'),
            ('dick'),
            ('d\*ck'),
            ('dyke'),
            ('d\*ke'),
            ('kike'),
            ('k\*ke'),
            ('nazi'),
            ('nude'),
            ('shit'),
            ('sh\*t'),
            ('fggt'),
            ('chink'),
            ('ch\*nk'),
            ('beaner')
        ) AS short_terms(pattern)
        WHERE normalized.value ~ ('(^|[^a-z0-9_])' || short_terms.pattern || '($|[^a-z0-9_])')
      )
      OR EXISTS (
        SELECT 1
        FROM normalized
        CROSS JOIN (
          VALUES
            -- Longer tokens — safe to substring-match because they're
            -- unlikely to appear as substrings of innocent words.
            ('fuck'),
            ('fucking'),
            ('fucked'),
            ('fucker'),
            ('f*ck'),
            ('shitty'),
            ('bullshit'),
            ('asshole'),
            ('a**hole'),
            ('bitch'),
            ('b*tch'),
            ('bastard'),
            ('pissed'),
            ('cunt'),
            ('c*nt'),
            ('nigger'),
            ('nigga'),
            ('n*gger'),
            ('n*gga'),
            ('faggot'),
            ('f*ggot'),
            ('retard'),
            ('retarded'),
            ('r*tard'),
            ('wetback'),
            ('honky'),
            ('tranny'),
            ('tr*nny'),
            ('hitler'),
            ('buy now'),
            ('click here'),
            ('free money'),
            ('make money fast'),
            ('work from home'),
            ('bitcoin'),
            ('crypto'),
            ('www.'),
            ('http://'),
            ('https://'),
            ('.com'),
            ('.net'),
            ('.org'),
            ('porn'),
            ('p*rn')
        ) AS long_terms(term)
        WHERE position(long_terms.term IN normalized.value) > 0
      )
  END;
$$;

-- ROLLBACK:
-- To revert, restore the prior function body from
-- supabase/migrations/20260424_server_side_content_filter.sql or git history.
-- The check constraints on votes/dishes/restaurants/profiles do not need to
-- change — they reference is_offensive() by name.
