/*
  # Disable Legacy Device Wake Sessions Writes - Phase 2.5

  1. Purpose
    - Make device_wake_sessions table read-only
    - Prevent accidental writes to legacy table
    - Preserve historical data for legacy views

  2. Changes
    - Drop any triggers that write to device_wake_sessions
    - Add comment marking table as legacy/read-only
    - Document migration path to device_wake_payloads

  3. Data Preservation
    - DO NOT drop the table (preserves historical data)
    - Keep existing RLS policies (for historical reads)
    - Maintain foreign key relationships
*/

-- ==========================================
-- IDENTIFY AND DROP WRITE TRIGGERS
-- ==========================================

DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  -- Find all triggers on device_wake_sessions
  FOR trigger_record IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'device_wake_sessions'::regclass
      AND tgname NOT LIKE 'RI_%' -- Skip foreign key triggers
      AND tgname NOT LIKE 'pg_%'  -- Skip system triggers
  LOOP
    -- Drop trigger
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON device_wake_sessions CASCADE', trigger_record.tgname);
    RAISE NOTICE 'Dropped trigger: %', trigger_record.tgname;
  END LOOP;

  -- Log summary
  IF NOT FOUND THEN
    RAISE NOTICE 'No custom triggers found on device_wake_sessions';
  END IF;
END $$;

-- ==========================================
-- MARK TABLE AS LEGACY
-- ==========================================

COMMENT ON TABLE device_wake_sessions IS 'LEGACY: Superseded by device_wake_payloads (see migration 20251110000000). Read-only for historical views. DO NOT write new records to this table. All new device wake data should use device_wake_payloads as the authoritative source.';

-- ==========================================
-- CREATE MIGRATION GUIDANCE VIEW
-- ==========================================

-- Create a helpful view for querying both old and new systems during transition
CREATE OR REPLACE VIEW v_device_wake_history AS
SELECT
  'legacy' AS source,
  dws.session_id AS wake_id,
  dws.device_id,
  dws.session_date AS captured_date,
  dws.created_at AS captured_at,
  NULL::UUID AS site_device_session_id,
  NULL::INT AS wake_window_index,
  NULL::BOOLEAN AS overage_flag,
  dws.image_id,
  NULL::JSONB AS telemetry_data,
  NULL::TEXT AS image_status,
  NULL::TEXT AS payload_status
FROM device_wake_sessions dws

UNION ALL

SELECT
  'current' AS source,
  dwp.payload_id AS wake_id,
  dwp.device_id,
  DATE(dwp.captured_at) AS captured_date,
  dwp.captured_at,
  dwp.site_device_session_id,
  dwp.wake_window_index,
  dwp.overage_flag,
  dwp.image_id,
  dwp.telemetry_data,
  dwp.image_status,
  dwp.payload_status
FROM device_wake_payloads dwp

ORDER BY captured_at DESC;

COMMENT ON VIEW v_device_wake_history IS 'Combined view of legacy device_wake_sessions and current device_wake_payloads. Use source column to distinguish. Filter by source=''current'' for new system data only.';

-- Grant SELECT on view
GRANT SELECT ON v_device_wake_history TO authenticated, service_role;

-- ==========================================
-- ADD DOCUMENTATION
-- ==========================================

-- Document the migration path for developers
DO $$
BEGIN
  RAISE NOTICE '
================================================================================
LEGACY TABLE MIGRATION COMPLETE
================================================================================

device_wake_sessions table is now READ-ONLY.

MIGRATION PATH:
  Old: device_wake_sessions (session-based, coarse-grained)
  New: device_wake_payloads (wake-based, fine-grained with full lineage)

KEY DIFFERENCES:
  1. device_wake_payloads has full lineage: company_id, program_id, site_id
  2. device_wake_payloads has per-wake telemetry snapshot
  3. device_wake_payloads links to site_device_sessions (daily container)
  4. device_wake_payloads supports overage tracking

HOW TO QUERY NEW SYSTEM:
  -- Get all wakes for a device on a specific date
  SELECT * FROM device_wake_payloads
  WHERE device_id = ''...''
    AND DATE(captured_at) = ''2025-11-10'';

  -- Get all wakes for a site session
  SELECT * FROM device_wake_payloads
  WHERE site_device_session_id = ''...'';

  -- Combined legacy + current view
  SELECT * FROM v_device_wake_history
  WHERE device_id = ''...''
  ORDER BY captured_at DESC;

DO NOT:
  - Insert into device_wake_sessions
  - Update device_wake_sessions
  - Create new triggers on device_wake_sessions

HISTORICAL DATA:
  - All existing device_wake_sessions records preserved
  - Available via SELECT queries
  - Use v_device_wake_history view for combined queries

================================================================================
  ';
END $$;
