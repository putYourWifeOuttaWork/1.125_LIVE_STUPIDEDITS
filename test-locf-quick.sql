-- Quick LOCF Test Script
-- Run this after sending telemetry via MQTT to verify LOCF is working

-- =============================================================================
-- STEP 1: Set your IDs here
-- =============================================================================
\set YOUR_SESSION_ID 'paste-your-session-uuid-here'
\set YOUR_DEVICE_ID 'paste-your-device-uuid-here'

-- =============================================================================
-- STEP 2: Check if you have historical telemetry data
-- =============================================================================
SELECT 
  '=== Historical Telemetry Data ===' as step,
  device_id,
  temperature,
  humidity,
  captured_at,
  NOW() - captured_at as age
FROM device_telemetry
WHERE device_id = :'YOUR_DEVICE_ID'
ORDER BY captured_at DESC
LIMIT 5;

-- =============================================================================
-- STEP 3: Generate snapshot for a time window AFTER your last telemetry
-- This simulates a missed wake
-- =============================================================================
-- Example: If your last telemetry was at 09:00, generate snapshot for 12:00
SELECT 
  '=== Generating LOCF Snapshot ===' as step,
  generate_session_wake_snapshot(
    :'YOUR_SESSION_ID'::uuid,
    999, -- wake number (use high number to avoid conflicts)
    NOW() - INTERVAL '30 minutes', -- 30 minutes ago
    NOW() - INTERVAL '15 minutes'  -- 15 minutes ago (no data in this window)
  ) as snapshot_id;

-- =============================================================================
-- STEP 4: Verify LOCF activated
-- =============================================================================
SELECT 
  '=== LOCF Verification ===' as step,
  wake_number,
  wake_round_start,
  wake_round_end,
  -- Extract telemetry from site_state
  jsonb_pretty(site_state->'device_data'->0->'telemetry') as telemetry_data,
  -- Check LOCF flags
  site_state->'device_data'->0->'telemetry'->>'is_current' as is_current,
  site_state->'device_data'->0->'telemetry'->>'data_freshness' as freshness,
  site_state->'device_data'->0->'telemetry'->>'hours_since_last' as hours_since,
  -- Check values
  site_state->'device_data'->0->'telemetry'->>'temperature' as temp,
  site_state->'device_data'->0->'telemetry'->>'humidity' as humidity
FROM session_wake_snapshots
WHERE session_id = :'YOUR_SESSION_ID'
  AND wake_number = 999
ORDER BY created_at DESC
LIMIT 1;

-- =============================================================================
-- SUCCESS CHECK
-- =============================================================================
-- Look for:
-- ✅ is_current = "false"
-- ✅ data_freshness = "carried_forward"
-- ✅ hours_since_last shows a positive number
-- ✅ temperature and humidity match your historical data
-- ✅ telemetry is NOT null

-- If telemetry is NULL, LOCF did not activate (check Prerequisites)
