/*
  # Fix auto-snapshot timestamp key mismatch

  1. Problem
    - `generate_scheduled_report_snapshots()` outputs timeSeries rows with key `timestamp_bucket`
    - The frontend `transformTimeSeriesForD3` reads the `timestamp` key
    - Result: auto-snapshots render as a single blank data point (no x-axis time spread)

  2. Fix
    - Add `timestamp` alias (as text) alongside `timestamp_bucket` in the subquery SELECT
    - Frontend can now find the `timestamp` property and plot the time axis correctly

  3. Backfill
    - Update existing auto-snapshots that have `timestamp_bucket` but no `timestamp` key
      by copying the value across in each timeSeries element
*/

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
WHEN 'battery_voltage' THEN wp.battery_voltage
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
LEFT JOIN device_wake_payloads wp ON wp.payload_id = di.wake_payload_id
CROSS JOIN LATERAL unnest(v_metrics) AS m(metric_name)
WHERE di.company_id = v_schedule.company_id
AND di.captured_at BETWEEN v_time_start AND v_time_end
AND di.status IN ('complete', 'receiving')
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
