/*
  # System User Setup

  1. Purpose
    - Create a system user for tracking automated updates
    - Distinguish between user-initiated changes and system updates
    - Enable proper audit trails

  2. System User
    - UUID: 00000000-0000-0000-0000-000000000001
    - Email: system@brainlytree.internal
    - Role: system (for tracking purposes)
    - Used for: device auto-provisioning, telemetry updates, wake calculations

  3. Usage
    - User-initiated changes: set last_updated_by_user_id to actual user UUID
    - System automated updates: set last_updated_by_user_id to system UUID
    - Legacy/unknown updates: leave as NULL

  4. Examples
    - Device sends HELLO → battery_voltage updated → system user
    - User changes wake schedule → wake_schedule_cron updated → user UUID
    - Device auto-provisions → device created → system user
*/

-- ==========================================
-- CREATE SYSTEM USER
-- ==========================================

-- Note: In production Supabase, we cannot directly insert into auth.users
-- This is a placeholder for the system user concept
-- In practice, create a record in a custom system_users table

-- Create a system_users table to track system-level actors
CREATE TABLE IF NOT EXISTS system_users (
  system_user_id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  system_name TEXT NOT NULL DEFAULT 'System',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the system user
INSERT INTO system_users (system_user_id, system_name, description)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'System',
  'Automated system updates: device auto-provisioning, telemetry ingestion, wake time calculations'
)
ON CONFLICT (system_user_id) DO UPDATE
SET description = EXCLUDED.description;

COMMENT ON TABLE system_users IS
'System-level users for tracking automated updates.
Used in last_updated_by_user_id when system (not human user) makes changes.';

-- ==========================================
-- HELPER FUNCTION: GET SYSTEM USER UUID
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_system_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_get_system_user_id IS
'Returns the system user UUID for automated updates.
Use this in edge functions when system (not user) makes changes.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION fn_get_system_user_id TO service_role;
GRANT EXECUTE ON FUNCTION fn_get_system_user_id TO authenticated;

-- ==========================================
-- UPDATE COLUMN COMMENTS
-- ==========================================

COMMENT ON COLUMN devices.last_updated_by_user_id IS
'User or system actor who last modified device settings.

Values:
  - NULL: Legacy data or unknown source
  - 00000000-0000-0000-0000-000000000001: System automated updates
    (device HELLO, telemetry, wake calculations, auto-provisioning)
  - Actual user UUID: User-initiated changes via UI or API
    (manual wake schedule changes, device renaming, settings updates)

Examples:
  - Device sends HELLO with battery voltage → System UUID
  - User changes wake schedule in UI → User UUID
  - Device auto-provisions itself → System UUID
  - User renames device → User UUID';

-- ==========================================
-- BACKFILL: SET SYSTEM USER FOR AUTOMATED DEVICES
-- ==========================================

-- Any device with auto-provisioning notes should be marked as system-created
UPDATE devices
SET last_updated_by_user_id = '00000000-0000-0000-0000-000000000001'
WHERE last_updated_by_user_id IS NULL
  AND (
    notes LIKE '%Auto-provisioned%'
    OR notes LIKE '%system%'
    OR provisioning_status = 'pending_mapping'
  );

-- Log results
DO $$
DECLARE
  v_updated_count INT;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Set system user for % auto-provisioned devices', v_updated_count;
END $$;
