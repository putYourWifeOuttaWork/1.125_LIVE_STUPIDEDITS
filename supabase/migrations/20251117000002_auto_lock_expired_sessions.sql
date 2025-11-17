/*
  # Auto-Lock Expired Sessions System

  1. Problem
    - Old sessions remain "Active" or "in_progress" indefinitely
    - No automatic locking when session period ends
    - Creates confusion in UI and data integrity issues

  2. Solution
    - Create function to lock expired submission_sessions (human sessions)
    - Create function to lock expired site_device_sessions (device sessions)
    - Create wrapper function to lock both types
    - Schedule to run at midnight

  3. Tables Affected
    - submission_sessions (session_status)
    - site_device_sessions (status, locked_at)

  4. Locking Logic
    - submission_sessions: Lock if Active AND created_at is from previous day
    - site_device_sessions: Lock if in_progress AND session_end_time < NOW()
*/

-- ==========================================
-- PHASE B.1: Lock Expired Submission Sessions
-- ==========================================

CREATE OR REPLACE FUNCTION lock_expired_submission_sessions()
RETURNS JSONB AS $$
DECLARE
  v_locked_count INT := 0;
  v_sessions_to_lock UUID[];
BEGIN
  RAISE NOTICE 'lock_expired_submission_sessions: Starting...';

  -- Find sessions to lock (Active sessions from previous days)
  SELECT ARRAY_AGG(session_id)
  INTO v_sessions_to_lock
  FROM submission_sessions
  WHERE session_status = 'Active'
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

COMMENT ON FUNCTION lock_expired_submission_sessions() IS
'Automatically locks submission_sessions that are Active but from previous days.
Marks them as Completed and sets completion_time.';

-- ==========================================
-- PHASE B.2: Lock Expired Device Sessions
-- ==========================================

CREATE OR REPLACE FUNCTION lock_expired_device_sessions()
RETURNS JSONB AS $$
DECLARE
  v_locked_count INT := 0;
  v_sessions_to_lock UUID[];
BEGIN
  RAISE NOTICE 'lock_expired_device_sessions: Starting...';

  -- Find sessions to lock (in_progress sessions past their end time)
  SELECT ARRAY_AGG(session_id)
  INTO v_sessions_to_lock
  FROM site_device_sessions
  WHERE status = 'in_progress'
    AND session_end_time < NOW();

  IF v_sessions_to_lock IS NULL OR ARRAY_LENGTH(v_sessions_to_lock, 1) = 0 THEN
    RAISE NOTICE 'No device sessions to lock';
    RETURN jsonb_build_object(
      'success', true,
      'type', 'device_sessions',
      'locked_count', 0,
      'message', 'No sessions to lock'
    );
  END IF;

  -- Lock the sessions
  UPDATE site_device_sessions
  SET status = 'locked',
      locked_at = NOW()
  WHERE session_id = ANY(v_sessions_to_lock);

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  RAISE NOTICE 'Locked % device sessions', v_locked_count;

  RETURN jsonb_build_object(
    'success', true,
    'type', 'device_sessions',
    'locked_count', v_locked_count,
    'locked_session_ids', v_sessions_to_lock
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error locking device sessions: %', SQLERRM;
  RETURN jsonb_build_object(
    'success', false,
    'type', 'device_sessions',
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION lock_expired_device_sessions() IS
'Automatically locks site_device_sessions that are in_progress but past their session_end_time.
Marks them as locked and sets locked_at timestamp.';

-- ==========================================
-- PHASE B.3: Unified Lock Function
-- ==========================================

CREATE OR REPLACE FUNCTION lock_all_expired_sessions()
RETURNS JSONB AS $$
DECLARE
  v_submission_result JSONB;
  v_device_result JSONB;
  v_total_locked INT := 0;
BEGIN
  RAISE NOTICE 'lock_all_expired_sessions: Starting unified lock process';

  -- Lock submission sessions
  v_submission_result := lock_expired_submission_sessions();

  -- Lock device sessions
  v_device_result := lock_expired_device_sessions();

  -- Calculate total
  v_total_locked :=
    COALESCE((v_submission_result->>'locked_count')::INT, 0) +
    COALESCE((v_device_result->>'locked_count')::INT, 0);

  RAISE NOTICE 'Total sessions locked: %', v_total_locked;

  RETURN jsonb_build_object(
    'success', true,
    'total_locked', v_total_locked,
    'submission_sessions', v_submission_result,
    'device_sessions', v_device_result,
    'executed_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in lock_all_expired_sessions: %', SQLERRM;
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE,
    'submission_result', v_submission_result,
    'device_result', v_device_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION lock_all_expired_sessions() IS
'Master function that locks all expired sessions (both human and device).
Should be called daily at midnight via edge function.';

-- ==========================================
-- PHASE B.4: Helper Function - Check Expired Sessions
-- ==========================================

CREATE OR REPLACE FUNCTION check_expired_sessions()
RETURNS JSONB AS $$
DECLARE
  v_submission_count INT;
  v_device_count INT;
  v_submission_sessions JSONB;
  v_device_sessions JSONB;
BEGIN
  -- Count expired submission sessions
  SELECT COUNT(*), jsonb_agg(jsonb_build_object(
    'session_id', session_id,
    'site_id', site_id,
    'status', session_status,
    'started', session_start_time,
    'days_old', EXTRACT(DAY FROM NOW() - session_start_time)
  ))
  INTO v_submission_count, v_submission_sessions
  FROM submission_sessions
  WHERE session_status = 'Active'
    AND DATE(session_start_time) < CURRENT_DATE;

  -- Count expired device sessions
  SELECT COUNT(*), jsonb_agg(jsonb_build_object(
    'session_id', session_id,
    'site_id', site_id,
    'session_date', session_date,
    'status', status,
    'end_time', session_end_time,
    'hours_overdue', EXTRACT(HOUR FROM NOW() - session_end_time)
  ))
  INTO v_device_count, v_device_sessions
  FROM site_device_sessions
  WHERE status = 'in_progress'
    AND session_end_time < NOW();

  RETURN jsonb_build_object(
    'expired_submission_sessions', COALESCE(v_submission_count, 0),
    'expired_device_sessions', COALESCE(v_device_count, 0),
    'total_expired', COALESCE(v_submission_count, 0) + COALESCE(v_device_count, 0),
    'submission_details', COALESCE(v_submission_sessions, '[]'::jsonb),
    'device_details', COALESCE(v_device_sessions, '[]'::jsonb),
    'checked_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_expired_sessions() IS
'Diagnostic function to check how many sessions need locking without actually locking them.
Useful for testing and monitoring.';

-- ==========================================
-- Grant execute permissions
-- ==========================================

GRANT EXECUTE ON FUNCTION lock_expired_submission_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION lock_expired_device_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION lock_all_expired_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION check_expired_sessions() TO authenticated;
