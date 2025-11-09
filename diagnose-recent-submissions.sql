-- =========================================================
-- Recent Submissions Diagnostic SQL Script
-- =========================================================
-- Run this script in Supabase SQL Editor to diagnose why
-- get_recent_submissions_v3 is returning empty results
-- =========================================================

-- Step 1: Check if the function exists
\echo '📋 Step 1: Verifying get_recent_submissions_v3 function exists...'
SELECT
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  prosrc as source_preview
FROM pg_proc
WHERE proname = 'get_recent_submissions_v3';

-- Step 2: Get current user context
\echo ''
\echo '📋 Step 2: Checking current user context...'
SELECT
  auth.uid() as current_user_id,
  u.email,
  u.company_id,
  u.is_active,
  u.is_super_admin,
  u.is_sys_admin,
  c.name as company_name
FROM users u
LEFT JOIN companies c ON u.company_id = c.company_id
WHERE u.id = auth.uid();

-- Step 3: Check for active programs in user's company
\echo ''
\echo '📋 Step 3: Checking active programs for user company...'
SELECT
  pp.program_id,
  pp.name,
  pp.status,
  pp.company_id,
  c.name as company_name,
  COUNT(DISTINCT s.site_id) as site_count
FROM pilot_programs pp
INNER JOIN companies c ON pp.company_id = c.company_id
LEFT JOIN sites s ON pp.program_id = s.program_id
WHERE pp.company_id = (SELECT company_id FROM users WHERE id = auth.uid())
GROUP BY pp.program_id, pp.name, pp.status, pp.company_id, c.name
ORDER BY pp.name;

-- Step 4: Check sites in first active program
\echo ''
\echo '📋 Step 4: Checking sites in first active program...'
WITH first_program AS (
  SELECT program_id, name
  FROM pilot_programs
  WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND status = 'active'
  ORDER BY name
  LIMIT 1
)
SELECT
  s.site_id,
  s.name,
  s.program_id,
  fp.name as program_name,
  s.type,
  COUNT(DISTINCT sub.submission_id) as submission_count
FROM sites s
INNER JOIN first_program fp ON s.program_id = fp.program_id
LEFT JOIN submissions sub ON s.site_id = sub.site_id
GROUP BY s.site_id, s.name, s.program_id, fp.name, s.type
ORDER BY s.name;

-- Step 5: Check submissions in first site directly
\echo ''
\echo '📋 Step 5: Checking submissions in first site (direct query)...'
WITH first_site AS (
  SELECT s.site_id, s.name, s.program_id
  FROM sites s
  INNER JOIN pilot_programs pp ON s.program_id = pp.program_id
  WHERE pp.company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND pp.status = 'active'
  ORDER BY pp.name, s.name
  LIMIT 1
)
SELECT
  sub.submission_id,
  sub.site_id,
  fs.name as site_name,
  sub.program_id,
  sub.temperature,
  sub.humidity,
  sub.weather,
  sub.created_at,
  sub.global_submission_id,
  COUNT(DISTINCT po.observation_id) as petri_count,
  COUNT(DISTINCT go.observation_id) as gasifier_count
FROM submissions sub
INNER JOIN first_site fs ON sub.site_id = fs.site_id
LEFT JOIN petri_observations po ON sub.submission_id = po.submission_id
LEFT JOIN gasifier_observations go ON sub.submission_id = go.submission_id
GROUP BY
  sub.submission_id,
  sub.site_id,
  fs.name,
  sub.program_id,
  sub.temperature,
  sub.humidity,
  sub.weather,
  sub.created_at,
  sub.global_submission_id
ORDER BY sub.created_at DESC
LIMIT 5;

-- Step 6: Test get_recent_submissions_v3 with first site
\echo ''
\echo '📋 Step 6: Testing get_recent_submissions_v3 RPC function...'
WITH first_site AS (
  SELECT s.site_id, s.name, s.program_id
  FROM sites s
  INNER JOIN pilot_programs pp ON s.program_id = pp.program_id
  WHERE pp.company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND pp.status = 'active'
  ORDER BY pp.name, s.name
  LIMIT 1
)
SELECT
  fs.program_id,
  fs.site_id,
  fs.name as site_name
FROM first_site fs;

-- Now run the actual RPC (copy the IDs from above and paste below)
-- SELECT * FROM get_recent_submissions_v3(
--   10,
--   'PASTE_PROGRAM_ID_HERE'::uuid,
--   'PASTE_SITE_ID_HERE'::uuid
-- );

-- Step 7: Check for any orphaned submissions (missing relationships)
\echo ''
\echo '📋 Step 7: Checking for orphaned submissions...'
SELECT
  'Submissions with no site' as issue_type,
  COUNT(*) as count
FROM submissions sub
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.site_id = sub.site_id)
UNION ALL
SELECT
  'Submissions with no program' as issue_type,
  COUNT(*) as count
FROM submissions sub
WHERE NOT EXISTS (SELECT 1 FROM pilot_programs pp WHERE pp.program_id = sub.program_id)
UNION ALL
SELECT
  'Sites with no program' as issue_type,
  COUNT(*) as count
FROM sites s
WHERE NOT EXISTS (SELECT 1 FROM pilot_programs pp WHERE pp.program_id = s.program_id);

-- Step 8: Check if there are any warnings in pg_stat_statements
\echo ''
\echo '📋 Step 8: Recent database warnings (if extension available)...'
-- This may not work if pg_stat_statements is not enabled
-- SELECT query, calls, mean_exec_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%get_recent_submissions_v3%'
-- ORDER BY calls DESC
-- LIMIT 5;

-- Step 9: Test the function with minimal parameters
\echo ''
\echo '📋 Step 9: Testing function with NULL filters (should return all for company)...'
SELECT * FROM get_recent_submissions_v3(10, NULL, NULL);

\echo ''
\echo '✅ Diagnostic queries complete!'
\echo ''
\echo '📝 Next Steps:'
\echo '1. Review the results above to see where data exists'
\echo '2. In Step 6, copy the program_id and site_id and test the RPC directly'
\echo '3. Compare Step 5 (direct query) with Step 6 (RPC function) results'
\echo '4. Check for any orphaned data in Step 7'
