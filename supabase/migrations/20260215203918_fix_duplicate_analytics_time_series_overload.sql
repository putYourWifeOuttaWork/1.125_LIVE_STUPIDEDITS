/*
  # Fix duplicate get_analytics_time_series function overload

  1. Problem
    - Two overloads of `get_analytics_time_series` exist with different parameter orders
    - PostgREST cannot resolve which to call (PGRST203 error)

  2. Fix
    - Drop both overloads explicitly by their full argument signatures
    - Recreate a single version using the original parameter order
    - Adds CASE branches for `pressure` and `gas_resistance` metrics
*/

-- Drop the new (wrong-order) overload
DROP FUNCTION IF EXISTS get_analytics_time_series(
  uuid, text[], timestamptz, timestamptz, text, uuid[], uuid[], uuid[]
);

-- Drop the original overload
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
      WHEN 'battery_voltage' THEN AVG(d.battery_voltage)
      WHEN 'mgi_velocity'    THEN AVG(di.mgi_velocity)
      WHEN 'mgi_speed'       THEN AVG(di.mgi_speed)
    END AS metric_value,
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
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
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
  ORDER BY timestamp_bucket, m.metric_name, d.device_code;
END;
$$;
