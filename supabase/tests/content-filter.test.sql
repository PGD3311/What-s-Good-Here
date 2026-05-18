-- Smoke test for public.is_offensive(). Run in Supabase SQL Editor after the
-- migration to confirm the DB-side filter still mirrors src/lib/reviewBlocklist.js.
WITH cases(input_text, expected, scenario) AS (
  VALUES
    -- Profanity / hard slurs (must still flag)
    ('fuck this place', TRUE, 'profanity substring'),
    ('ass', TRUE, 'ass exact word'),
    ('fag', TRUE, 'fag exact word'),
    ('n*gga', TRUE, 'literal asterisk slur variant'),
    ('kkk rally', TRUE, 'short slur with word boundaries'),
    ('s*x', TRUE, 'literal asterisk short sexual-content variant'),
    -- Spam (must still flag)
    ('Visit example.com', TRUE, 'domain substring spam'),
    ('Buy now and save', TRUE, 'phrase substring spam'),
    -- Clean baseline
    ('Beach Plum Burger', FALSE, 'clean restaurant name'),
    -- Word-boundary protected — these used to falsely flag
    ('class act', FALSE, 'ass uses word boundaries'),
    ('fagioli', FALSE, 'fag does not match inside words'),
    ('nftaco', FALSE, 'nft does not match inside a longer token'),
    ('sexiest dish', FALSE, 'sex stays boundary-only because it is 3 chars'),
    -- Newly added word-boundary tokens (regressions the 20260517 migration fixes)
    ('spicier salsa', FALSE, 'spic no longer matches inside spicy'),
    ('crappie sandwich', FALSE, 'crap no longer matches inside crappie'),
    ('pissaladière flatbread', FALSE, 'piss no longer matches inside pissaladière'),
    ('Dickens cake', FALSE, 'dick no longer matches inside Dickens'),
    ('shiitake mushroom', FALSE, 'shit no longer matches inside shiitake'),
    ('shitake roll', FALSE, 'shit also passes the alt-spelling shitake'),
    -- The bare words STILL flag
    ('spic', TRUE, 'spic still flags as standalone slur'),
    ('crap on toast', TRUE, 'crap still flags as standalone'),
    ('that was dick', TRUE, 'dick still flags as standalone'),
    ('shit was bad', TRUE, 'shit still flags as standalone'),
    -- damn / dammit now permitted (mild profanity, common in food reviews)
    ('damn good lobster roll', FALSE, 'damn permitted'),
    ('dammit this is good', FALSE, 'dammit permitted'),
    -- fggt (de-voweled slur bypass)
    ('fggt', TRUE, 'fggt flags as de-voweled slur'),
    -- Food-domain word-boundary fixes (chink, beaner)
    ('Chinkiang vinegar', FALSE, 'chink no longer matches inside Chinkiang'),
    ('Beanery cafe', FALSE, 'beaner no longer matches inside Beanery'),
    -- Naked / cracker are no longer filter tokens (too common in food context)
    ('naked burrito', FALSE, 'naked permitted (real menu term)'),
    ('Naked Pig BBQ', FALSE, 'naked permitted in restaurant names'),
    ('oyster crackers', FALSE, 'cracker permitted (common food)'),
    ('try the cracker with cheese', FALSE, 'cracker permitted standalone in food review')
)
SELECT
  scenario,
  input_text,
  expected,
  public.is_offensive(input_text) AS actual,
  public.is_offensive(input_text) IS NOT DISTINCT FROM expected AS pass
FROM cases
ORDER BY pass, scenario;
