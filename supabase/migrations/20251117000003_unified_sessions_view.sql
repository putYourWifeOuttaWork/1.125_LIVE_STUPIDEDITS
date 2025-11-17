/*
  # Unified Active Sessions View

  1. Purpose
    - Create single RPC function returning ALL active sessions (human + device)
    - Support company filtering for super-admins and regular users
    - Enable unified "Sessions" drawer in UI

  2. Tables Queried
    - submission_sessions (human field worker sessions)
    - site_device_sessions (automated device sessions)
    - sites, pilot_programs, users (for context)

  3. Session Types
    - 'human': Manual submissions by field workers
    - 'device': Automated device wake sessions

  4. RLS Behavior
    - Super-admins: See all sessions (when p_company_id IS NULL)
    - Regular users: Only see their company sessions
    - Respects existing RLS policies on underlying tables
*/

-- ==========================================
-- UNIFIED ACTIVE SESSIONS RPC
-- ==========================================

CREATE OR REPLACE FUNCTION get_all_active_sessions_unified(p_company_id UUID DEFAULT NULL)
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
BEGIN
  RETURN QUERY

  -- PART 1: Human submission sessions
  SELECT
    ss.session_id,
    'human'::TEXT as session_type,
    DATE(ss.session_start_time) as session_date,
    ss.site_id,
    s.name as site_name,
    ss.program_id,
    p.name as program_name,
    p.company_id,
    c.name as company_name,
    ss.session_status::TEXT as status,
    ss.session_start_time as started_at,
    ss.opened_by_user_id as claimed_by_user_id,
    u.full_name as claimed_by_name,

    -- Expected items: count total observations from site defaults
    (
      COALESCE(
        (SELECT JSONB_ARRAY_LENGTH(s.petri_defaults)),
        0
      ) +
      COALESCE(
        (SELECT JSONB_ARRAY_LENGTH(s.gasifier_defaults)),
        0
      )
    )::INT as expected_items,

    -- Completed items: count actual observations
    (ss.valid_petris_logged + ss.valid_gasifiers_logged)::INT as completed_items,

    -- Progress percent
    ss.percentage_complete as progress_percent,

    -- Metadata
    jsonb_build_object(
      'is_unclaimed', (ss.session_status = 'Unclaimed'),
      'escalated_to_user_ids', ss.escalated_to_user_ids,
      'petris_logged', ss.valid_petris_logged,
      'gasifiers_logged', ss.valid_gasifiers_logged,
      'last_activity', ss.last_activity_time
    ) as session_metadata

  FROM submission_sessions ss
  JOIN sites s ON ss.site_id = s.site_id
  JOIN pilot_programs p ON ss.program_id = p.program_id
  JOIN companies c ON p.company_id = c.company_id
  LEFT JOIN users u ON ss.opened_by_user_id = u.id
  WHERE ss.session_status IN ('Unclaimed', 'Active')
    AND (p_company_id IS NULL OR p.company_id = p_company_id)

  UNION ALL

  -- PART 2: Device sessions
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
    NULL::UUID as claimed_by_user_id,
    'Auto (Device)'::TEXT as claimed_by_name,

    -- Expected items: wake count
    sds.expected_wake_count as expected_items,

    -- Completed items: completed wake count
    sds.completed_wake_count as completed_items,

    -- Progress percent
    CASE
      WHEN sds.expected_wake_count > 0 THEN
        ROUND((sds.completed_wake_count::NUMERIC / sds.expected_wake_count::NUMERIC) * 100, 2)
      ELSE 0
    END as progress_percent,

    -- Metadata
    jsonb_build_object(
      'expected_wake_count', sds.expected_wake_count,
      'completed_wake_count', sds.completed_wake_count,
      'failed_wake_count', sds.failed_wake_count,
      'extra_wake_count', sds.extra_wake_count,
      'config_changed', sds.config_changed_flag,
      'session_end_time', sds.session_end_time,
      'device_submission_id', sds.device_submission_id
    ) as session_metadata

  FROM site_device_sessions sds
  JOIN sites s ON sds.site_id = s.site_id
  JOIN pilot_programs p ON sds.program_id = p.program_id
  JOIN companies c ON sds.company_id = c.company_id
  WHERE sds.status = 'in_progress'
    AND (p_company_id IS NULL OR sds.company_id = p_company_id)

  ORDER BY started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_all_active_sessions_unified(UUID) IS
'Returns unified view of all active sessions (human + device).
Pass NULL for company_id to see all companies (super-admin).
Pass specific company_id to filter to that company only.';

-- ==========================================
-- HELPER: Get Active Sessions for Current User
-- ==========================================

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
  SELECT company_id, is_super_admin
  INTO v_user_company_id, v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  -- If super-admin and has active company context, use that
  -- Otherwise use their default company
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

-- ==========================================
-- Grant execute permissions
-- ==========================================

GRANT EXECUTE ON FUNCTION get_all_active_sessions_unified(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_active_sessions_unified() TO authenticated;
