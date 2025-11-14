/*
  Backfill Sessions for Nov 13, 2025

  This manually creates sessions for all active sites for Nov 13
  by directly calling fn_get_or_create_device_submission for each site.
*/

-- Create sessions for Nov 13 for all active sites
DO $$
DECLARE
  v_site RECORD;
  v_submission_id UUID;
  v_session_id UUID;
  v_success_count INT := 0;
  v_error_count INT := 0;
BEGIN
  -- Loop through all sites with active programs
  FOR v_site IN
    SELECT s.site_id, s.name, s.program_id
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status = 'active'
  LOOP
    BEGIN
      -- Check if session already exists
      SELECT session_id INTO v_session_id
      FROM device_site_sessions
      WHERE site_id = v_site.site_id
        AND session_date = '2025-11-13';

      IF v_session_id IS NOT NULL THEN
        RAISE NOTICE 'Site % (%) - Session already exists: %',
          v_site.name, v_site.site_id, v_session_id;
        v_success_count := v_success_count + 1;
        CONTINUE;
      END IF;

      -- Create device submission and session
      v_submission_id := fn_get_or_create_device_submission(
        v_site.site_id,
        '2025-11-13'::DATE
      );

      -- Create device_site_session
      INSERT INTO device_site_sessions (
        site_id,
        session_date,
        device_submission_id,
        config_changed,
        expected_wake_count
      ) VALUES (
        v_site.site_id,
        '2025-11-13',
        v_submission_id,
        false,
        0
      )
      RETURNING session_id INTO v_session_id;

      RAISE NOTICE 'Site % (%) - Created session: %',
        v_site.name, v_site.site_id, v_session_id;
      v_success_count := v_success_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Site % (%) - ERROR: %',
        v_site.name, v_site.site_id, SQLERRM;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'BACKFILL COMPLETE';
  RAISE NOTICE 'Success: %, Errors: %', v_success_count, v_error_count;
  RAISE NOTICE '========================================';
END;
$$;

-- Verify the backfill
SELECT
  COUNT(*) as sessions_created,
  session_date
FROM device_site_sessions
WHERE session_date = '2025-11-13'
GROUP BY session_date;
