-- Enqueue menu-refresh for ALL Nantucket restaurants (one-shot)
-- Run in Supabase SQL Editor (runs as service_role → can call enqueue_menu_import).
--
-- The every-minute `process-menu-import-queue` cron drains these jobs:
-- for each restaurant with no menu_url it discovers the website via Google,
-- finds the menu URL, extracts the menu with Sonnet, and upserts dishes.
-- menu-refresh NEVER deletes — restaurants with no scrapeable menu keep what
-- they have. enqueue_menu_import is idempotent (one active job per restaurant),
-- so this is safe to re-run.
--
-- Drain rate: 3 jobs/min → ~45 restaurants finish in ~15 min. Watch progress
-- with the status query at the bottom.

SELECT r.name,
       q.job_id,
       q.job_status,
       q.is_new            -- true = newly queued, false = already had an active job
FROM restaurants r
CROSS JOIN LATERAL enqueue_menu_import(r.id, 'initial', 10) AS q
WHERE r.town IN ('Nantucket', 'Siasconset', 'Madaket', 'Wauwinet')
  AND r.is_open = true
ORDER BY q.is_new DESC, r.name;

-- ── Progress (re-run anytime while the queue drains) ───────────────────────
-- SELECT mij.status, COUNT(*)
-- FROM menu_import_jobs mij
-- JOIN restaurants r ON r.id = mij.restaurant_id
-- WHERE r.town IN ('Nantucket', 'Siasconset', 'Madaket', 'Wauwinet')
-- GROUP BY mij.status ORDER BY mij.status;

-- ── Result: dishes per Nantucket restaurant after the run ──────────────────
-- SELECT r.name, COUNT(d.id) AS dishes
-- FROM restaurants r
-- LEFT JOIN dishes d ON d.restaurant_id = r.id
-- WHERE r.town IN ('Nantucket', 'Siasconset', 'Madaket', 'Wauwinet')
--   AND r.is_open = true
-- GROUP BY r.name ORDER BY dishes ASC, r.name;
