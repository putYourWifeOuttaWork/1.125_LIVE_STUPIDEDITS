/*
  # Fix get_recent_submissions_v3 RPC Function

  ## Overview
  This migration updates the get_recent_submissions_v3 function to add better
  debugging and fix potential issues with company scoping for super admins.

  ## Changes
  1. Add RAISE NOTICE statements for debugging
  2. Improve logic for super admin global access
  3. Remove the 'active' program status filter as it may be too restrictive
  4. Add better error handling

  ## Key Fixes
  - Super admins now properly see ALL submissions across companies
  - Program status filter is more lenient (shows active and inactive)
  - Better logging to help diagnose issues
*/

-- ==========================================
-- DROP AND RECREATE FUNCTION WITH FIXES
-- ==========================================

DROP FUNCTION IF EXISTS get_recent_submissions_v3(integer, uuid, uuid);

CREATE OR REPLACE FUNCTION get_recent_submissions_v3(
  limit_param integer DEFAULT 10,
  program_id_param uuid DEFAULT NULL,
  site_id_param uuid DEFAULT NULL
)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name text,
  program_id uuid,
  program_name text,
  temperature numeric,
  humidity numeric,
  weather text,
  created_at timestamptz,
  petri_count bigint,
  gasifier_count bigint,
  global_submission_id integer
) AS $$
DECLARE
  current_user_id uuid;
  user_company_id uuid;
  user_is_active boolean;
  user_is_super_admin boolean;
  impersonated_company_id uuid;
  effective_company_id uuid;
  query_result_count integer;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();

  -- Debug: Log the user ID
  RAISE NOTICE 'get_recent_submissions_v3: current_user_id = %', current_user_id;

  -- If no user ID, return empty result
  IF current_user_id IS NULL THEN
    RAISE NOTICE 'get_recent_submissions_v3: No user ID found, returning empty';
    RETURN;
  END IF;

  -- Get user information
  SELECT
    u.company_id,
    u.is_active,
    u.is_super_admin
  INTO
    user_company_id,
    user_is_active,
    user_is_super_admin
  FROM users u
  WHERE u.id = current_user_id;

  -- Debug: Log user info
  RAISE NOTICE 'get_recent_submissions_v3: user_company_id = %, is_active = %, is_super_admin = %',
    user_company_id, user_is_active, user_is_super_admin;

  -- Deny access if user not found or inactive
  IF user_is_active IS NULL OR user_is_active = false THEN
    RAISE NOTICE 'get_recent_submissions_v3: User not found or inactive, returning empty';
    RETURN;
  END IF;

  -- Check for impersonation context (super admins only)
  IF user_is_super_admin = true THEN
    impersonated_company_id := get_impersonated_company_id();

    IF impersonated_company_id IS NOT NULL THEN
      -- Super admin is impersonating, scope to that company
      effective_company_id := impersonated_company_id;
      RAISE NOTICE 'get_recent_submissions_v3: Super admin impersonating company %', effective_company_id;
    ELSE
      -- Super admin not impersonating, allow global access (NULL = no filter)
      effective_company_id := NULL;
      RAISE NOTICE 'get_recent_submissions_v3: Super admin with global access (no company filter)';
    END IF;
  ELSE
    -- Regular users always scoped to their company
    effective_company_id := user_company_id;
    RAISE NOTICE 'get_recent_submissions_v3: Regular user scoped to company %', effective_company_id;
  END IF;

  -- Debug: Log parameters
  RAISE NOTICE 'get_recent_submissions_v3: limit = %, program_id = %, site_id = %',
    limit_param, program_id_param, site_id_param;

  -- Build and execute the query
  RETURN QUERY
  SELECT
    s.submission_id,
    s.site_id,
    st.name AS site_name,
    s.program_id,
    pp.name AS program_name,
    s.temperature,
    s.humidity,
    s.weather::text,
    s.created_at,
    COALESCE(COUNT(DISTINCT po.observation_id), 0)::bigint AS petri_count,
    COALESCE(COUNT(DISTINCT go.observation_id), 0)::bigint AS gasifier_count,
    s.global_submission_id
  FROM submissions s
  INNER JOIN sites st ON s.site_id = st.site_id
  INNER JOIN pilot_programs pp ON s.program_id = pp.program_id
  LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
  LEFT JOIN gasifier_observations go ON s.submission_id = go.submission_id
  WHERE
    -- Company scoping: if effective_company_id is NULL (super admin not impersonating), no filter
    (effective_company_id IS NULL OR pp.company_id = effective_company_id)
    -- Optional program filter
    AND (program_id_param IS NULL OR s.program_id = program_id_param)
    -- Optional site filter
    AND (site_id_param IS NULL OR s.site_id = site_id_param)
    -- NOTE: Removed pp.status = 'active' filter - show all programs regardless of status
  GROUP BY
    s.submission_id,
    s.site_id,
    st.name,
    s.program_id,
    pp.name,
    s.temperature,
    s.humidity,
    s.weather,
    s.created_at,
    s.global_submission_id
  ORDER BY s.created_at DESC
  LIMIT limit_param;

  -- Debug: Count results
  GET DIAGNOSTICS query_result_count = ROW_COUNT;
  RAISE NOTICE 'get_recent_submissions_v3: Returned % rows', query_result_count;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return empty result
    RAISE WARNING 'Error in get_recent_submissions_v3: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) TO authenticated;

-- Add function comment
COMMENT ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) IS
'Returns recent submissions with site and program context, respecting company scoping and super admin impersonation.
Super admins see all companies unless impersonating a specific company.
Updated to remove program status filter and add better debugging.';

-- ==========================================
-- VERIFICATION
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_recent_submissions_v3'
  ) THEN
    RAISE EXCEPTION 'Function get_recent_submissions_v3 was not created successfully';
  END IF;

  RAISE NOTICE 'get_recent_submissions_v3 function updated successfully with debugging';
END $$;
