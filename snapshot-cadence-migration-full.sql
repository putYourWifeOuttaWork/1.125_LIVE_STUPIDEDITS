/*
  Snapshot Cadence System

  Adds configurable snapshot generation for sites with automatic scheduling.

  Apply this in Supabase Dashboard > SQL Editor
*/

-- =====================================================
-- STEP 1: Add snapshot_cadence_per_day to sites
-- =====================================================

ALTER TABLE public.sites
ADD COLUMN IF NOT EXISTS snapshot_cadence_per_day integer NOT NULL DEFAULT 3
CHECK (snapshot_cadence_per_day IN (1, 3, 6, 12, 24));

COMMENT ON COLUMN public.sites.snapshot_cadence_per_day IS 'Number of snapshots to generate per day (1, 3, 6, 12, or 24). Determines how often site state is captured for analytics.';

-- =====================================================
-- STEP 2: Calculate Next Snapshot Time
-- =====================================================

CREATE OR REPLACE FUNCTION get_next_snapshot_time(
  p_site_id uuid,
  p_current_time timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cadence integer;
  v_timezone text;
  v_site_midnight timestamptz;
  v_interval_hours numeric;
  v_snapshot_times timestamptz[];
  v_next_time timestamptz;
BEGIN
  SELECT snapshot_cadence_per_day, timezone
  INTO v_cadence, v_timezone
  FROM sites
  WHERE site_id = p_site_id;

  IF v_cadence IS NULL THEN
    RAISE EXCEPTION 'Site not found: %', p_site_id;
  END IF;

  v_interval_hours := 24.0 / v_cadence;
  v_site_midnight := date_trunc('day', p_current_time AT TIME ZONE v_timezone) AT TIME ZONE v_timezone;

  FOR i IN 0..(v_cadence - 1) LOOP
    v_snapshot_times := array_append(
      v_snapshot_times,
      v_site_midnight + (i * v_interval_hours || ' hours')::interval
    );
  END LOOP;

  SELECT MIN(snapshot_time)
  INTO v_next_time
  FROM unnest(v_snapshot_times) AS snapshot_time
  WHERE snapshot_time > p_current_time;

  IF v_next_time IS NULL THEN
    v_next_time := v_site_midnight + '1 day'::interval;
  END IF;

  RETURN v_next_time;
END;
$$;

COMMENT ON FUNCTION get_next_snapshot_time IS 'Calculate next scheduled snapshot time for a site based on its cadence and timezone.';

-- =====================================================
-- STEP 3: Check if Snapshot is Due
-- =====================================================

CREATE OR REPLACE FUNCTION is_snapshot_due(
  p_site_id uuid,
  p_current_time timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cadence integer;
  v_timezone text;
  v_last_snapshot_time timestamptz;
  v_interval_hours numeric;
  v_time_since_last numeric;
BEGIN
  SELECT snapshot_cadence_per_day, timezone
  INTO v_cadence, v_timezone
  FROM sites
  WHERE site_id = p_site_id;

  IF v_cadence IS NULL THEN
    RETURN FALSE;
  END IF;

  v_interval_hours := 24.0 / v_cadence;

  SELECT MAX(wake_round_start)
  INTO v_last_snapshot_time
  FROM session_wake_snapshots
  WHERE site_id = p_site_id;

  IF v_last_snapshot_time IS NULL THEN
    RETURN TRUE;
  END IF;

  v_time_since_last := EXTRACT(EPOCH FROM (p_current_time - v_last_snapshot_time)) / 3600;

  RETURN v_time_since_last >= v_interval_hours;
END;
$$;

COMMENT ON FUNCTION is_snapshot_due IS 'Check if a snapshot is due for a site based on cadence and last snapshot time.';

-- =====================================================
-- STEP 4: Generate Snapshots for Active Sites
-- =====================================================

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
    WHERE d.status IN ('active', 'online', 'offline')
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
      AND status IN ('active', 'online', 'offline');

      IF v_device_count = 0 THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      SELECT session_id
      INTO v_session_id
      FROM site_device_sessions
      WHERE site_id = v_site.site_id
      AND session_date = (v_current_time AT TIME ZONE v_site.timezone)::date
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
          (v_current_time AT TIME ZONE v_site.timezone)::date,
          date_trunc('day', v_current_time AT TIME ZONE v_site.timezone) AT TIME ZONE v_site.timezone,
          date_trunc('day', v_current_time AT TIME ZONE v_site.timezone) AT TIME ZONE v_site.timezone + interval '1 day' - interval '1 second',
          v_site.snapshot_cadence_per_day,
          'in_progress'
        )
        RETURNING session_id INTO v_session_id;
      END IF;

      v_hour_of_day := EXTRACT(HOUR FROM v_current_time AT TIME ZONE v_site.timezone);
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

COMMENT ON FUNCTION generate_scheduled_snapshots IS 'Generate snapshots for all active sites where snapshots are due based on their cadence. Called by pg_cron hourly.';

-- =====================================================
-- STEP 5: Grant Permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION get_next_snapshot_time TO authenticated;
GRANT EXECUTE ON FUNCTION is_snapshot_due TO authenticated;
GRANT EXECUTE ON FUNCTION generate_scheduled_snapshots TO authenticated;

-- =====================================================
-- STEP 6: Add Index for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_session_wake_snapshots_site_latest
ON session_wake_snapshots(site_id, wake_round_start DESC);

-- =====================================================
-- STEP 7: Test the Functions
-- =====================================================

-- Test: Check if any site needs a snapshot
SELECT site_id, name, snapshot_cadence_per_day,
       is_snapshot_due(site_id) as needs_snapshot,
       get_next_snapshot_time(site_id) as next_snapshot
FROM sites
WHERE snapshot_cadence_per_day IS NOT NULL
LIMIT 5;

-- Ready to schedule with pg_cron!
-- Run this after enabling pg_cron extension:
-- SELECT cron.schedule('generate-site-snapshots', '0 * * * *', $$SELECT generate_scheduled_snapshots();$$);
