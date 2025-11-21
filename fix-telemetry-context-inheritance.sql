/*
  # Fix Telemetry Context Inheritance

  ## Problem
  Device telemetry records are being created with NULL values for:
  - program_id
  - site_id
  - site_device_session_id

  This breaks session tracking, snapshots, and analytics.

  ## Solution
  1. Create helper function to get active session for a site
  2. Edge function will use this + lineage data to populate all FKEYs

  ## Changes
  - Add fn_get_active_session_for_site() helper
  - Returns NULL if no active session (safe for INSERT)
*/

-- ==========================================
-- HELPER: GET ACTIVE SESSION FOR SITE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_active_session_for_site(p_site_id UUID)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Find the most recent active session for this site
  SELECT session_id
  INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = p_site_id
    AND status IN ('active', 'in_progress')
  ORDER BY session_start_time DESC
  LIMIT 1;

  RETURN v_session_id;  -- Returns NULL if no active session

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_get_active_session_for_site error for site %: %', p_site_id, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to service role (used by edge functions)
GRANT EXECUTE ON FUNCTION fn_get_active_session_for_site(UUID) TO service_role, authenticated;

COMMENT ON FUNCTION fn_get_active_session_for_site(UUID) IS
'Get the currently active session for a site. Returns NULL if no active session exists. Used by edge function to populate site_device_session_id when ingesting telemetry.';

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '✅ Telemetry context inheritance helper created';
  RAISE NOTICE '📋 Next step: Update edge function mqtt_device_handler/ingest.ts';
  RAISE NOTICE '   - Modify handleTelemetryOnly() to call fn_get_active_session_for_site()';
  RAISE NOTICE '   - Populate program_id, site_id, site_device_session_id from lineage';
  RAISE NOTICE '   - Also fix handleHelloStatus() telemetry insert';
END $$;
