-- =====================================================
-- FIX VIEW SECURITY - APPLY THIS NOW
-- =====================================================
--
-- This fixes the pilot_programs_with_progress view to respect RLS policies
-- Run this in Supabase SQL Editor immediately
--

-- Drop and recreate the view with security_invoker
DROP VIEW IF EXISTS pilot_programs_with_progress CASCADE;

CREATE OR REPLACE VIEW pilot_programs_with_progress
WITH (security_invoker = true)
AS
SELECT
  p.*,
  (p.end_date - p.start_date + 1) AS days_count_this_program,
  CASE
    WHEN CURRENT_DATE < p.start_date THEN 0
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      (CURRENT_DATE - p.start_date + 1)
    ELSE (p.end_date - p.start_date + 1)
  END AS day_x_of_program,
  CASE
    WHEN (p.end_date - p.start_date + 1) = 0 THEN 0
    WHEN CURRENT_DATE < p.start_date THEN 0
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      ROUND(((CURRENT_DATE - p.start_date + 1)::NUMERIC / (p.end_date - p.start_date + 1)::NUMERIC) * 100, 2)
    ELSE 100
  END AS phase_progress
FROM
  pilot_programs p;

-- Grant permissions
GRANT SELECT ON pilot_programs_with_progress TO authenticated;

-- Verify it worked
SELECT
  viewname,
  viewowner,
  definition
FROM pg_views
WHERE viewname = 'pilot_programs_with_progress';

-- Check security_invoker setting
SELECT
  c.relname AS view_name,
  c.reloptions AS options
FROM pg_class c
WHERE c.relname = 'pilot_programs_with_progress'
AND c.relkind = 'v';
