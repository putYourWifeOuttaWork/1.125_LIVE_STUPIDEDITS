-- Fixed Device Sessions Function
-- Matches actual column types from database schema

CREATE OR REPLACE FUNCTION get_my_active_device_sessions()
RETURNS TABLE (
  session_id UUID,
  session_type TEXT,
  session_date DATE,
  site_id UUID,
  site_name CHARACTER VARYING,  -- Changed from TEXT
  program_id UUID,
  program_name CHARACTER VARYING,  -- Changed from TEXT
  company_id UUID,
  company_name CHARACTER VARYING,  -- Changed from TEXT
  status TEXT,
  started_at TIMESTAMPTZ,
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
  SELECT u.company_id, u.is_super_admin
  INTO v_user_company_id, v_is_super_admin
  FROM users u
  WHERE u.id = auth.uid();

  -- If super-admin, check for active company context
  IF v_is_super_admin THEN
    SELECT active_company_id
    INTO v_user_company_id
    FROM user_active_company_context
    WHERE user_id = auth.uid();

    -- If no active context, show all companies
    IF v_user_company_id IS NULL THEN
      v_user_company_id := NULL; -- Show all
    END IF;
  END IF;

  -- Return device sessions only
  RETURN QUERY
  SELECT
    sds.session_id,
    'device'::TEXT as session_type,
    sds.session_date,
    sds.site_id,
    s.name as site_name,
    sds.program_id,
    p.name as program_name,
    sds.company_id,
    c.name as company_name,
    sds.status::TEXT,
    sds.session_start_time as started_at,

    -- Expected items: wake count
    sds.expected_wake_count as expected_items,

    -- Completed items: completed wake count
    sds.completed_wake_count as completed_items,

    -- Progress percentage
    CASE
      WHEN sds.expected_wake_count > 0
      THEN ROUND((sds.completed_wake_count::NUMERIC / sds.expected_wake_count::NUMERIC) * 100, 1)
      ELSE 0
    END as progress_percent,

    -- Metadata
    jsonb_build_object(
      'failed_wake_count', sds.failed_wake_count,
      'extra_wake_count', sds.extra_wake_count,
      'session_end_time', sds.session_end_time,
      'locked_at', sds.locked_at
    ) as session_metadata

  FROM site_device_sessions sds
  JOIN sites s ON sds.site_id = s.site_id
  JOIN pilot_programs p ON sds.program_id = p.program_id
  JOIN companies c ON sds.company_id = c.company_id
  WHERE sds.status = 'in_progress'
    AND (v_user_company_id IS NULL OR sds.company_id = v_user_company_id)
  ORDER BY sds.session_start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_my_active_device_sessions() IS
'Returns active device sessions only (no human submissions).
Respects company context for regular users and super-admins.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_my_active_device_sessions() TO authenticated;
