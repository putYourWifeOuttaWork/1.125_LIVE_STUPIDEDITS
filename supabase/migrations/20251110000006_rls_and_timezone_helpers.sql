/*
  # RLS Policy Refinements and Timezone Helpers - Phase 2.5

  1. Purpose
    - Add SELECT policy for device_schedule_changes (non-admin read access)
    - Create timezone helper function with logging
    - Ensure consistent timezone handling across all functions

  2. Changes
    - device_schedule_changes: Add SELECT policy for authenticated users
    - fn_get_site_timezone: Helper function with fallback and logging
    - Verify all RLS policies use get_active_company_id()

  3. Security
    - Non-admins can view device schedules in their company
    - Only admins can INSERT/UPDATE/DELETE schedules
    - Timezone warnings logged for operational visibility
*/

-- ==========================================
-- TIMEZONE HELPER FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_site_timezone(p_site_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_timezone TEXT;
  v_site_name TEXT;
BEGIN
  -- Get site timezone and name
  SELECT timezone, name
  INTO v_timezone, v_site_name
  FROM sites
  WHERE site_id = p_site_id;

  -- Fallback to UTC if null
  IF v_timezone IS NULL THEN
    v_timezone := 'UTC';

    -- Log warning for operational visibility
    INSERT INTO async_error_logs (
      table_name,
      trigger_name,
      function_name,
      status,
      error_message,
      error_details
    ) VALUES (
      'sites',
      'timezone_helper',
      'fn_get_site_timezone',
      'warning',
      'Site timezone is NULL, falling back to UTC',
      jsonb_build_object(
        'site_id', p_site_id,
        'site_name', v_site_name,
        'fallback_timezone', 'UTC',
        'timestamp', NOW()
      )
    );
  END IF;

  RETURN v_timezone;

EXCEPTION WHEN OTHERS THEN
  -- Fallback on any error
  RETURN 'UTC';
END;
$$;

COMMENT ON FUNCTION fn_get_site_timezone(UUID) IS 'Get site timezone with UTC fallback. Logs warning if timezone is NULL. Used for consistent timezone handling across device session functions.';

GRANT EXECUTE ON FUNCTION fn_get_site_timezone(UUID) TO authenticated, service_role;

-- ==========================================
-- RLS POLICY: device_schedule_changes SELECT
-- ==========================================

-- Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Users can view device schedules" ON device_schedule_changes;
DROP POLICY IF EXISTS "Admins manage schedules in their company" ON device_schedule_changes;

-- Allow authenticated users to view device schedules in their company
CREATE POLICY "Users can view device schedules in their company"
ON device_schedule_changes
FOR SELECT
TO authenticated
USING (company_id = get_active_company_id());

-- Only admins can insert schedule changes
CREATE POLICY "Admins can create schedule changes"
ON device_schedule_changes
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_active_company_id()
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (is_company_admin = TRUE OR is_super_admin = TRUE)
  )
);

-- Only admins can update schedule changes
CREATE POLICY "Admins can update schedule changes"
ON device_schedule_changes
FOR UPDATE
TO authenticated
USING (
  company_id = get_active_company_id()
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (is_company_admin = TRUE OR is_super_admin = TRUE)
  )
)
WITH CHECK (
  company_id = get_active_company_id()
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (is_company_admin = TRUE OR is_super_admin = TRUE)
  )
);

-- Only admins can delete schedule changes
CREATE POLICY "Admins can delete schedule changes"
ON device_schedule_changes
FOR DELETE
TO authenticated
USING (
  company_id = get_active_company_id()
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (is_company_admin = TRUE OR is_super_admin = TRUE)
  )
);

COMMENT ON POLICY "Users can view device schedules in their company" ON device_schedule_changes IS 'All authenticated users can view device schedules in their company (read-only)';
COMMENT ON POLICY "Admins can create schedule changes" ON device_schedule_changes IS 'Only company admins and super admins can create schedule changes';
COMMENT ON POLICY "Admins can update schedule changes" ON device_schedule_changes IS 'Only company admins and super admins can update schedule changes';
COMMENT ON POLICY "Admins can delete schedule changes" ON device_schedule_changes IS 'Only company admins and super admins can delete schedule changes';

-- ==========================================
-- VERIFY RLS ON NEW TABLES
-- ==========================================

-- Ensure RLS is enabled on all new device submission tables
ALTER TABLE site_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_wake_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_schedule_changes ENABLE ROW LEVEL SECURITY;

-- Verify all policies exist (policies were created in migration 20251110000000)
DO $$
BEGIN
  -- Check site_device_sessions policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'site_device_sessions'
      AND policyname = 'Users see site sessions in their company'
  ) THEN
    RAISE NOTICE 'Missing RLS policy for site_device_sessions';
  END IF;

  -- Check device_wake_payloads policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'device_wake_payloads'
      AND policyname = 'Users see payloads in their company'
  ) THEN
    RAISE NOTICE 'Missing RLS policy for device_wake_payloads';
  END IF;

  -- Check device_schedule_changes policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'device_schedule_changes'
      AND policyname = 'Users can view device schedules in their company'
  ) THEN
    RAISE NOTICE 'Missing RLS policy for device_schedule_changes (SELECT)';
  END IF;
END $$;

-- ==========================================
-- ADD HELPFUL COMMENTS
-- ==========================================

COMMENT ON TABLE site_device_sessions IS 'Daily time-bounded container for all device wakes at a site. Status is time-based (midnight to midnight), not data-based.';
COMMENT ON TABLE device_wake_payloads IS 'Canonical per-wake event record. One row per device wake window. Supersedes device_wake_sessions as authoritative source.';
COMMENT ON TABLE device_schedule_changes IS 'Queue for per-device wake schedule changes. Applied only at midnight session boundary to preserve data integrity.';

COMMENT ON COLUMN site_device_sessions.device_submission_id IS 'Pre-created device submission shell for this site/day. Satisfies petri_observations.submission_id NOT NULL constraint.';
COMMENT ON COLUMN device_wake_payloads.resent_received_at IS 'Timestamp when retried image was received (late fix). Preserves original captured_at.';
COMMENT ON COLUMN device_wake_payloads.overage_flag IS 'True if wake occurred outside expected schedule buckets (accepted but tracked).';
