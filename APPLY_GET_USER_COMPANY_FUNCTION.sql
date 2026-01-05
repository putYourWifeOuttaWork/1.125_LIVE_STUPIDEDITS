/*
  # Create get_user_company RPC Function

  This function is required by the frontend useCompanies hook.
  It returns the user's company data and admin status.

  INSTRUCTIONS:
  1. Go to your Supabase Dashboard
  2. Navigate to SQL Editor
  3. Copy and paste this entire SQL script
  4. Click "Run" to execute
  5. Refresh your application
*/

-- Function to get user's company with admin status
CREATE OR REPLACE FUNCTION get_user_company()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_is_company_admin BOOLEAN;
  v_company_data JSONB;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'has_company', false,
      'company', NULL,
      'is_admin', false
    );
  END IF;

  -- Get user's company_id and admin status
  SELECT company_id, is_company_admin
  INTO v_company_id, v_is_company_admin
  FROM users
  WHERE id = v_user_id;

  -- If user has no company assigned
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'has_company', false,
      'company', NULL,
      'is_admin', false
    );
  END IF;

  -- Fetch company data
  SELECT to_jsonb(companies.*) INTO v_company_data
  FROM companies
  WHERE company_id = v_company_id;

  -- Return company data with admin status
  RETURN jsonb_build_object(
    'has_company', true,
    'company', v_company_data,
    'is_admin', COALESCE(v_is_company_admin, false)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_company() TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_user_company() IS 'Returns the current user''s company data and admin status. Used by frontend useCompanies hook.';

-- Test the function (optional - shows what the function returns)
SELECT get_user_company();
