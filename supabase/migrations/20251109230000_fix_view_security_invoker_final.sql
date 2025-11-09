/*
  # Fix View Security Invoker - FINAL

  1. Purpose
    - Ensure pilot_programs_with_progress view respects RLS policies
    - Set security_invoker = true to use calling user's permissions
    - This is critical for multi-tenancy company isolation

  2. Problem
    - View was created without security_invoker, causing it to bypass RLS
    - Users can see programs from ALL companies regardless of active context
    - Matt (GasX) sees Sandhill programs when he should see 0 programs

  3. Solution
    - DROP and recreate view WITH (security_invoker = true)
    - This forces RLS policy evaluation in the caller's context
    - Company isolation will work correctly

  4. Testing
    - After applying, Matt@GasX should see 0 programs
    - Sandhill users should see 12 programs
    - No cross-company visibility
*/

-- Drop the existing view
DROP VIEW IF EXISTS pilot_programs_with_progress CASCADE;

-- Recreate with SECURITY INVOKER
CREATE VIEW pilot_programs_with_progress
WITH (security_invoker = true)
AS
SELECT
  p.*,
  -- Total days in program
  (p.end_date - p.start_date + 1) AS days_count_this_program,

  -- Current day number
  CASE
    WHEN CURRENT_DATE < p.start_date THEN 0
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      (CURRENT_DATE - p.start_date + 1)
    ELSE (p.end_date - p.start_date + 1)
  END AS day_x_of_program,

  -- Progress percentage
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

-- Add documentation
COMMENT ON VIEW pilot_programs_with_progress IS 'Extends pilot_programs with progress metrics. CRITICAL: Uses security_invoker=true to respect RLS policies for multi-tenancy.';
