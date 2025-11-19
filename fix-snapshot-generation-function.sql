-- Fix generate_scheduled_snapshots function to use correct column names

CREATE OR REPLACE FUNCTION generate_scheduled_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site record;
  v_session_id uuid;
  v_snapshot_id uuid;
  v_generated_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_current_time timestamptz := now();
  v_device_count integer;
  v_wake_number integer;
  v_hour_of_day numeric;
  v_hours_per_wake numeric;
BEGIN
  FOR v_site IN
    SELECT DISTINCT s.site_id, s.name, s.snapshot_cadence_per_day, s.timezone, s.company_id, s.program_id
    FROM sites s
    INNER JOIN devices d ON d.site_id = s.site_id
    WHERE d.is_active = true
    AND d.provisioning_status IN ('mapped', 'active')
    AND s.snapshot_cadence_per_day IS NOT NULL
  LOOP
    BEGIN
      IF NOT is_snapshot_due(v_site.site_id, v_current_time) THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      SELECT COUNT(*)
      INTO v_device_count
      FROM devices
      WHERE site_id = v_site.site_id
      AND is_active = true
      AND provisioning_status IN ('mapped', 'active');

      IF v_device_count = 0 THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      SELECT session_id
      INTO v_session_id
      FROM site_device_sessions
      WHERE site_id = v_site.site_id
      AND session_date = COALESCE((v_current_time AT TIME ZONE v_site.timezone)::date, CURRENT_DATE)
      LIMIT 1;

      IF v_session_id IS NULL THEN
        INSERT INTO site_device_sessions (
          company_id,
          program_id,
          site_id,
          session_date,
          session_start_time,
          session_end_time,
          expected_wake_count,
          status
        ) VALUES (
          v_site.company_id,
          v_site.program_id,
          v_site.site_id,
          COALESCE((v_current_time AT TIME ZONE v_site.timezone)::date, CURRENT_DATE),
          date_trunc('day', COALESCE(v_current_time AT TIME ZONE v_site.timezone, v_current_time)),
          date_trunc('day', COALESCE(v_current_time AT TIME ZONE v_site.timezone, v_current_time)) + interval '1 day' - interval '1 second',
          v_site.snapshot_cadence_per_day,
          'in_progress'
        )
        RETURNING session_id INTO v_session_id;
      END IF;

      v_hour_of_day := EXTRACT(HOUR FROM COALESCE(v_current_time AT TIME ZONE v_site.timezone, v_current_time));
      v_hours_per_wake := 24.0 / v_site.snapshot_cadence_per_day;
      v_wake_number := FLOOR(v_hour_of_day / v_hours_per_wake) + 1;

      v_snapshot_id := generate_session_wake_snapshot(
        v_session_id,
        v_wake_number,
        v_current_time - interval '5 minutes',
        v_current_time
      );

      v_generated_count := v_generated_count + 1;

      v_results := v_results || jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'session_id', v_session_id,
        'snapshot_id', v_snapshot_id,
        'wake_number', v_wake_number,
        'status', 'success'
      );

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;

      v_results := v_results || jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'status', 'error',
        'error_message', SQLERRM
      );

      INSERT INTO async_error_logs (
        table_name,
        trigger_name,
        function_name,
        error_message,
        error_details,
        payload
      ) VALUES (
        'session_wake_snapshots',
        'scheduled_snapshot_generation',
        'generate_scheduled_snapshots',
        SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE),
        jsonb_build_object('site_id', v_site.site_id, 'site_name', v_site.name)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'timestamp', v_current_time,
    'generated', v_generated_count,
    'skipped', v_skipped_count,
    'errors', v_error_count,
    'results', v_results
  );
END;
$$;
