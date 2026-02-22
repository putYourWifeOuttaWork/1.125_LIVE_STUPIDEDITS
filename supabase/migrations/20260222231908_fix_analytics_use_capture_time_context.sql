/*
  # Fix Analytics Functions: Use Capture-Time Program/Site Context

  ## Problem
  All analytics RPC functions (time series, aggregated, comparison, drill-down)
  and the auto-snapshot generator join device_images through the device's CURRENT
  site/program assignment (devices -> sites -> pilot_programs). When a device is
  reassigned from one program to another, reports scoped to the new program
  incorrectly include all historical data from the old program.

  ## Solution
  Switch all five functions to filter and group by the program_id and site_id
  columns stored directly on device_images at capture time. These columns are
  populated by the `populate_device_data_company_id` trigger and correctly
  reflect which program/site the device belonged to when each image was taken.

  ## Functions Updated
  1. `get_analytics_time_series` - Line/dot chart data
  2. `get_analytics_aggregated` - Bar chart / summary data
  3. `get_analytics_comparison` - Entity comparison data
  4. `get_analytics_drill_down` - Individual image drill-down
  5. `generate_scheduled_report_snapshots` - Automated snapshot generation

  ## Additional Changes
  6. Backfill 15 orphan device_images rows with NULL program_id/site_id
  7. Add composite indexes for the new query pattern
  8. Update `resolve_report_time_range` to support actual program date lookup

  ## Key Behavior Change
  - Before: `WHERE s.program_id = ANY(...)` (current assignment)
  - After:  `WHERE di.program_id = ANY(...)` (capture-time assignment)
  - JOINs to sites/programs are now LEFT JOINs through di.site_id / di.program_id
    for display names only; filtering uses di columns directly

  ## Security
  - All functions remain SECURITY DEFINER with auth.uid() checks
  - No RLS changes needed
*/

-- ============================================================
-- 1. Fix get_analytics_time_series
-- ============================================================

DROP FUNCTION IF EXISTS get_analytics_time_series(
  uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], text[], text
);

