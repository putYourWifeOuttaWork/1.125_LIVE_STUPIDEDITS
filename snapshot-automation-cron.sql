/*
  # Automated Snapshot Generation System

  ## Overview
  Creates automatic snapshot generation based on each site's snapshot_cadence_hours setting.
  Snapshots capture complete site state including all devices, MGI scores (with LOCF),
  telemetry, zones, and analytics.

  ## Features
  1. Runs every hour via pg_cron
  2. Checks each site's snapshot_cadence_hours
  3. Generates snapshot if enough time has elapsed since last_snapshot_at
  4. Updates last_snapshot_at automatically
  5. Uses LOCF for missing MGI data
  6. Creates comprehensive JSONB snapshot

  ## Schedule
  Runs: Every hour at :00 (0 * * * *)

  ## How to Apply
  1. Copy this entire file
  2. Open Supabase Dashboard → SQL Editor
  3. Paste and Run
  4. Test: SELECT trigger_snapshot_generation();
*/

-- ==========================================
-- STEP 1: Add last_snapshot_at tracking to sites
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'last_snapshot_at'
  ) THEN
    ALTER TABLE sites ADD COLUMN last_snapshot_at TIMESTAMPTZ;
    COMMENT ON COLUMN sites.last_snapshot_at IS 'Last time a snapshot was generated for this site';
  END IF;
END $$;

-- ==========================================
-- STEP 2: Create snapshot generation function
-- ==========================================

CREATE OR REPLACE FUNCTION generate_snapshots_for_all_sites()
RETURNS JSONB AS $$
DECLARE
  v_site RECORD;
  v_session RECORD;
  v_snapshot_result JSONB;
  v_total_generated INT := 0;
  v_total_skipped INT := 0;
  v_results JSONB := '[]'::JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_wake_round_start TIMESTAMPTZ;
  v_wake_round_end TIMESTAMPTZ;
  v_next_wake_number INT;
