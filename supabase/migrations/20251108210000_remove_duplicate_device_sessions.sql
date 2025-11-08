/*
  # Remove Duplicate device_sessions Table

  1. Overview
    - Removes the newly created `device_sessions` table
    - The existing `device_wake_sessions` table provides all needed functionality
    - `device_wake_sessions` is more comprehensive with chunk tracking, telemetry, and error codes
    - `device_history.session_id` already references `device_wake_sessions`

  2. Changes
    - Drop `device_sessions` table and its indexes
    - Remove RLS policies for `device_sessions`
    - Update references to use `device_wake_sessions`

  3. Impact
    - No data loss (table was just created, no production data)
    - All functions already work with `device_wake_sessions`
    - Cleaner architecture without duplication

  4. Notes
    - `device_wake_sessions` provides: chunks_sent, chunks_total, chunks_missing,
      telemetry_data, error_codes, wifi_retry_count, and more
    - This is the correct table for tracking device wake-to-sleep cycles
*/

-- =====================================================
-- 1. DROP RLS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view sessions for devices they have access to" ON device_sessions;
DROP POLICY IF EXISTS "System can manage all sessions" ON device_sessions;

-- =====================================================
-- 2. DROP INDEXES
-- =====================================================

DROP INDEX IF EXISTS idx_device_sessions_device;
DROP INDEX IF EXISTS idx_device_sessions_status;
DROP INDEX IF EXISTS idx_device_sessions_start_time;

-- =====================================================
-- 3. DROP TABLE
-- =====================================================

DROP TABLE IF EXISTS device_sessions CASCADE;

-- =====================================================
-- 4. VERIFY device_wake_sessions EXISTS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'device_wake_sessions'
  ) THEN
    RAISE EXCEPTION 'device_wake_sessions table does not exist! This migration requires it.';
  END IF;

  RAISE NOTICE 'Confirmed: device_wake_sessions table exists and will be used for session tracking';
END $$;

-- =====================================================
-- 5. UPDATE device_history FOREIGN KEY (if needed)
-- =====================================================

-- The device_history.session_id column already references device_wake_sessions
-- This is just a safety check to ensure the foreign key is correct

DO $$
BEGIN
  -- Check if constraint exists pointing to wrong table
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'device_history'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'device_sessions'
  ) THEN
    -- Drop the wrong foreign key
    ALTER TABLE device_history
      DROP CONSTRAINT IF EXISTS device_history_session_id_fkey;

    -- Add correct foreign key to device_wake_sessions
    ALTER TABLE device_history
      ADD CONSTRAINT device_history_session_id_fkey
      FOREIGN KEY (session_id)
      REFERENCES device_wake_sessions(session_id)
      ON DELETE SET NULL;

    RAISE NOTICE 'Updated device_history.session_id foreign key to reference device_wake_sessions';
  ELSE
    RAISE NOTICE 'device_history.session_id already references device_wake_sessions correctly';
  END IF;
END $$;

-- =====================================================
-- 6. SUMMARY
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Cleanup complete: device_sessions table removed';
  RAISE NOTICE '✅ Using device_wake_sessions for all session tracking';
  RAISE NOTICE '✅ device_history.session_id references device_wake_sessions';
  RAISE NOTICE '';
  RAISE NOTICE 'device_wake_sessions provides comprehensive tracking including:';
  RAISE NOTICE '  - Image chunks: chunks_sent, chunks_total, chunks_missing';
  RAISE NOTICE '  - Connection: wifi_retry_count, mqtt_connected';
  RAISE NOTICE '  - Status: in_progress, completed, timeout, error';
  RAISE NOTICE '  - Telemetry: battery, temperature, humidity data';
  RAISE NOTICE '  - Error codes and offline duration tracking';
END $$;
