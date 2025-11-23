/*
  # Session Roll-Up Counter Triggers (CORRECTED)

  ## Purpose
  Create database triggers to automatically maintain roll-up counters on site_device_sessions.
  These counters track wake completion, failures, and overage wakes per session.

  ## Actual Column Names
  - payload_status: 'pending', 'complete', 'failed'
  - is_complete: boolean (true when wake fully processed)
  - overage_flag: boolean (true for extra/overage wakes)

  ## Changes

  ### 1. Function: increment_session_wake_counts()
  - Fires on INSERT/UPDATE to device_wake_payloads
  - Increments completed_wake_count when payload_status = 'complete'
  - Increments failed_wake_count when payload_status = 'failed'
  - Increments extra_wake_count when overage_flag = true

  ### 2. Function: update_session_status_on_wake()
  - Fires after wake count updates
  - Changes session status from 'pending' to 'in_progress' on first wake

  ## Safety
  - Uses CREATE OR REPLACE for idempotency
  - Uses COALESCE for null-safe increments
  - Only updates when site_device_session_id is present
*/

-- =====================================================================
-- 1. TRIGGER FUNCTION: Increment Session Wake Counts
-- =====================================================================

CREATE OR REPLACE FUNCTION increment_session_wake_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_is_complete BOOLEAN := FALSE;
  v_is_failed BOOLEAN := FALSE;
  v_is_overage BOOLEAN := FALSE;
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  -- Only process if linked to a session
  IF NEW.site_device_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine wake status from NEW record
  v_new_status := NEW.payload_status;
  v_is_overage := COALESCE(NEW.overage_flag, FALSE);

  -- For UPDATE operations, check if status changed
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.payload_status;

    -- If payload_status changed from non-complete to 'complete'
    IF v_new_status = 'complete' AND v_old_status != 'complete' THEN
      UPDATE site_device_sessions
      SET
        completed_wake_count = COALESCE(completed_wake_count, 0) + 1
      WHERE session_id = NEW.site_device_session_id;
    END IF;

    -- If payload_status changed from non-failed to 'failed'
    IF v_new_status = 'failed' AND v_old_status != 'failed' THEN
      UPDATE site_device_sessions
      SET
        failed_wake_count = COALESCE(failed_wake_count, 0) + 1
      WHERE session_id = NEW.site_device_session_id;
    END IF;

    -- If overage_flag changed from FALSE to TRUE
    IF v_is_overage = TRUE AND COALESCE(OLD.overage_flag, FALSE) = FALSE THEN
      UPDATE site_device_sessions
      SET
        extra_wake_count = COALESCE(extra_wake_count, 0) + 1
      WHERE session_id = NEW.site_device_session_id;
    END IF;

  -- For INSERT operations, increment based on initial status
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE site_device_sessions
    SET
      completed_wake_count = CASE
        WHEN v_new_status = 'complete' THEN COALESCE(completed_wake_count, 0) + 1
        ELSE COALESCE(completed_wake_count, 0)
      END,
      failed_wake_count = CASE
        WHEN v_new_status = 'failed' THEN COALESCE(failed_wake_count, 0) + 1
        ELSE COALESCE(failed_wake_count, 0)
      END,
      extra_wake_count = CASE
        WHEN v_is_overage THEN COALESCE(extra_wake_count, 0) + 1
        ELSE COALESCE(extra_wake_count, 0)
      END
    WHERE session_id = NEW.site_device_session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_increment_session_wake_counts ON device_wake_payloads;

-- Create trigger
CREATE TRIGGER trg_increment_session_wake_counts
  AFTER INSERT OR UPDATE OF payload_status, overage_flag
  ON device_wake_payloads
  FOR EACH ROW
  EXECUTE FUNCTION increment_session_wake_counts();

COMMENT ON FUNCTION increment_session_wake_counts() IS
  'Automatically updates site_device_sessions wake counters when wake payloads are created or status changes';

-- =====================================================================
-- 2. TRIGGER FUNCTION: Update Session Status on First Wake
-- =====================================================================

CREATE OR REPLACE FUNCTION update_session_status_on_wake()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if linked to a session
  IF NEW.site_device_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On first wake, change session from 'pending' to 'in_progress'
  UPDATE site_device_sessions
  SET status = 'in_progress'
  WHERE session_id = NEW.site_device_session_id
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_update_session_status_on_wake ON device_wake_payloads;

-- Create trigger
CREATE TRIGGER trg_update_session_status_on_wake
  AFTER INSERT ON device_wake_payloads
  FOR EACH ROW
  EXECUTE FUNCTION update_session_status_on_wake();

COMMENT ON FUNCTION update_session_status_on_wake() IS
  'Automatically changes session status from pending to in_progress when first wake arrives';

-- =====================================================================
-- SUCCESS MESSAGE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Session roll-up counter triggers created successfully';
  RAISE NOTICE '   - increment_session_wake_counts() updates completed/failed/extra wake counts';
  RAISE NOTICE '   - update_session_status_on_wake() transitions pending → in_progress';
  RAISE NOTICE '   - Triggers fire on device_wake_payloads INSERT/UPDATE';
  RAISE NOTICE '';
  RAISE NOTICE 'Column mapping:';
  RAISE NOTICE '   - completed_wake_count ← payload_status = ''complete''';
  RAISE NOTICE '   - failed_wake_count ← payload_status = ''failed''';
  RAISE NOTICE '   - extra_wake_count ← overage_flag = true';
END $$;
