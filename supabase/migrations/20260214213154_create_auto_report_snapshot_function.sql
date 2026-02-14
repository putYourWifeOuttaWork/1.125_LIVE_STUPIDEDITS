/*
  # Auto-generate report snapshots on schedule

  1. New Functions
    - `resolve_report_time_range` - resolves relative time ranges (last_24h, last_7d, etc.)
      to concrete start/end timestamps
    - `generate_scheduled_report_snapshots` - main cron function that checks all
      enabled schedules, determines which are due, fetches analytics data, and creates
      snapshots automatically

  2. Cron Job
    - Runs every 15 minutes to check for due schedules
    - Provides ~15 minute precision on scheduled snapshot times

  3. Important Notes
    - The analytics query is inlined (not via get_analytics_time_series RPC) because
      the RPC checks auth.uid() which is NULL in cron context
    - Uses SECURITY DEFINER to access tables directly
    - Logs errors to async_error_logs following existing patterns
    - Cadence calculation: daily=1 day, every_other_day=2 days, weekly=7, biweekly=14, monthly=30
*/

CREATE OR REPLACE FUNCTION resolve_report_time_range(
  p_time_range text,
  p_custom_start text DEFAULT NULL,
  p_custom_end text DEFAULT NULL,
  p_ref_time timestamptz DEFAULT now()
)
RETURNS TABLE(time_start timestamptz, time_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CASE p_time_range
    WHEN 'last_24h' THEN
      RETURN QUERY SELECT p_ref_time - interval '24 hours', p_ref_time;
    WHEN 'last_7d' THEN
      RETURN QUERY SELECT p_ref_time - interval '7 days', p_ref_time;
    WHEN 'last_30d' THEN
      RETURN QUERY SELECT p_ref_time - interval '30 days', p_ref_time;
    WHEN 'this_program' THEN
      RETURN QUERY SELECT p_ref_time - interval '90 days', p_ref_time;
    WHEN 'custom' THEN
      RETURN QUERY SELECT
        COALESCE(p_custom_start::timestamptz, p_ref_time - interval '30 days'),
        COALESCE(p_custom_end::timestamptz, p_ref_time);
    ELSE
      RETURN QUERY SELECT p_ref_time - interval '7 days', p_ref_time;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION generate_scheduled_report_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule record;
  v_report record;
  v_current_time timestamptz := now();
  v_schedule_local_time time;
  v_cadence_interval interval;
  v_time_start timestamptz;
  v_time_end timestamptz;
  v_config jsonb;
  v_time_range text;
  v_interval_text text;
  v_metrics text[];
  v_program_ids uuid[];
  v_site_ids uuid[];
  v_device_ids uuid[];
  v_data_rows jsonb;
  v_interval_seconds numeric;
  v_snapshot_name text;
  v_generated_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_schedule IN
    SELECT rss.*, cr.configuration, cr.name AS report_name
    FROM report_snapshot_schedules rss
    JOIN custom_reports cr ON cr.report_id = rss.report_id
    WHERE rss.enabled = true
  LOOP
    BEGIN
      v_schedule_local_time := (v_current_time AT TIME ZONE v_schedule.timezone)::time;

      IF v_schedule_local_time < v_schedule.snapshot_time THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      CASE v_schedule.cadence
        WHEN 'daily' THEN v_cadence_interval := interval '1 day';
        WHEN 'every_other_day' THEN v_cadence_interval := interval '2 days';
        WHEN 'weekly' THEN v_cadence_interval := interval '7 days';
        WHEN 'biweekly' THEN v_cadence_interval := interval '14 days';
        WHEN 'monthly' THEN v_cadence_interval := interval '30 days';
        ELSE v_cadence_interval := interval '1 day';
      END CASE;

      IF v_schedule.last_run_at IS NOT NULL THEN
        IF (v_current_time - v_schedule.last_run_at) < v_cadence_interval THEN
          v_skipped_count := v_skipped_count + 1;
          CONTINUE;
        END IF;

        IF (v_schedule.last_run_at AT TIME ZONE v_schedule.timezone)::date
           = (v_current_time AT TIME ZONE v_schedule.timezone)::date THEN
          v_skipped_count := v_skipped_count + 1;
          CONTINUE;
        END IF;
      END IF;

      v_config := v_schedule.configuration;
      v_time_range := COALESCE(v_config->>'timeRange', 'last_7d');
      v_interval_text := COALESCE(v_config->>'timeGranularity', '1 hour');

      CASE v_interval_text
        WHEN '15min' THEN v_interval_text := '15 minutes';
        WHEN '30min' THEN v_interval_text := '30 minutes';
        WHEN 'hour'  THEN v_interval_text := '1 hour';
        WHEN 'day'   THEN v_interval_text := '1 day';
        WHEN 'week'  THEN v_interval_text := '1 week';
        ELSE v_interval_text := '1 hour';
      END CASE;

      SELECT tr.time_start, tr.time_end
      INTO v_time_start, v_time_end
      FROM resolve_report_time_range(
        v_time_range,
        v_config->>'customStartDate',
        v_config->>'customEndDate',
        v_current_time
      ) tr;

      IF v_config->'metrics' IS NOT NULL AND jsonb_array_length(v_config->'metrics') > 0 THEN
        SELECT array_agg(m::text)
        INTO v_metrics
        FROM jsonb_array_elements_text(v_config->'metrics') m;
      ELSE
        v_metrics := ARRAY['mgi_score','temperature','humidity'];
      END IF;

      IF v_config->'programIds' IS NOT NULL AND jsonb_array_length(v_config->'programIds') > 0 THEN
        SELECT array_agg(p::text::uuid)
        INTO v_program_ids
        FROM jsonb_array_elements_text(v_config->'programIds') p;
      ELSE
        v_program_ids := NULL;
      END IF;

      IF v_config->'siteIds' IS NOT NULL AND jsonb_array_length(v_config->'siteIds') > 0 THEN
        SELECT array_agg(s::text::uuid)
        INTO v_site_ids
        FROM jsonb_array_elements_text(v_config->'siteIds') s;
      ELSE
        v_site_ids := NULL;
      END IF;

      IF v_config->'deviceIds' IS NOT NULL AND jsonb_array_length(v_config->'deviceIds') > 0 THEN
        SELECT array_agg(d::text::uuid)
        INTO v_device_ids
        FROM jsonb_array_elements_text(v_config->'deviceIds') d;
      ELSE
        v_device_ids := NULL;
      END IF;

      v_interval_seconds := extract(epoch FROM v_interval_text::interval);

      SELECT jsonb_agg(row_to_json(t))
      INTO v_data_rows
      FROM (
        SELECT
          to_timestamp(
            floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
          ) AS timestamp_bucket,
          m.metric_name,
          AVG(
            CASE m.metric_name
              WHEN 'mgi_score'       THEN di.mgi_score
              WHEN 'temperature'     THEN di.temperature
              WHEN 'humidity'        THEN di.humidity
              WHEN 'battery_voltage' THEN di.battery_voltage
              WHEN 'mgi_velocity'    THEN di.mgi_velocity
              WHEN 'mgi_speed'       THEN di.mgi_speed
            END
          ) AS metric_value,
          di.device_id,
          d.device_code::text,
          d.site_id,
          s.name::text AS site_name,
          s.program_id,
          pp.name::text AS program_name
        FROM device_images di
        JOIN devices d ON d.device_id = di.device_id
        JOIN sites s ON s.site_id = d.site_id
        JOIN pilot_programs pp ON pp.program_id = s.program_id
        CROSS JOIN LATERAL unnest(v_metrics) AS m(metric_name)
        WHERE di.company_id = v_schedule.company_id
          AND di.captured_at BETWEEN v_time_start AND v_time_end
          AND di.status = 'complete'
          AND (v_program_ids IS NULL OR s.program_id = ANY(v_program_ids))
          AND (v_site_ids IS NULL OR d.site_id = ANY(v_site_ids))
          AND (v_device_ids IS NULL OR di.device_id = ANY(v_device_ids))
        GROUP BY
          to_timestamp(
            floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
          ),
          m.metric_name,
          di.device_id,
          d.device_code,
          d.site_id,
          s.name,
          s.program_id,
          pp.name
        ORDER BY timestamp_bucket, m.metric_name, d.device_code
      ) t;

      v_snapshot_name := 'Auto - ' || to_char(
        v_current_time AT TIME ZONE v_schedule.timezone,
        'Mon DD, YYYY HH12:MI AM'
      );

      INSERT INTO report_snapshots (
        report_id,
        company_id,
        created_by_user_id,
        snapshot_name,
        description,
        data_snapshot,
        configuration_snapshot
      ) VALUES (
        v_schedule.report_id,
        v_schedule.company_id,
        v_schedule.created_by_user_id,
        v_snapshot_name,
        'Automated snapshot (' || v_schedule.cadence || ')',
        jsonb_build_object(
          'timeSeries', COALESCE(v_data_rows, '[]'::jsonb),
          'dateRange', jsonb_build_object(
            'start', v_time_start,
            'end', v_time_end
          )
        ),
        v_config
      );

      UPDATE report_snapshot_schedules
      SET last_run_at = v_current_time, updated_at = v_current_time
      WHERE schedule_id = v_schedule.schedule_id;

      v_generated_count := v_generated_count + 1;
      v_results := v_results || jsonb_build_object(
        'report_id', v_schedule.report_id,
        'report_name', v_schedule.report_name,
        'snapshot_name', v_snapshot_name,
        'status', 'success'
      );

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results := v_results || jsonb_build_object(
        'report_id', v_schedule.report_id,
        'report_name', v_schedule.report_name,
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
        'report_snapshot_schedules',
        'scheduled_report_snapshot',
        'generate_scheduled_report_snapshots',
        SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE),
        jsonb_build_object(
          'schedule_id', v_schedule.schedule_id,
          'report_id', v_schedule.report_id
        )
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

SELECT cron.schedule(
  'generate-report-snapshots',
  '*/15 * * * *',
  $$SELECT generate_scheduled_report_snapshots()$$
);
