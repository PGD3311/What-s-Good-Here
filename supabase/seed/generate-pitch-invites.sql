-- Generate Invite Tokens for Pitch Restaurants
-- Run in Supabase SQL Editor. Outputs full invite URLs.
-- Tokens expire in 30 days (default from restaurant_invites table).

-- Requires: a user_id to set as created_by.
-- Replace YOUR_ADMIN_USER_ID below with your actual user ID,
-- or use the first admin from restaurant_managers:
DO $$
DECLARE
  v_admin_id uuid;
  v_token_badmarthas uuid;
  v_token_nomans uuid;
  v_token_nancys uuid;
  v_badmarthas_id uuid;
  v_nomans_id uuid;
  v_nancys_id uuid;
BEGIN
  -- Get admin user (first manager with 'admin' role, or first manager)
  SELECT user_id INTO v_admin_id
  FROM restaurant_managers
  WHERE role = 'admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin user found. Create a restaurant_managers entry first.';
  END IF;

  -- Get restaurant IDs
  SELECT id INTO v_badmarthas_id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery' LIMIT 1;
  SELECT id INTO v_nomans_id FROM restaurants WHERE name = 'Noman''s' LIMIT 1;
  SELECT id INTO v_nancys_id FROM restaurants WHERE name ILIKE 'Nancy''s%' LIMIT 1;

  -- Insert invites and capture tokens
  IF v_badmarthas_id IS NOT NULL THEN
    INSERT INTO restaurant_invites (restaurant_id, created_by)
    VALUES (v_badmarthas_id, v_admin_id)
    RETURNING token INTO v_token_badmarthas;
    RAISE NOTICE 'Bad Martha''s: https://wghapp.com/invite/%', v_token_badmarthas;
  ELSE
    RAISE NOTICE 'Bad Martha''s Brewery not found in restaurants table';
  END IF;

  IF v_nomans_id IS NOT NULL THEN
    INSERT INTO restaurant_invites (restaurant_id, created_by)
    VALUES (v_nomans_id, v_admin_id)
    RETURNING token INTO v_token_nomans;
    RAISE NOTICE 'Noman''s: https://wghapp.com/invite/%', v_token_nomans;
  ELSE
    RAISE NOTICE 'Noman''s not found in restaurants table';
  END IF;

  IF v_nancys_id IS NOT NULL THEN
    INSERT INTO restaurant_invites (restaurant_id, created_by)
    VALUES (v_nancys_id, v_admin_id)
    RETURNING token INTO v_token_nancys;
    RAISE NOTICE 'Nancy''s: https://wghapp.com/invite/%', v_token_nancys;
  ELSE
    RAISE NOTICE 'Nancy''s not found in restaurants table';
  END IF;
END $$;
