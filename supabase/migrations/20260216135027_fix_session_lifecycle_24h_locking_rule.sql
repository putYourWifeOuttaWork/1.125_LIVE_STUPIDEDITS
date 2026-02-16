/*
  # Fix Session Lifecycle: 24-Hour Locking Rule

  1. Problem
    - Race condition: pg_cron fires lock_all_expired_sessions() at midnight UTC,
      then auto_create_daily_sessions() runs immediately after.
    - For US Eastern sites (UTC-5), it's still the previous day, so the opener
      calculates session_date = previous day and the ON CONFLICT resets the locked
      session back to 'in_progress'.
    - This creates duplicate/stale sessions visible in the Sessions Drawer.

  2. Fix: 24-Hour Locking Rule
    - fn_midnight_session_opener now locks any in_progress session for the site
      that has been running for >= 24 hours BEFORE creating a new one.
    - The ON CONFLICT clause is guarded with WHERE status != 'locked' so locked
      sessions can never be reverted to in_progress.
    - lock_expired_device_sessions also uses the 24-hour rule as a safety net.

  3. Data Cleanup
    - Fix existing stale sessions where locked_at is set but status is still
      'in_progress' (caused by the race condition).

  4. Tables Affected
    - site_device_sessions (status, locked_at)

  5. Functions Modified
    - fn_midnight_session_opener(UUID)
    - lock_expired_device_sessions()
*/

-- Step 1: Clean up existing stale data from the race condition
-- Sessions that were locked (locked_at set) but got reverted to in_progress
UPDATE site_device_sessions
SET status = 'locked'
WHERE locked_at IS NOT NULL
  AND status = 'in_progress';

-- Step 2: Recreate fn_midnight_session_opener with 24-hour locking rule
CREATE OR REPLACE FUNCTION fn_midnight_session_opener(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_site_timezone TEXT;
  v_session_date DATE;
  v_session_start TIMESTAMPTZ;
  v_session_end TIMESTAMPTZ;
  v_expected_wake_count INT := 0;
  v_device_record RECORD;
  v_config_changed BOOLEAN := FALSE;
  v_session_id UUID;
  v_device_submission_id UUID;
  v_stale_locked_count INT := 0;
BEGIN
  SELECT s.program_id, p.company_id, s.timezone
  INTO v_program_id, v_company_id, v_site_timezone
  FROM sites s
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE s.site_id = p_site_id;

  IF v_program_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Site not found or not assigned to program'
    );
  END IF;

  v_site_timezone := COALESCE(v_site_timezone, 'UTC');

  -- PRE-STEP: Lock any in_progress session for this site running >= 24 hours
  UPDATE site_device_sessions
  SET status = 'locked',
      locked_at = NOW()
  WHERE site_id = p_site_id
    AND status = 'in_progress'
    AND (NOW() - session_start_time) >= INTERVAL '24 hours';

  GET DIAGNOSTICS v_stale_locked_count = ROW_COUNT;

  IF v_stale_locked_count > 0 THEN
    RAISE NOTICE 'fn_midnight_session_opener: Locked % stale session(s) for site %',
      v_stale_locked_count, p_site_id;
  END IF;

  v_session_date := (NOW() AT TIME ZONE v_site_timezone)::DATE;
  v_session_start := (v_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_site_timezone;
  v_session_end := v_session_start + INTERVAL '1 day';

  FOR v_device_record IN
    SELECT dsc.device_id, dsc.new_wake_schedule_cron, dsc.change_id
    FROM device_schedule_changes dsc
    JOIN device_site_assignments dsa ON dsc.device_id = dsa.device_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
      AND dsc.effective_date = v_session_date
      AND dsc.applied_at IS NULL
    ORDER BY dsc.requested_at DESC
  LOOP
    UPDATE devices
    SET wake_schedule_cron = v_device_record.new_wake_schedule_cron,
        updated_at = NOW()
    WHERE device_id = v_device_record.device_id;

    UPDATE device_schedule_changes
    SET applied_at = NOW(),
        applied_by_function = 'fn_midnight_session_opener'
    WHERE change_id = v_device_record.change_id;

    v_config_changed := TRUE;
  END LOOP;

  FOR v_device_record IN
    SELECT d.device_id, d.wake_schedule_cron
    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
      AND d.is_active = TRUE
  LOOP
    v_expected_wake_count := v_expected_wake_count +
      fn_parse_cron_wake_count(v_device_record.wake_schedule_cron);
  END LOOP;

  v_device_submission_id := fn_get_or_create_device_submission(p_site_id, v_session_date);

  INSERT INTO site_device_sessions (
    company_id,
    program_id,
    site_id,
    session_date,
    session_start_time,
    session_end_time,
    expected_wake_count,
    status,
    config_changed_flag,
    device_submission_id
  ) VALUES (
    v_company_id,
    v_program_id,
    p_site_id,
    v_session_date,
    v_session_start,
    v_session_end,
    v_expected_wake_count,
    'in_progress',
    v_config_changed,
    v_device_submission_id
  )
  ON CONFLICT (site_id, session_date) DO UPDATE
  SET expected_wake_count = EXCLUDED.expected_wake_count,
      config_changed_flag = EXCLUDED.config_changed_flag,
      device_submission_id = EXCLUDED.device_submission_id,
      status = 'in_progress'
  WHERE site_device_sessions.status != 'locked'
  RETURNING session_id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT session_id INTO v_session_id
    FROM site_device_sessions
    WHERE site_id = p_site_id AND session_date = v_session_date;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'device_submission_id', v_device_submission_id,
    'site_id', p_site_id,
    'session_date', v_session_date,
    'expected_wake_count', v_expected_wake_count,
    'config_changed', v_config_changed,
    'timezone', v_site_timezone,
    'stale_sessions_locked', v_stale_locked_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_midnight_session_opener(UUID) IS
'Create daily site session. Enforces 24-hour locking rule: any in_progress session running >= 24 hours is locked before creating a new one. ON CONFLICT guard prevents re-opening locked sessions.';

-- Step 3: Recreate lock_expired_device_sessions with 24-hour rule
CREATE OR REPLACE FUNCTION lock_expired_device_sessions()
RETURNS JSONB AS $$
DECLARE
  v_locked_count INT := 0;
  v_sessions_to_lock UUID[];
BEGIN
  RAISE NOTICE 'lock_expired_device_sessions: Starting...';

  SELECT ARRAY_AGG(session_id)
  INTO v_sessions_to_lock
  FROM site_device_sessions
  WHERE status = 'in_progress'
    AND (
      session_end_time < NOW()
      OR (NOW() - session_start_time) >= INTERVAL '24 hours'
    );

  IF v_sessions_to_lock IS NULL OR ARRAY_LENGTH(v_sessions_to_lock, 1) = 0 THEN
    RAISE NOTICE 'No device sessions to lock';
    RETURN jsonb_build_object(
      'success', true,
      'type', 'device_sessions',
      'locked_count', 0,
      'message', 'No sessions to lock'
    );
  END IF;

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
'Locks device sessions that are in_progress and either past their end time or running >= 24 hours.';

GRANT EXECUTE ON FUNCTION fn_midnight_session_opener(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lock_expired_device_sessions() TO authenticated, service_role;
