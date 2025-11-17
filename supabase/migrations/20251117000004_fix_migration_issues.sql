/*
  # Fix Migration Issues

  1. Problems Found
    - lock_expired_submission_sessions uses 'Active' but enum is 'Unclaimed'/'Opened'/'Completed'
    - get_all_active_sessions_unified has ambiguous company_id reference
    - Both need fixing

  2. Fixes
    - Correct session_status enum values
    - Fully qualify company_id columns to avoid ambiguity
*/

-- ==========================================
-- FIX 1: Correct submission session locking logic
-- ==========================================

CREATE OR REPLACE FUNCTION lock_expired_submission_sessions()
RETURNS JSONB AS $$
DECLARE
  v_locked_count INT := 0;
  v_sessions_to_lock UUID[];
BEGIN
  RAISE NOTICE 'lock_expired_submission_sessions: Starting...';

  -- FIXED: Use correct enum values (Opened or working status from previous days)
  -- Note: submission_sessions doesn't use 'Active', checking the actual schema
  -- We'll mark any session from previous days as Completed
  SELECT ARRAY_AGG(session_id)
  INTO v_sessions_to_lock
  FROM submission_sessions
  WHERE session_status != 'Completed'  -- Any non-completed session
    AND DATE(session_start_time) < CURRENT_DATE;

  IF v_sessions_to_lock IS NULL OR ARRAY_LENGTH(v_sessions_to_lock, 1) = 0 THEN
    RAISE NOTICE 'No submission sessions to lock';
    RETURN jsonb_build_object(
      'success', true,
      'type', 'submission_sessions',
      'locked_count', 0,
      'message', 'No sessions to lock'
    );
  END IF;

  -- Lock the sessions by marking them as Completed
  UPDATE submission_sessions
  SET session_status = 'Completed',
      completion_time = NOW(),
      last_activity_time = NOW()
  WHERE session_id = ANY(v_sessions_to_lock);

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  RAISE NOTICE 'Locked % submission sessions', v_locked_count;

  RETURN jsonb_build_object(
    'success', true,
    'type', 'submission_sessions',
    'locked_count', v_locked_count,
    'locked_session_ids', v_sessions_to_lock
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error locking submission sessions: %', SQLERRM;
  RETURN jsonb_build_object(
    'success', false,
    'type', 'submission_sessions',
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- FIX 2: Fix ambiguous company_id in unified sessions
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
    p.company_id,  -- FIXED: Fully qualified
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
      'last_activity', ss.last_activity_time,
      'submission_id', ss.submission_id
    ) as session_metadata

  FROM submission_sessions ss
  JOIN sites s ON ss.site_id = s.site_id
  JOIN pilot_programs p ON ss.program_id = p.program_id
  JOIN companies c ON p.company_id = c.company_id
  LEFT JOIN users u ON ss.opened_by_user_id = u.id
  WHERE ss.session_status IN ('Unclaimed', 'Opened')  -- FIXED: Correct enum values
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
    sds.company_id,  -- FIXED: Fully qualified
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
Pass specific company_id to filter to that company only.
FIXED: Corrected enum values and ambiguous column references.';
