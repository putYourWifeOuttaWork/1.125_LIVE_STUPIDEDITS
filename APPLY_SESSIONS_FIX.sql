/*
  # Fix Ambiguous Column Reference in Unified Sessions Function

  1. Problem
    - get_my_active_sessions_unified() fails with error:
      "column reference 'company_id' is ambiguous"
    - Line 189 selects company_id without table prefix
    
  2. Fix
    - Add table alias 'u' to users table
    - Prefix company_id and is_super_admin with 'u.'
*/

CREATE OR REPLACE FUNCTION get_my_active_sessions_unified()
RETURNS TABLE (
  session_id UUID,
  session_type TEXT,
  session_date DATE,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  company_id UUID,
  company_name TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  claimed_by_user_id UUID,
  claimed_by_name TEXT,
  expected_items INT,
  completed_items INT,
  progress_percent NUMERIC,
  session_metadata JSONB
) AS $$
DECLARE
  v_user_company_id UUID;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Get current user's company and admin status
  -- FIX: Prefix columns with table alias to avoid ambiguity
  SELECT u.company_id, u.is_super_admin
  INTO v_user_company_id, v_is_super_admin
  FROM users u
  WHERE u.id = auth.uid();

  -- If super-admin and has active company context, use that
  IF v_is_super_admin THEN
    SELECT active_company_id
    INTO v_user_company_id
    FROM user_active_company_context
    WHERE user_id = auth.uid();

    -- If no active context set, show all companies (pass NULL)
    IF v_user_company_id IS NULL THEN
      RETURN QUERY SELECT * FROM get_all_active_sessions_unified(NULL);
      RETURN;
    END IF;
  END IF;

  -- Regular user or super-admin with active context
  RETURN QUERY SELECT * FROM get_all_active_sessions_unified(v_user_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_my_active_sessions_unified() IS
'Returns unified active sessions for the current user.
Super-admins with no active company context see all companies.
Super-admins with active context see that company.
Regular users see their company only.';
