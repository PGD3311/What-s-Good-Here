-- supabase/migrations/20260424_server_side_content_filter.sql
--
-- Server-side UGC content filter for Apple Guideline 1.2 compliance.
-- Mirrors src/lib/reviewBlocklist.js exactly so direct REST/table writes
-- cannot bypass the client-side validator.

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
            ('fck'),
            ('ass'),
            ('fag'),
            ('f\*g'),
            ('kkk'),
            ('nft'),
            ('sex'),
            ('s\*x'),
            ('xxx')
        ) AS short_terms(pattern)
        WHERE normalized.value ~ ('(^|[^a-z0-9_])' || short_terms.pattern || '($|[^a-z0-9_])')
      )
      OR EXISTS (
        SELECT 1
        FROM normalized
        CROSS JOIN (
          VALUES
            ('fuck'),
            ('fucking'),
            ('fucked'),
            ('fucker'),
            ('f*ck'),
            ('shit'),
            ('shitty'),
            ('bullshit'),
            ('sh*t'),
            ('asshole'),
            ('a**hole'),
            ('bitch'),
            ('b*tch'),
            ('damn'),
            ('dammit'),
            ('crap'),
            ('bastard'),
            ('dick'),
            ('d*ck'),
            ('piss'),
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
            ('spic'),
            ('sp*c'),
            ('chink'),
            ('ch*nk'),
            ('kike'),
            ('k*ke'),
            ('wetback'),
            ('beaner'),
            ('cracker'),
            ('honky'),
            ('dyke'),
            ('d*ke'),
            ('tranny'),
            ('tr*nny'),
            ('nazi'),
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
            ('p*rn'),
            ('nude'),
            ('naked')
        ) AS long_terms(term)
        WHERE position(long_terms.term IN normalized.value) > 0
      )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_offensive(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.is_offensive(TEXT) TO authenticated, service_role;

ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_review_text_content_filter_check;
ALTER TABLE public.votes
  ADD CONSTRAINT votes_review_text_content_filter_check
  CHECK (NOT public.is_offensive(review_text)) NOT VALID;

ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_name_content_filter_check;
ALTER TABLE public.dishes
  ADD CONSTRAINT dishes_name_content_filter_check
  CHECK (NOT public.is_offensive(name)) NOT VALID;

ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_content_filter_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_name_content_filter_check
  CHECK (NOT public.is_offensive(name)) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_content_filter_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_content_filter_check
  CHECK (NOT public.is_offensive(display_name)) NOT VALID;

-- Validate only if legacy rows are already clean. If not, leave the
-- constraint NOT VALID so all new writes are protected immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.votes
    WHERE public.is_offensive(public.votes.review_text) IS TRUE
  ) THEN
    ALTER TABLE public.votes VALIDATE CONSTRAINT votes_review_text_content_filter_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dishes
    WHERE public.is_offensive(public.dishes.name) IS TRUE
  ) THEN
    ALTER TABLE public.dishes VALIDATE CONSTRAINT dishes_name_content_filter_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE public.is_offensive(public.restaurants.name) IS TRUE
  ) THEN
    ALTER TABLE public.restaurants VALIDATE CONSTRAINT restaurants_name_content_filter_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE public.is_offensive(public.profiles.display_name) IS TRUE
  ) THEN
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_display_name_content_filter_check;
  END IF;
END;
$$;

-- ROLLBACK:
--   ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_review_text_content_filter_check;
--   ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_name_content_filter_check;
--   ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_content_filter_check;
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_content_filter_check;
--   DROP FUNCTION IF EXISTS public.is_offensive(TEXT);
