/*
  # Fix Analytics Functions: Dynamic Interval Support

  ## What This Fixes
  1. `get_analytics_time_series` - Previously ignored the `p_interval` parameter
     and always hardcoded `date_trunc('hour', ...)`. Now uses epoch-based
     flooring to bucket data at ANY interval (15 min, 30 min, 1 hour, 1 day, etc.)
  2. `get_analytics_comparison` - Same fix; previously hardcoded `date_trunc('day', ...)`

  ## How It Works
  Uses `to_timestamp(floor(extract(epoch from captured_at) / extract(epoch from interval)) * extract(epoch from interval))`
  which cleanly handles any PostgreSQL interval value: '15 minutes', '30 minutes',
  '1 hour', '1 day', '1 week'.

  ## Safety
  - These are SECURITY DEFINER functions only called from the frontend analytics service
  - The mqtt-service has zero dependency on these functions
  - Uses CREATE OR REPLACE so the function signature stays the same
  - No table or column changes
*/

CREATE OR REPLACE FUNCTION get_analytics_time_series(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score', 'temperature', 'humidity'], p_interval text DEFAULT '1 hour'
)
RETURNS TABLE (timestamp_bucket timestamptz, metric_name text, metric_value numeric, device_id uuid, device_code text, site_id uuid, site_name text, program_id uuid, program_name text)
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
    m.metric_name,
    CASE m.metric_name
      WHEN 'mgi_score' THEN AVG(di.mgi_score)
      WHEN 'temperature' THEN AVG(di.temperature)
      WHEN 'humidity' THEN AVG(di.humidity)
    END AS metric_value,
    di.device_id, d.device_code::text, d.site_id, s.name::text AS site_name, s.program_id, pp.name::text AS program_name
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
    to_timestamp(floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds),
    m.metric_name, di.device_id, d.device_code, d.site_id, s.name, s.program_id, pp.name
  ORDER BY timestamp_bucket, m.metric_name, d.device_code;
END; $$;


CREATE OR REPLACE FUNCTION get_analytics_comparison(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_entity_type text, p_entity_ids uuid[], p_metrics text[] DEFAULT ARRAY['mgi_score'], p_interval text DEFAULT '1 day'
)
RETURNS TABLE (timestamp_bucket timestamptz, entity_id uuid, entity_name text, metric_name text, metric_value numeric)
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
    CASE p_entity_type WHEN 'program' THEN pp.program_id WHEN 'site' THEN s.site_id WHEN 'device' THEN d.device_id END AS entity_id,
    CASE p_entity_type WHEN 'program' THEN pp.name::text WHEN 'site' THEN s.name::text WHEN 'device' THEN d.device_code::text END AS entity_name,
    m.metric_name,
    CASE m.metric_name
      WHEN 'mgi_score' THEN AVG(di.mgi_score)
      WHEN 'temperature' THEN AVG(di.temperature)
      WHEN 'humidity' THEN AVG(di.humidity)
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

GRANT EXECUTE ON FUNCTION get_analytics_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_comparison TO authenticated;
