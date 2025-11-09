-- =========================================================
-- Recent Submissions Diagnostic SQL Script (Supabase Compatible)
-- =========================================================
-- Run this script in Supabase SQL Editor to diagnose why
-- get_recent_submissions_v3 is returning empty results
-- =========================================================

-- ============================================
-- PART 1: Check submissions exist for the site
-- ============================================
SELECT
  'Submissions for selected site' as check_name,
  COUNT(*) as submission_count
FROM submissions
WHERE site_id = 'd2f8388e-0441-4c2e-bfdc-7754ce1c1196'::uuid;

-- ============================================
-- PART 2: Check company relationships
-- ============================================
SELECT
  'Company and program relationship check' as check_name,
  pp.program_id,
  pp.name as program_name,
  pp.company_id as program_company,
  pp.status as program_status,
  u.company_id as user_company,
  u.email,
  u.is_super_admin,
  u.is_company_admin,
  u.user_role,
  CASE
    WHEN pp.company_id = u.company_id THEN 'MATCH'
    WHEN u.is_super_admin = true THEN 'SUPER_ADMIN_ACCESS'
    ELSE 'MISMATCH'
  END as access_status
FROM pilot_programs pp
CROSS JOIN users u
WHERE pp.program_id = '3ed8dc59-2744-41f9-b751-038ea2385063'::uuid
  AND u.id = auth.uid();

-- ============================================
-- PART 3: Check site and program details
-- ============================================
SELECT
  'Site and program details' as check_name,
  s.site_id,
  s.name as site_name,
  s.program_id,
  pp.name as program_name,
  pp.status as program_status,
  pp.company_id,
  COUNT(DISTINCT sub.submission_id) as submission_count
FROM sites s
INNER JOIN pilot_programs pp ON s.program_id = pp.program_id
LEFT JOIN submissions sub ON s.site_id = sub.site_id
WHERE s.site_id = 'd2f8388e-0441-4c2e-bfdc-7754ce1c1196'::uuid
GROUP BY s.site_id, s.name, s.program_id, pp.name, pp.status, pp.company_id;

-- ============================================
-- PART 4: Direct submission query with all joins
-- ============================================
SELECT
  'Direct submission query' as check_name,
  s.submission_id,
  s.site_id,
  st.name AS site_name,
  s.program_id,
  pp.name AS program_name,
  pp.status as program_status,
  pp.company_id,
  s.temperature,
  s.humidity,
  s.weather::text,
  s.created_at,
  s.global_submission_id,
  COUNT(DISTINCT po.observation_id) AS petri_count,
  COUNT(DISTINCT go.observation_id) AS gasifier_count
FROM submissions s
INNER JOIN sites st ON s.site_id = st.site_id
INNER JOIN pilot_programs pp ON s.program_id = pp.program_id
LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
LEFT JOIN gasifier_observations go ON s.submission_id = go.submission_id
WHERE s.program_id = '3ed8dc59-2744-41f9-b751-038ea2385063'::uuid
  AND s.site_id = 'd2f8388e-0441-4c2e-bfdc-7754ce1c1196'::uuid
GROUP BY
  s.submission_id,
  s.site_id,
  st.name,
  s.program_id,
  pp.name,
  pp.status,
  pp.company_id,
  s.temperature,
  s.humidity,
  s.weather,
  s.created_at,
  s.global_submission_id
ORDER BY s.created_at DESC
LIMIT 5;

-- ============================================
-- PART 5: Test get_recent_submissions_v3 RPC
-- ============================================
SELECT
  'RPC function test results' as check_name,
  *
FROM get_recent_submissions_v3(
  10,
  '3ed8dc59-2744-41f9-b751-038ea2385063'::uuid,
  'd2f8388e-0441-4c2e-bfdc-7754ce1c1196'::uuid
);

-- ============================================
-- PART 6: Check if function exists
-- ============================================
SELECT
  'Function existence check' as check_name,
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname IN ('get_recent_submissions_v3', 'get_active_sessions_with_details');

-- ============================================
-- PART 7: Check user context
-- ============================================
SELECT
  'Current user context' as check_name,
  auth.uid() as current_user_id,
  u.email,
  u.company_id,
  u.is_active,
  u.is_super_admin,
  u.is_company_admin,
  u.user_role,
  c.name as company_name
FROM users u
LEFT JOIN companies c ON u.company_id = c.company_id
WHERE u.id = auth.uid();
