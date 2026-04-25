-- Smoke test for public.is_offensive(). Run in Supabase SQL Editor after the
-- migration to confirm the DB-side filter still mirrors src/lib/reviewBlocklist.js.
WITH cases(input_text, expected, scenario) AS (
  VALUES
    ('fuck this place', TRUE, 'profanity substring'),
    ('Beach Plum Burger', FALSE, 'clean restaurant name'),
    ('class act', FALSE, 'ass uses word boundaries'),
    ('ass', TRUE, 'ass exact word'),
    ('fagioli', FALSE, 'fag does not match inside words'),
    ('fag', TRUE, 'fag exact word'),
    ('spicier salsa', TRUE, '4-char slur still uses substring semantics'),
    ('n*gga', TRUE, 'literal asterisk slur variant'),
    ('kkk rally', TRUE, 'short slur with word boundaries'),
    ('Visit example.com', TRUE, 'domain substring spam'),
    ('Buy now and save', TRUE, 'phrase substring spam'),
    ('nftaco', FALSE, 'nft does not match inside a longer token'),
    ('sexiest dish', FALSE, 'sex stays boundary-only because it is 3 chars'),
    ('s*x', TRUE, 'literal asterisk short sexual-content variant')
)
SELECT
  scenario,
  input_text,
  expected,
  public.is_offensive(input_text) AS actual,
  public.is_offensive(input_text) IS NOT DISTINCT FROM expected AS pass
FROM cases;