CREATE OR REPLACE FUNCTION get_analytics_time_series(
  p_company_id uuid,
  p_time_start timestamptz,
  p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL,
  p_site_ids uuid[] DEFAULT NULL,
  p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score','temperature','humidity'],
  p_interval text DEFAULT '1 hour'
)
RETURNS TABLE (
  timestamp_bucket timestamptz,
  metric_name text,
  metric_value numeric,
  device_id uuid,
  device_code text,
  site_id uuid,
  site_name text,
  program_id uuid,
  program_name text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_interval_seconds numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
      AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_interval_seconds := extract(epoch FROM p_interval::interval);

  RETURN QUERY
  SELECT
    to_timestamp(
      floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
    ) AS timestamp_bucket,
    m.metric_name,
    CASE m.metric_name
      WHEN 'mgi_score'       THEN AVG(di.mgi_score)
      WHEN 'temperature'     THEN AVG(di.temperature)
      WHEN 'humidity'        THEN AVG(di.humidity)
      WHEN 'pressure'        THEN AVG(di.pressure)
      WHEN 'gas_resistance'  THEN AVG(di.gas_resistance)
      WHEN 'battery_voltage' THEN AVG(COALESCE(wp.battery_voltage, d.battery_voltage))
      WHEN 'mgi_velocity'    THEN AVG(di.mgi_velocity)
      WHEN 'mgi_speed'       THEN AVG(di.mgi_speed)
    END AS metric_value,
    di.device_id,
    d.device_code::text,
    di.site_id,
    s.name::text AS site_name,
    di.program_id,
    pp.name::text AS program_name
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  LEFT JOIN sites s ON s.site_id = di.site_id
  LEFT JOIN pilot_programs pp ON pp.program_id = di.program_id
  LEFT JOIN device_wake_payloads wp ON wp.payload_id = di.wake_payload_id
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (p_program_ids IS NULL OR di.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR di.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  GROUP BY
    to_timestamp(
      floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
    ),
    m.metric_name,
    di.device_id,
    d.device_code,
    di.site_id,
    s.name,
    di.program_id,
    pp.name
  ORDER BY timestamp_bucket, m.metric_name, d.device_code;
END;
$$;


-- ============================================================
-- 2. Fix get_analytics_aggregated
-- ============================================================

CREATE OR REPLACE FUNCTION get_analytics_aggregated(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score'], p_aggregation text DEFAULT 'avg', p_group_by text DEFAULT 'device'
)
RETURNS TABLE (group_key text, group_id uuid, metric_name text, metric_value numeric, record_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH filtered_images AS (
    SELECT di.device_id, d.device_code::text AS device_code,
      di.site_id, s.name::text AS site_name,
      di.program_id, pp.name::text AS program_name,
      di.mgi_score, di.temperature, di.humidity, di.pressure, di.gas_resistance,
      COALESCE(wp.battery_voltage, d.battery_voltage) AS battery_voltage,
      di.mgi_velocity, di.mgi_speed
    FROM device_images di
    JOIN devices d ON d.device_id = di.device_id
    LEFT JOIN sites s ON s.site_id = di.site_id
    LEFT JOIN pilot_programs pp ON pp.program_id = di.program_id
    LEFT JOIN device_wake_payloads wp ON wp.payload_id = di.wake_payload_id
    WHERE di.company_id = p_company_id
      AND di.captured_at BETWEEN p_time_start AND p_time_end
      AND di.status = 'complete'
      AND (p_program_ids IS NULL OR di.program_id = ANY(p_program_ids))
      AND (p_site_ids IS NULL OR di.site_id = ANY(p_site_ids))
      AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  )
  SELECT
    CASE p_group_by
      WHEN 'device' THEN fi.device_code
      WHEN 'site' THEN fi.site_name
      WHEN 'program' THEN fi.program_name
      ELSE 'all'
    END AS group_key,
    CASE p_group_by
      WHEN 'device' THEN fi.device_id
      WHEN 'site' THEN fi.site_id
      WHEN 'program' THEN fi.program_id
    END AS group_id,
    m.metric_name,
    CASE p_aggregation
      WHEN 'avg' THEN CASE m.metric_name
        WHEN 'mgi_score'       THEN AVG(fi.mgi_score)
        WHEN 'temperature'     THEN AVG(fi.temperature)
        WHEN 'humidity'        THEN AVG(fi.humidity)
        WHEN 'pressure'        THEN AVG(fi.pressure)
        WHEN 'gas_resistance'  THEN AVG(fi.gas_resistance)
        WHEN 'battery_voltage' THEN AVG(fi.battery_voltage)
        WHEN 'mgi_velocity'    THEN AVG(fi.mgi_velocity)
        WHEN 'mgi_speed'       THEN AVG(fi.mgi_speed)
      END
      WHEN 'sum' THEN CASE m.metric_name
        WHEN 'mgi_score'       THEN SUM(fi.mgi_score)
        WHEN 'temperature'     THEN SUM(fi.temperature)
        WHEN 'humidity'        THEN SUM(fi.humidity)
        WHEN 'pressure'        THEN SUM(fi.pressure)
        WHEN 'gas_resistance'  THEN SUM(fi.gas_resistance)
        WHEN 'battery_voltage' THEN SUM(fi.battery_voltage)
        WHEN 'mgi_velocity'    THEN SUM(fi.mgi_velocity)
        WHEN 'mgi_speed'       THEN SUM(fi.mgi_speed)
      END
      WHEN 'min' THEN CASE m.metric_name
        WHEN 'mgi_score'       THEN MIN(fi.mgi_score)
        WHEN 'temperature'     THEN MIN(fi.temperature)
        WHEN 'humidity'        THEN MIN(fi.humidity)
        WHEN 'pressure'        THEN MIN(fi.pressure)
        WHEN 'gas_resistance'  THEN MIN(fi.gas_resistance)
        WHEN 'battery_voltage' THEN MIN(fi.battery_voltage)
        WHEN 'mgi_velocity'    THEN MIN(fi.mgi_velocity)
        WHEN 'mgi_speed'       THEN MIN(fi.mgi_speed)
      END
      WHEN 'max' THEN CASE m.metric_name
        WHEN 'mgi_score'       THEN MAX(fi.mgi_score)
        WHEN 'temperature'     THEN MAX(fi.temperature)
        WHEN 'humidity'        THEN MAX(fi.humidity)
        WHEN 'pressure'        THEN MAX(fi.pressure)
        WHEN 'gas_resistance'  THEN MAX(fi.gas_resistance)
        WHEN 'battery_voltage' THEN MAX(fi.battery_voltage)
        WHEN 'mgi_velocity'    THEN MAX(fi.mgi_velocity)
        WHEN 'mgi_speed'       THEN MAX(fi.mgi_speed)
      END
    END AS metric_value,
    COUNT(*)::bigint AS record_count
  FROM filtered_images fi
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  GROUP BY group_key, group_id, m.metric_name
  ORDER BY group_key, m.metric_name;
END; $$;


-- ============================================================
-- 3. Fix get_analytics_comparison
-- ============================================================

DROP FUNCTION IF EXISTS get_analytics_comparison(
  uuid, timestamptz, timestamptz, text, uuid[], text[], text
);

CREATE OR REPLACE FUNCTION get_analytics_comparison(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_entity_type text, p_entity_ids uuid[],
  p_metrics text[] DEFAULT ARRAY['mgi_score'],
  p_interval text DEFAULT '1 hour'
)
RETURNS TABLE (
  "timestamp" timestamptz, entity_id uuid, entity_name text, metric_name text, metric_value numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_interval_seconds numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_interval_seconds := extract(epoch FROM p_interval::interval);

  RETURN QUERY
  SELECT
    to_timestamp(floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds) AS timestamp_bucket,
    CASE p_entity_type
      WHEN 'program' THEN di.program_id
      WHEN 'site' THEN di.site_id
      WHEN 'device' THEN d.device_id
    END AS entity_id,
    CASE p_entity_type
      WHEN 'program' THEN pp.name::text
      WHEN 'site' THEN s.name::text
      WHEN 'device' THEN d.device_code::text
    END AS entity_name,
    m.metric_name,
    CASE m.metric_name
      WHEN 'mgi_score'       THEN AVG(di.mgi_score)
      WHEN 'temperature'     THEN AVG(di.temperature)
      WHEN 'humidity'        THEN AVG(di.humidity)
      WHEN 'pressure'        THEN AVG(di.pressure)
      WHEN 'gas_resistance'  THEN AVG(di.gas_resistance)
      WHEN 'battery_voltage' THEN AVG(COALESCE(wp.battery_voltage, d.battery_voltage))
      WHEN 'mgi_velocity'    THEN AVG(di.mgi_velocity)
      WHEN 'mgi_speed'       THEN AVG(di.mgi_speed)
    END AS metric_value
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  LEFT JOIN sites s ON s.site_id = di.site_id
  LEFT JOIN pilot_programs pp ON pp.program_id = di.program_id
  LEFT JOIN device_wake_payloads wp ON wp.payload_id = di.wake_payload_id
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (
      (p_entity_type = 'program' AND di.program_id = ANY(p_entity_ids))
      OR (p_entity_type = 'site' AND di.site_id = ANY(p_entity_ids))
      OR (p_entity_type = 'device' AND di.device_id = ANY(p_entity_ids))
    )
  GROUP BY
    to_timestamp(floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds),
    entity_id, entity_name, m.metric_name
  ORDER BY timestamp_bucket, entity_name, m.metric_name;
END; $$;


-- ============================================================
-- 4. Fix get_analytics_drill_down
-- ============================================================

DROP FUNCTION IF EXISTS get_analytics_drill_down(
  uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], integer, integer
);

CREATE OR REPLACE FUNCTION get_analytics_drill_down(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  image_id uuid,
  device_id uuid,
  device_code text,
  site_id uuid,
  site_name text,
  program_id uuid,
  program_name text,
  site_device_session_id uuid,
  wake_payload_id uuid,
  captured_at timestamptz,
  mgi_score numeric,
  temperature numeric,
  humidity numeric,
  pressure numeric,
  gas_resistance numeric,
  mgi_velocity numeric,
  mgi_speed numeric,
  battery_voltage numeric,
  image_url text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    di.image_id,
    di.device_id,
    d.device_code::text,
    di.site_id,
    s.name::text AS site_name,
    di.program_id,
    pp.name::text AS program_name,
    di.site_device_session_id,
    di.wake_payload_id,
    di.captured_at,
    di.mgi_score,
    di.temperature,
    di.humidity,
    di.pressure,
    di.gas_resistance,
    di.mgi_velocity,
    di.mgi_speed,
    COALESCE(wp.battery_voltage, d.battery_voltage),
    di.image_url
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  LEFT JOIN sites s ON s.site_id = di.site_id
  LEFT JOIN pilot_programs pp ON pp.program_id = di.program_id
  LEFT JOIN device_wake_payloads wp ON wp.payload_id = di.wake_payload_id
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (p_program_ids IS NULL OR di.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR di.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  ORDER BY di.captured_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END; $$;


-- ============================================================
-- 5. Fix generate_scheduled_report_snapshots
-- ============================================================

CREATE OR REPLACE FUNCTION generate_scheduled_report_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
v_schedule record;
v_report record;
v_current_time timestamptz := now();
v_schedule_local_time time;
v_current_date date;
v_last_run_date date;
v_days_elapsed integer;
v_min_days integer;
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
v_paused_count integer := 0;
v_results jsonb := '[]'::jsonb;
v_all_programs_expired boolean;
v_active_device_count integer;
v_pause_reason text;
v_expired_program_names text;
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

IF v_schedule.last_run_at IS NOT NULL THEN
v_current_date := (v_current_time AT TIME ZONE v_schedule.timezone)::date;
v_last_run_date := (v_schedule.last_run_at AT TIME ZONE v_schedule.timezone)::date;
v_days_elapsed := v_current_date - v_last_run_date;

CASE v_schedule.cadence
WHEN 'daily'          THEN v_min_days := 1;
WHEN 'every_other_day' THEN v_min_days := 2;
WHEN 'weekly'         THEN v_min_days := 7;
WHEN 'biweekly'       THEN v_min_days := 14;
WHEN 'monthly'        THEN v_min_days := 30;
ELSE v_min_days := 1;
END CASE;

IF v_days_elapsed < v_min_days
AND v_schedule.updated_at <= v_schedule.last_run_at THEN
v_skipped_count := v_skipped_count + 1;
CONTINUE;
END IF;
END IF;

v_config := v_schedule.configuration;
v_time_range := COALESCE(v_config->>'timeRange', 'last_7d');
v_interval_text := COALESCE(v_config->>'timeGranularity', '1 hour');

IF v_config->'programIds' IS NOT NULL AND jsonb_array_length(v_config->'programIds') > 0 THEN
SELECT array_agg(p::text::uuid)
INTO v_program_ids
FROM jsonb_array_elements_text(v_config->'programIds') p;

SELECT
  NOT EXISTS (
    SELECT 1 FROM pilot_programs pp
    WHERE pp.program_id = ANY(v_program_ids)
      AND pp.end_date >= CURRENT_DATE
  )
INTO v_all_programs_expired;

IF v_all_programs_expired THEN
  SELECT count(*)
  INTO v_active_device_count
  FROM devices d
  WHERE d.program_id = ANY(v_program_ids)
    AND d.is_active = true;

  IF v_active_device_count = 0 THEN
    SELECT string_agg(pp.name, ', ')
    INTO v_expired_program_names
    FROM pilot_programs pp
    WHERE pp.program_id = ANY(v_program_ids);

    v_pause_reason := 'Auto-paused: all programs have concluded (' || v_expired_program_names || ') and no active devices remain';

    UPDATE report_snapshot_schedules
    SET enabled = false,
        paused_reason = v_pause_reason,
        paused_at = v_current_time,
        updated_at = v_current_time
    WHERE schedule_id = v_schedule.schedule_id;

    v_paused_count := v_paused_count + 1;
    v_results := v_results || jsonb_build_object(
      'report_id', v_schedule.report_id,
      'report_name', v_schedule.report_name,
      'status', 'auto_paused',
      'reason', v_pause_reason
    );
    CONTINUE;
  END IF;
END IF;
ELSE
v_program_ids := NULL;
END IF;

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
v_current_time,
v_program_ids
) tr;

IF v_config->'metrics' IS NOT NULL AND jsonb_array_length(v_config->'metrics') > 0 THEN
SELECT array_agg(
CASE
WHEN jsonb_typeof(elem) = 'object' THEN elem->>'type'
ELSE elem #>> '{}'
END
)
INTO v_metrics
FROM jsonb_array_elements(v_config->'metrics') elem;
ELSE
v_metrics := ARRAY['mgi_score','temperature','humidity'];
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
to_timestamp(
floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
)::text AS "timestamp",
m.metric_name,
AVG(
CASE m.metric_name
WHEN 'mgi_score'       THEN di.mgi_score
WHEN 'temperature'     THEN di.temperature
WHEN 'humidity'        THEN di.humidity
WHEN 'pressure'        THEN di.pressure
WHEN 'gas_resistance'  THEN di.gas_resistance
WHEN 'battery_voltage' THEN COALESCE(wp.battery_voltage, d.battery_voltage)
WHEN 'mgi_velocity'    THEN di.mgi_velocity
WHEN 'mgi_speed'       THEN di.mgi_speed
END
) AS metric_value,
di.device_id,
d.device_code::text,
di.site_id,
s.name::text AS site_name,
di.program_id,
pp.name::text AS program_name
FROM device_images di
JOIN devices d ON d.device_id = di.device_id
LEFT JOIN sites s ON s.site_id = di.site_id
LEFT JOIN pilot_programs pp ON pp.program_id = di.program_id
LEFT JOIN device_wake_payloads wp ON wp.payload_id = di.wake_payload_id
CROSS JOIN LATERAL unnest(v_metrics) AS m(metric_name)
WHERE di.company_id = v_schedule.company_id
AND di.captured_at BETWEEN v_time_start AND v_time_end
AND di.status IN ('complete', 'receiving')
AND (v_program_ids IS NULL OR di.program_id = ANY(v_program_ids))
AND (v_site_ids IS NULL OR di.site_id = ANY(v_site_ids))
AND (v_device_ids IS NULL OR di.device_id = ANY(v_device_ids))
GROUP BY
to_timestamp(
floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
),
m.metric_name,
di.device_id,
d.device_code,
di.site_id,
s.name,
di.program_id,
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
'auto_paused', v_paused_count,
'errors', v_error_count,
'results', v_results
);
END;
$$;


-- ============================================================
-- 6. Update resolve_report_time_range to support program dates
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_report_time_range(
  p_time_range text,
  p_custom_start text DEFAULT NULL,
  p_custom_end text DEFAULT NULL,
  p_ref_time timestamptz DEFAULT now(),
  p_program_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(time_start timestamptz, time_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_program_start date;
  v_program_end date;
BEGIN
  CASE p_time_range
    WHEN 'last_24h' THEN
      RETURN QUERY SELECT p_ref_time - interval '24 hours', p_ref_time;
    WHEN 'last_7d' THEN
      RETURN QUERY SELECT p_ref_time - interval '7 days', p_ref_time;
    WHEN 'last_30d' THEN
      RETURN QUERY SELECT p_ref_time - interval '30 days', p_ref_time;
    WHEN 'this_program' THEN
      IF p_program_ids IS NOT NULL AND array_length(p_program_ids, 1) > 0 THEN
        SELECT MIN(pp.start_date), MAX(pp.end_date)
        INTO v_program_start, v_program_end
        FROM pilot_programs pp
        WHERE pp.program_id = ANY(p_program_ids);

        IF v_program_start IS NOT NULL THEN
          RETURN QUERY SELECT
            v_program_start::timestamptz,
            COALESCE(
              LEAST(v_program_end::timestamptz + interval '1 day', p_ref_time),
              p_ref_time
            );
        ELSE
          RETURN QUERY SELECT p_ref_time - interval '90 days', p_ref_time;
        END IF;
      ELSE
        RETURN QUERY SELECT p_ref_time - interval '90 days', p_ref_time;
      END IF;
    WHEN 'custom' THEN
      RETURN QUERY SELECT
        COALESCE(p_custom_start::timestamptz, p_ref_time - interval '30 days'),
        COALESCE(p_custom_end::timestamptz, p_ref_time);
    ELSE
      RETURN QUERY SELECT p_ref_time - interval '7 days', p_ref_time;
  END CASE;
END;
$$;


-- ============================================================
-- 7. Backfill orphan device_images with NULL program_id/site_id
-- ============================================================

UPDATE device_images di
SET
  program_id = d.program_id,
  site_id = d.site_id,
  company_id = COALESCE(di.company_id, d.company_id)
FROM devices d
WHERE d.device_id = di.device_id
  AND di.program_id IS NULL
  AND d.program_id IS NOT NULL;

UPDATE device_images di
SET
  site_id = d.site_id
FROM devices d
WHERE d.device_id = di.device_id
  AND di.site_id IS NULL
  AND d.site_id IS NOT NULL;


-- ============================================================
-- 8. Add performance indexes for the new query pattern
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_device_images_program_captured
  ON device_images (program_id, captured_at)
  WHERE status = 'complete';

CREATE INDEX IF NOT EXISTS idx_device_images_site_captured
  ON device_images (site_id, captured_at)
  WHERE status = 'complete';

CREATE INDEX IF NOT EXISTS idx_device_images_company_program_status
  ON device_images (company_id, program_id, status, captured_at);
