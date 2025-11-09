/*
  # Create get_recent_submissions_v3 RPC Function

  ## Overview
  This migration creates the RPC function that returns recent submissions with
  full context data (site names, program names, observation counts) while
  respecting the role-based access control and company scoping rules.

  ## Changes
  1. Create superadmin_impersonations table for audit trail
  2. Create helper function to extract impersonation context from JWT
  3. Create get_recent_submissions_v3 RPC function with proper access control

  ## Access Control Logic

  ### Super Admin (is_super_admin = true)
  - **Normal Mode**: Can see submissions from ALL companies (global access)
  - **Impersonation Mode**: Scoped to impersonated company only
  - Checks JWT claims for app.impersonated_company_id

  ### Non-Super-Admin Users
  - Strictly scoped to their company_id from users table
  - Cannot see submissions from other companies
  - Must have is_active = true

  ### All Users
  - Must be active (is_active = true)
  - Can filter by program_id and site_id (optional parameters)
  - Results ordered by most recent first

  ## Function Parameters
  - limit_param: Maximum number of submissions to return (default: 10)
  - program_id_param: Optional UUID to filter by specific program
  - site_id_param: Optional UUID to filter by specific site

  ## Return Structure
  Returns table with columns:
  - submission_id: UUID of the submission
  - site_id: UUID of the site
  - site_name: Name of the site
  - program_id: UUID of the program
  - program_name: Name of the program
  - temperature: Numeric temperature value
  - humidity: Numeric humidity value
  - weather: Weather enum value
  - created_at: Timestamp of submission
  - petri_count: Count of petri observations
  - gasifier_count: Count of gasifier observations
  - global_submission_id: Integer display ID

  ## Usage Examples

  ### Get 10 most recent submissions (company-scoped for regular users)
  ```sql
  SELECT * FROM get_recent_submissions_v3(10, NULL, NULL);
  ```

  ### Get recent submissions for a specific program
  ```sql
  SELECT * FROM get_recent_submissions_v3(10, '123e4567-e89b-12d3-a456-426614174000'::uuid, NULL);
  ```

  ### Get recent submissions for a specific site
  ```sql
  SELECT * FROM get_recent_submissions_v3(10, NULL, '123e4567-e89b-12d3-a456-426614174000'::uuid);
  ```

  ## Security Notes
  - Function runs as SECURITY DEFINER to bypass RLS for controlled access
  - All company scoping is enforced within the function logic
  - Input parameters are properly validated and cast to prevent SQL injection
  - Inactive users are immediately denied access
*/

-- ==========================================
-- STEP 1: CREATE IMPERSONATION TRACKING TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS superadmin_impersonations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_company_id uuid NOT NULL REFERENCES companies(company_id),
  target_company_name text,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  was_global_override boolean NOT NULL DEFAULT false,
  request_ip text,
  user_agent text
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_superadmin_impersonations_user_id
  ON superadmin_impersonations(super_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_impersonations_company_id
  ON superadmin_impersonations(target_company_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_impersonations_active
  ON superadmin_impersonations(super_admin_user_id, ended_at)
  WHERE ended_at IS NULL;

-- Enable RLS on impersonations table
ALTER TABLE superadmin_impersonations ENABLE ROW LEVEL SECURITY;

-- Only super admins can view impersonation records
CREATE POLICY "Super admins can view all impersonations"
  ON superadmin_impersonations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
    )
  );

-- Only super admins can create impersonation records
CREATE POLICY "Super admins can create impersonations"
  ON superadmin_impersonations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    super_admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
    )
  );

-- Only super admins can update their own impersonation records (to set ended_at)
CREATE POLICY "Super admins can end their own impersonations"
  ON superadmin_impersonations
  FOR UPDATE
  TO authenticated
  USING (
    super_admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
    )
  );

COMMENT ON TABLE superadmin_impersonations IS 'Audit trail for super admin company impersonation sessions';

-- ==========================================
-- STEP 2: CREATE HELPER FUNCTION FOR IMPERSONATION CONTEXT
-- ==========================================

CREATE OR REPLACE FUNCTION get_impersonated_company_id()
RETURNS uuid AS $$
DECLARE
  impersonated_company_id uuid;
  jwt_claims jsonb;
BEGIN
  -- Try to get JWT claims
  BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;

  -- Extract impersonated company ID if present
  IF jwt_claims IS NOT NULL THEN
    impersonated_company_id := (jwt_claims->>'app.impersonated_company_id')::uuid;
    RETURN impersonated_company_id;
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_impersonated_company_id() IS 'Extracts the impersonated company ID from JWT claims if present';

-- ==========================================
-- STEP 3: CREATE GET_RECENT_SUBMISSIONS_V3 FUNCTION
-- ==========================================

-- Drop existing function if it exists (required when changing return type)
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

  -- Check for impersonation context (super admins only)
  IF user_is_super_admin = true THEN
    impersonated_company_id := get_impersonated_company_id();

    IF impersonated_company_id IS NOT NULL THEN
      -- Super admin is impersonating, scope to that company
      effective_company_id := impersonated_company_id;
    ELSE
      -- Super admin not impersonating, allow global access (NULL = no filter)
      effective_company_id := NULL;
    END IF;
  ELSE
    -- Regular users always scoped to their company
    effective_company_id := user_company_id;
  END IF;

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
    -- Only show active programs
    AND pp.status = 'active'
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

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return empty result
    RAISE WARNING 'Error in get_recent_submissions_v3: %', SQLERRM;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) TO authenticated;

-- Add function comment
COMMENT ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) IS
'Returns recent submissions with site and program context, respecting company scoping and super admin impersonation.
Super admins see all companies unless impersonating a specific company.';

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

-- Verify the function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_recent_submissions_v3'
  ) THEN
    RAISE EXCEPTION 'Function get_recent_submissions_v3 was not created successfully';
  END IF;

  RAISE NOTICE 'get_recent_submissions_v3 function created successfully';
END $$;

-- Verify impersonations table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'superadmin_impersonations'
  ) THEN
    RAISE EXCEPTION 'superadmin_impersonations table was not created successfully';
  END IF;

  RAISE NOTICE 'superadmin_impersonations table created successfully';
END $$;

-- ==========================================
-- ROLLBACK INSTRUCTIONS
-- ==========================================

/*
  To rollback this migration:

  DROP FUNCTION IF EXISTS get_recent_submissions_v3(integer, uuid, uuid);
  DROP FUNCTION IF EXISTS get_impersonated_company_id();
  DROP TABLE IF EXISTS superadmin_impersonations CASCADE;
*/
