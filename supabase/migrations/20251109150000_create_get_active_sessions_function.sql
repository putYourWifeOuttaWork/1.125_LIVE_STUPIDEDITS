/*
  # Create get_active_sessions_with_details RPC Function

  ## Overview
  This migration creates the RPC function that returns active unclaimed sessions
  with full context data (site names, program names, template info) while
  respecting the role-based access control and company scoping rules.

  This replaces the old function that relied on the pilot_program_users table
  which has been removed as part of the RLS rebuild.

  ## Changes
  1. Drop old get_active_sessions_with_details if it exists
  2. Create new get_active_sessions_with_details with company-based access control
  3. Grant proper permissions

  ## Access Control Logic

  ### Super Admin (is_super_admin = true)
  - Can see unclaimed sessions from ALL companies (global access)
  - Respects impersonation mode if implemented

  ### Company Admin (is_company_admin = true)
  - Can see unclaimed sessions from their company only

  ### Regular Users (based on user_role)
  - observer, analyst, maintenance, sysAdmin: Can see unclaimed sessions from their company
  - Must have is_active = true

  ### All Users
  - Must be active (is_active = true)
  - Only sees sessions with status 'Unclaimed' or 'Active'
  - Sessions must not be expired
  - Results ordered by most recent first

  ## Return Structure
  Returns table with columns:
  - session_id: UUID of the session
  - program_id: UUID of the program
  - program_name: Name of the program
  - site_id: UUID of the site
  - site_name: Name of the site
  - site_type: Type of site (Greenhouse, Storage, etc.)
  - session_status: Status enum
  - session_start_time: Timestamp when session started
  - created_by: UUID of user who created the session
  - creator_email: Email of user who created the session
  - temperature: Numeric temperature value
  - humidity: Numeric humidity value
  - weather: Weather enum value
  - has_petri_templates: Boolean indicating if petri templates exist
  - has_gasifier_templates: Boolean indicating if gasifier templates exist
  - petri_template_count: Count of petri templates
  - gasifier_template_count: Count of gasifier templates

  ## Security Notes
  - Function runs as SECURITY DEFINER to bypass RLS for controlled access
  - All company scoping is enforced within the function logic
  - Inactive users are immediately denied access
*/

-- ==========================================
-- DROP OLD FUNCTION IF EXISTS
-- ==========================================

DROP FUNCTION IF EXISTS get_active_sessions_with_details();

-- ==========================================
-- CREATE NEW FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION get_active_sessions_with_details()
RETURNS TABLE (
  session_id uuid,
  program_id uuid,
  program_name text,
  site_id uuid,
  site_name text,
  site_type text,
  session_status text,
  session_start_time timestamptz,
  created_by uuid,
  creator_email text,
  temperature numeric,
  humidity numeric,
  weather text,
  has_petri_templates boolean,
  has_gasifier_templates boolean,
  petri_template_count bigint,
  gasifier_template_count bigint
) AS $$
DECLARE
  current_user_id uuid;
  user_company_id uuid;
  user_is_active boolean;
  user_is_super_admin boolean;
  effective_company_id uuid;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();

  -- If no user ID, return empty result
  IF current_user_id IS NULL THEN
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

  -- Deny access if user not found or inactive
  IF user_is_active IS NULL OR user_is_active = false THEN
    RETURN;
  END IF;

  -- Determine effective company scope
  IF user_is_super_admin = true THEN
    -- Super admin sees all companies (NULL = no filter)
    effective_company_id := NULL;
  ELSE
    -- Regular users scoped to their company
    effective_company_id := user_company_id;
  END IF;

  -- Build and execute the query
  RETURN QUERY
  SELECT
    ss.session_id,
    ss.program_id,
    pp.name AS program_name,
    ss.site_id,
    st.name AS site_name,
    st.type AS site_type,
    ss.session_status::text,
    ss.session_start_time,
    ss.created_by,
    u.email AS creator_email,
    ss.temperature,
    ss.humidity,
    ss.weather::text,
    (ss.petri_templates IS NOT NULL AND jsonb_array_length(ss.petri_templates) > 0) AS has_petri_templates,
    (ss.gasifier_templates IS NOT NULL AND jsonb_array_length(ss.gasifier_templates) > 0) AS has_gasifier_templates,
    COALESCE(jsonb_array_length(ss.petri_templates), 0)::bigint AS petri_template_count,
    COALESCE(jsonb_array_length(ss.gasifier_templates), 0)::bigint AS gasifier_template_count
  FROM submission_sessions ss
  INNER JOIN sites st ON ss.site_id = st.site_id
  INNER JOIN pilot_programs pp ON ss.program_id = pp.program_id
  LEFT JOIN users u ON ss.created_by = u.id
  WHERE
    -- Company scoping: if effective_company_id is NULL (super admin), no filter
    (effective_company_id IS NULL OR pp.company_id = effective_company_id)
    -- Only show unclaimed or active sessions
    AND ss.session_status IN ('Unclaimed', 'Active')
    -- Only show non-expired sessions (sessions expire at end of day they were created)
    AND ss.session_start_time >= CURRENT_DATE
    -- Only show active programs
    AND pp.status = 'active'
  ORDER BY ss.session_start_time DESC;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return empty result
    RAISE WARNING 'Error in get_active_sessions_with_details: %', SQLERRM;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_active_sessions_with_details() TO authenticated;

-- ==========================================
-- ADD FUNCTION COMMENT
-- ==========================================

COMMENT ON FUNCTION get_active_sessions_with_details() IS
'Returns active unclaimed sessions with site and program context, respecting company scoping.
Super admins see all companies, regular users see only their company sessions.
Replaces old function that relied on pilot_program_users table.';

-- ==========================================
-- VERIFICATION
-- ==========================================

-- Verify the function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_active_sessions_with_details'
  ) THEN
    RAISE EXCEPTION 'Function get_active_sessions_with_details was not created successfully';
  END IF;

  RAISE NOTICE 'get_active_sessions_with_details function created successfully';
END $$;
