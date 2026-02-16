/*
  # Add All Metrics to Analytics Functions (v2)

  1. Updated Functions
    - `get_analytics_aggregated`: Added pressure, gas_resistance, battery_voltage,
      mgi_velocity, mgi_speed to the CTE SELECT and all aggregation CASE branches
    - `get_analytics_comparison`: Dropped and recreated with all metric support
    - `get_analytics_drill_down`: Dropped and recreated with pressure, gas_resistance,
      mgi_velocity, mgi_speed, battery_voltage columns added

  2. Why
    - Previously these functions only supported mgi_score, temperature, and humidity
    - The drill-down function did not return pressure/gas_resistance at all
    - This brings all analytics functions to parity with get_analytics_time_series

  3. Important Notes
    - Functions are dropped and recreated because return types changed
    - battery_voltage comes from devices table, all others from device_images
    - No data is modified; these are read-only function updates
*/

-- Drop functions that need return type changes
DROP FUNCTION IF EXISTS get_analytics_comparison(uuid, timestamptz, timestamptz, text, uuid[], text[], text);
DROP FUNCTION IF EXISTS get_analytics_drill_down(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], integer, integer);

-- 1. Update get_analytics_aggregated (return type unchanged, just add metrics)
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
    SELECT di.device_id, d.device_code::text AS device_code, d.site_id, s.name::text AS site_name,
      s.program_id, pp.name::text AS program_name,
      di.mgi_score, di.temperature, di.humidity, di.pressure, di.gas_resistance,
      d.battery_voltage, di.mgi_velocity, di.mgi_speed
    FROM device_images di
    JOIN devices d ON d.device_id = di.device_id
    JOIN sites s ON s.site_id = d.site_id
    JOIN pilot_programs pp ON pp.program_id = s.program_id
    WHERE di.company_id = p_company_id
      AND di.captured_at BETWEEN p_time_start AND p_time_end
      AND di.status = 'complete'
      AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
      AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
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

-- 2. Recreate get_analytics_comparison with all metrics
CREATE FUNCTION get_analytics_comparison(
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
      WHEN 'program' THEN pp.program_id
      WHEN 'site' THEN s.site_id
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
      WHEN 'battery_voltage' THEN AVG(d.battery_voltage)
      WHEN 'mgi_velocity'    THEN AVG(di.mgi_velocity)
      WHEN 'mgi_speed'       THEN AVG(di.mgi_speed)
    END AS metric_value
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  JOIN pilot_programs pp ON pp.program_id = s.program_id
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (
      (p_entity_type = 'program' AND pp.program_id = ANY(p_entity_ids))
      OR (p_entity_type = 'site' AND s.site_id = ANY(p_entity_ids))
      OR (p_entity_type = 'device' AND d.device_id = ANY(p_entity_ids))
    )
  GROUP BY
    to_timestamp(floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds),
    entity_id, entity_name, m.metric_name
  ORDER BY timestamp_bucket, entity_name, m.metric_name;
END; $$;

-- 3. Recreate get_analytics_drill_down with all metric columns
CREATE FUNCTION get_analytics_drill_down(
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
    s.site_id,
    s.name::text AS site_name,
    pp.program_id,
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
    d.battery_voltage,
    di.image_url
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  JOIN pilot_programs pp ON pp.program_id = s.program_id
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  ORDER BY di.captured_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END; $$;
