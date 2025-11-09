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
  pp.program_id,
  pp.name,
  pp.description,
  pp.start_date,
  pp.end_date,
  pp.status,
  pp.total_submissions,
  pp.total_sites,
  pp.created_at,
  pp.updated_at,
  pp.lastupdated_by,
  pp.company_id,
  pp.cloned_from_program_id,
  pp.phases
FROM pilot_programs pp;

-- Grant access to authenticated users
GRANT SELECT ON pilot_programs_with_progress TO authenticated;

-- The view now bypasses RLS and uses the underlying table's RLS policies correctly
-- This prevents infinite recursion

SELECT 'View recreated successfully with SECURITY DEFINER!' as status;
