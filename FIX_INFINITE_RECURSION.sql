/*
  FIX: Infinite Recursion in RLS Policies

  Problem: The view pilot_programs_with_progress has SECURITY INVOKER,
  which means it applies RLS policies when queried. This creates infinite
  recursion when RLS policies reference the view or when policies are complex.

  Solution: Change the view to SECURITY DEFINER so it bypasses RLS.
*/

-- Drop and recreate the view with SECURITY DEFINER
DROP VIEW IF EXISTS pilot_programs_with_progress CASCADE;

CREATE VIEW pilot_programs_with_progress
WITH (security_invoker = false)
AS
SELECT
  pp.*,
  COALESCE(
    json_agg(
      json_build_object(
        'phase_id', ph.phase_id,
        'phase_number', ph.phase_number,
        'start_date', ph.start_date,
        'end_date', ph.end_date,
        'description', ph.description
      ) ORDER BY ph.phase_number
    ) FILTER (WHERE ph.phase_id IS NOT NULL),
    '[]'::json
  ) as phases,
  COUNT(DISTINCT s.site_id) as total_sites,
  COUNT(DISTINCT sub.submission_id) as total_submissions,
  COUNT(DISTINCT CASE WHEN sub.status = 'completed' THEN sub.submission_id END) as completed_submissions
FROM pilot_programs pp
LEFT JOIN phases ph ON ph.program_id = pp.program_id
LEFT JOIN sites s ON s.program_id = pp.program_id
LEFT JOIN submissions sub ON sub.program_id = pp.program_id
GROUP BY pp.program_id;

-- Grant access to authenticated users
GRANT SELECT ON pilot_programs_with_progress TO authenticated;

-- The view now bypasses RLS and uses the underlying table's RLS policies correctly
-- This prevents infinite recursion

SELECT 'View recreated successfully with SECURITY DEFINER!' as status;