BEGIN
  RAISE NOTICE '📸 Starting snapshot generation for all sites at %', v_now;

  -- Loop through all active sites with snapshot cadence configured
  FOR v_site IN
    SELECT
      s.site_id,
      s.name,
      s.snapshot_cadence_hours,
      s.last_snapshot_at,
      s.company_id,
      s.program_id
    FROM sites s
    WHERE s.snapshot_cadence_hours > 0
      AND s.snapshot_cadence_hours IS NOT NULL
    ORDER BY s.site_id
  LOOP
    -- Check if enough time has elapsed since last snapshot
    IF v_site.last_snapshot_at IS NULL OR
       (v_now - v_site.last_snapshot_at) >= (v_site.snapshot_cadence_hours || ' hours')::INTERVAL THEN

      -- Find the active session for this site
      SELECT
        sds.session_id,
        sds.site_id,
        sds.start_time,
        sds.status
      INTO v_session
      FROM site_device_sessions sds
      WHERE sds.site_id = v_site.site_id
        AND sds.status = 'active'
      ORDER BY sds.start_time DESC
      LIMIT 1;

      IF v_session.session_id IS NOT NULL THEN
        -- Calculate wake round window (last N hours based on cadence)
        v_wake_round_end := v_now;
        v_wake_round_start := v_now - (v_site.snapshot_cadence_hours || ' hours')::INTERVAL;

        -- Calculate wake number based on hours since session start
        v_next_wake_number := COALESCE(
          EXTRACT(EPOCH FROM (v_now - v_session.start_time))::INT / (v_site.snapshot_cadence_hours * 3600),
          0
        );

        BEGIN
          -- Generate the snapshot
          SELECT generate_session_wake_snapshot(
            v_session.session_id,
            v_next_wake_number,
            v_wake_round_start,
            v_wake_round_end
          ) INTO v_snapshot_result;

          IF v_snapshot_result IS NOT NULL THEN
            -- Update last_snapshot_at
            UPDATE sites
            SET last_snapshot_at = v_now
            WHERE site_id = v_site.site_id;

            v_total_generated := v_total_generated + 1;

            v_results := v_results || jsonb_build_object(
              'site_id', v_site.site_id,
              'site_name', v_site.name,
              'status', 'generated',
              'snapshot_id', v_snapshot_result->>'snapshot_id',
              'wake_number', v_next_wake_number,
              'session_id', v_session.session_id
            );

            RAISE NOTICE '  ✅ Generated snapshot for site: % (wake #%)', v_site.name, v_next_wake_number;
          END IF;

        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING '  ❌ Error generating snapshot for site %: %', v_site.name, SQLERRM;

          v_results := v_results || jsonb_build_object(
            'site_id', v_site.site_id,
            'site_name', v_site.name,
            'status', 'error',
            'error', SQLERRM
          );
        END;
      ELSE
        v_total_skipped := v_total_skipped + 1;
        RAISE NOTICE '  ⚠️  Skipped site % - no active session', v_site.name;

        v_results := v_results || jsonb_build_object(
          'site_id', v_site.site_id,
          'site_name', v_site.name,
          'status', 'skipped',
          'reason', 'no_active_session'
        );
      END IF;
    ELSE
      v_total_skipped := v_total_skipped + 1;
      RAISE NOTICE '  ⏭️  Skipped site % - cadence not elapsed (last: %)',
        v_site.name,
        v_site.last_snapshot_at;

      v_results := v_results || jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'status', 'skipped',
        'reason', 'cadence_not_elapsed',
        'last_snapshot_at', v_site.last_snapshot_at
      );
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Snapshot generation complete - Generated: %, Skipped: %',
    v_total_generated, v_total_skipped;

  RETURN jsonb_build_object(
    'success', true,
    'timestamp', v_now,
    'total_generated', v_total_generated,
    'total_skipped', v_total_skipped,
    'details', v_results
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '❌ Fatal error in snapshot generation: %', SQLERRM;
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_snapshots_for_all_sites() IS
'Automatically generates snapshots for all sites based on their snapshot_cadence_hours setting. Uses LOCF for missing data.';

-- ==========================================
-- STEP 3: Schedule the cron job
-- ==========================================

-- Remove existing job if present
SELECT cron.unschedule('hourly-snapshot-generation') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'hourly-snapshot-generation'
);

-- Schedule to run every hour
SELECT cron.schedule(
  'hourly-snapshot-generation',
  '0 * * * *',
  $$SELECT generate_snapshots_for_all_sites()$$
);

-- ==========================================
-- STEP 4: Create manual trigger function
-- ==========================================

CREATE OR REPLACE FUNCTION trigger_snapshot_generation()
RETURNS JSONB AS $$
BEGIN
  RAISE NOTICE '🚀 Manual snapshot generation triggered';
  RETURN generate_snapshots_for_all_sites();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION trigger_snapshot_generation() IS
'Manually trigger snapshot generation for all eligible sites';

-- ==========================================
-- STEP 5: Grant permissions
-- ==========================================

GRANT EXECUTE ON FUNCTION trigger_snapshot_generation() TO authenticated;

-- ==========================================
-- STEP 6: Success message
-- ==========================================

DO $$
DECLARE
  v_job_count INT;
BEGIN
  SELECT COUNT(*) INTO v_job_count
  FROM cron.job
  WHERE jobname = 'hourly-snapshot-generation';

  IF v_job_count > 0 THEN
    RAISE NOTICE '✅ Snapshot automation configured successfully!';
    RAISE NOTICE '📅 Schedule: Every hour at :00 (0 * * * *)';
    RAISE NOTICE '📸 Sites with cadence configured will generate snapshots automatically';
    RAISE NOTICE '🔍 View jobs: SELECT * FROM get_scheduled_cron_jobs();';
    RAISE NOTICE '🚀 Test now: SELECT trigger_snapshot_generation();';
  ELSE
    RAISE WARNING '⚠️  Cron job was not created - check pg_cron extension';
  END IF;
END $$;
