/*
  # Fix Cron Parsing + Analytics Type Mismatch

  INSTRUCTIONS: Apply this via the Supabase Dashboard SQL Editor.
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql

  ## What This Fixes

  1. fn_parse_cron_wake_count: Now parses both minute AND hour fields
     - "*/15 * * * *" -> 96 (was 1)
     - "0 8,16 * * *" -> 2 (unchanged)
     - "0 */6 * * *" -> 4 (unchanged)

  2. fn_calculate_next_wake (2-param): Now handles minute-level intervals
     - "*/15 * * * *" -> from_timestamp + 15 minutes (was next whole hour)
     - Used by mqtt-service, commandQueueProcessor, and frontend deviceService

  3. Analytics functions: Add ::text casts to fix varchar/text mismatch
     - get_analytics_time_series
     - get_analytics_aggregated
     - get_analytics_comparison
     - get_analytics_drill_down
*/


-- ==========================================
-- PART 1: Fix fn_parse_cron_wake_count
-- ==========================================

CREATE OR REPLACE FUNCTION fn_parse_cron_wake_count(cron_expression TEXT)
RETURNS INT AS $$
DECLARE
  v_minute_part TEXT;
  v_hour_part TEXT;
  v_wakes_per_hour INT;
  v_active_hours INT;
BEGIN
  IF cron_expression IS NULL OR cron_expression = '' THEN
    RETURN 1;
  END IF;

  v_minute_part := split_part(cron_expression, ' ', 1);
  v_hour_part := split_part(cron_expression, ' ', 2);

  IF v_minute_part IS NULL OR v_minute_part = '' THEN
    RETURN 1;
  END IF;

  -- Parse minute field for wakes-per-hour
  IF v_minute_part LIKE '*/%' THEN
    DECLARE
      v_interval INT;
    BEGIN
      v_interval := substring(v_minute_part FROM '\*/(\d+)')::INT;
      IF v_interval > 0 AND v_interval <= 60 THEN
        v_wakes_per_hour := 60 / v_interval;
      ELSE
        v_wakes_per_hour := 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_wakes_per_hour := 1;
    END;
  ELSIF v_minute_part LIKE '%,%' THEN
    v_wakes_per_hour := array_length(string_to_array(v_minute_part, ','), 1);
  ELSIF v_minute_part = '*' THEN
    v_wakes_per_hour := 60;
  ELSE
    v_wakes_per_hour := 1;
  END IF;

  -- Parse hour field for active-hours-per-day
  IF v_hour_part LIKE '*/%' THEN
    DECLARE
      v_interval INT;
    BEGIN
      v_interval := substring(v_hour_part FROM '\*/(\d+)')::INT;
      IF v_interval > 0 AND v_interval <= 24 THEN
        v_active_hours := 24 / v_interval;
      ELSE
        v_active_hours := 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_active_hours := 1;
    END;
  ELSIF v_hour_part LIKE '%,%' THEN
    v_active_hours := array_length(string_to_array(v_hour_part, ','), 1);
  ELSIF v_hour_part = '*' THEN
    v_active_hours := 24;
  ELSIF v_hour_part ~ '^\d+$' THEN
    v_active_hours := 1;
  ELSE
    v_active_hours := 1;
  END IF;

  RETURN GREATEST(v_wakes_per_hour * v_active_hours, 1);

EXCEPTION WHEN OTHERS THEN
  RETURN 1;
END;
$$ LANGUAGE plpgsql STABLE;


-- ==========================================
-- PART 2: Fix fn_calculate_next_wake (2-param)
-- ==========================================

CREATE OR REPLACE FUNCTION fn_calculate_next_wake(
  p_cron_expression TEXT,
  p_from_timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_next_wake TIMESTAMPTZ;
  v_base_time TIMESTAMPTZ;
  v_parts TEXT[];
  v_minute TEXT;
  v_hour TEXT;
  v_hours INT[];
  v_hour_val INT;
  v_current_hour INT;
  v_current_minute INT;
BEGIN
  IF p_cron_expression IS NULL OR p_cron_expression = '' THEN
    RETURN p_from_timestamp + INTERVAL '12 hours';
  END IF;

  v_parts := string_to_array(p_cron_expression, ' ');

  IF array_length(v_parts, 1) != 5 THEN
    RAISE WARNING 'Invalid cron expression: %, defaulting to 12 hours', p_cron_expression;
    RETURN p_from_timestamp + INTERVAL '12 hours';
  END IF;

  v_minute := v_parts[1];
  v_hour := v_parts[2];
  v_current_hour := EXTRACT(HOUR FROM p_from_timestamp)::INT;
  v_current_minute := EXTRACT(MINUTE FROM p_from_timestamp)::INT;

  -- PRIORITY 1: Minute interval (*/15 * * * *)
  IF v_minute LIKE '*/%' THEN
    DECLARE
      v_interval_minutes INT;
    BEGIN
      v_interval_minutes := substring(v_minute FROM '\*/(\d+)')::INT;
      IF v_interval_minutes > 0 AND v_interval_minutes < 60 THEN
        v_next_wake := p_from_timestamp + (v_interval_minutes || ' minutes')::INTERVAL;
        RETURN v_next_wake;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- PRIORITY 2: Minute list with wildcard/interval hour (0,30 * * * *)
  IF v_minute LIKE '%,%' AND (v_hour = '*' OR v_hour LIKE '*/%') THEN
    DECLARE
      v_minutes INT[];
      v_target_minute INT;
    BEGIN
      v_minutes := string_to_array(v_minute, ',')::INT[];
      v_minutes := array(SELECT unnest(v_minutes) ORDER BY 1);

      SELECT MIN(m) INTO v_target_minute
      FROM unnest(v_minutes) AS m
      WHERE m > v_current_minute;

      IF v_target_minute IS NOT NULL THEN
        v_next_wake := date_trunc('hour', p_from_timestamp) + (v_target_minute || ' minutes')::INTERVAL;
      ELSE
        v_next_wake := date_trunc('hour', p_from_timestamp) + INTERVAL '1 hour' + (v_minutes[1] || ' minutes')::INTERVAL;
      END IF;
      RETURN v_next_wake;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- PRIORITY 3+: Hour-level patterns (backward compatible)
  v_base_time := date_trunc('hour', p_from_timestamp) + INTERVAL '1 hour';

  IF v_hour LIKE '%,%' THEN
    SELECT array_agg(h::INT ORDER BY h::INT)
    INTO v_hours
    FROM unnest(string_to_array(v_hour, ',')) AS h
    WHERE h ~ '^\d+$';

    SELECT MIN(h) INTO v_hour_val
    FROM unnest(v_hours) AS h
    WHERE h > v_current_hour;

    IF v_hour_val IS NULL THEN
      v_hour_val := v_hours[1];
      v_next_wake := date_trunc('day', p_from_timestamp) + INTERVAL '1 day';
    ELSE
      v_next_wake := date_trunc('day', p_from_timestamp);
    END IF;

    v_next_wake := v_next_wake + (v_hour_val || ' hours')::INTERVAL;

  ELSIF v_hour LIKE '*/%' THEN
    DECLARE
      v_interval_hours INT;
    BEGIN
      v_interval_hours := substring(v_hour from '\*/(\d+)')::INT;
      v_next_wake := v_base_time;
      WHILE EXTRACT(HOUR FROM v_next_wake)::INT % v_interval_hours != 0 LOOP
        v_next_wake := v_next_wake + INTERVAL '1 hour';
      END LOOP;
    END;

  ELSIF v_hour ~ '^\d+$' THEN
    v_hour_val := v_hour::INT;
    IF v_hour_val > v_current_hour THEN
      v_next_wake := date_trunc('day', p_from_timestamp) + (v_hour_val || ' hours')::INTERVAL;
    ELSE
      v_next_wake := date_trunc('day', p_from_timestamp) + INTERVAL '1 day' + (v_hour_val || ' hours')::INTERVAL;
    END IF;

  ELSIF v_hour = '*' THEN
    v_next_wake := v_base_time;

  ELSE
    RAISE WARNING 'Unsupported cron hour format: %, defaulting to 12 hours', v_hour;
    RETURN p_from_timestamp + INTERVAL '12 hours';
  END IF;

  RETURN v_next_wake;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error calculating next wake from cron %: %, defaulting to 12 hours', p_cron_expression, SQLERRM;
  RETURN p_from_timestamp + INTERVAL '12 hours';
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_calculate_next_wake(TEXT, TIMESTAMPTZ) TO authenticated, service_role;


-- ==========================================
-- PART 3: Fix Analytics Functions (::text casts)
-- ==========================================

DROP FUNCTION IF EXISTS get_analytics_time_series(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], text[], text);

CREATE OR REPLACE FUNCTION get_analytics_time_series(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score', 'temperature', 'humidity'], p_interval text DEFAULT '1 hour'
)
RETURNS TABLE (timestamp_bucket timestamptz, metric_name text, metric_value numeric, device_id uuid, device_code text, site_id uuid, site_name text, program_id uuid, program_name text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT date_trunc('hour', di.captured_at) AS timestamp_bucket,
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
  GROUP BY date_trunc('hour', di.captured_at), m.metric_name, di.device_id, d.device_code, d.site_id, s.name, s.program_id, pp.name
  ORDER BY timestamp_bucket, m.metric_name, d.device_code;
END; $$;

DROP FUNCTION IF EXISTS get_analytics_aggregated(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], text[], text, text);

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
    SELECT di.device_id, d.device_code::text AS device_code, d.site_id, s.name::text AS site_name, s.program_id, pp.name::text AS program_name,
      di.mgi_score, di.temperature, di.humidity
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
    CASE p_group_by WHEN 'device' THEN fi.device_code WHEN 'site' THEN fi.site_name WHEN 'program' THEN fi.program_name ELSE 'all' END AS group_key,
    CASE p_group_by WHEN 'device' THEN fi.device_id WHEN 'site' THEN fi.site_id WHEN 'program' THEN fi.program_id END AS group_id,
    m.metric_name,
    CASE p_aggregation
      WHEN 'avg' THEN CASE m.metric_name WHEN 'mgi_score' THEN AVG(fi.mgi_score) WHEN 'temperature' THEN AVG(fi.temperature) WHEN 'humidity' THEN AVG(fi.humidity) END
      WHEN 'sum' THEN CASE m.metric_name WHEN 'mgi_score' THEN SUM(fi.mgi_score) WHEN 'temperature' THEN SUM(fi.temperature) WHEN 'humidity' THEN SUM(fi.humidity) END
      WHEN 'min' THEN CASE m.metric_name WHEN 'mgi_score' THEN MIN(fi.mgi_score) WHEN 'temperature' THEN MIN(fi.temperature) WHEN 'humidity' THEN MIN(fi.humidity) END
      WHEN 'max' THEN CASE m.metric_name WHEN 'mgi_score' THEN MAX(fi.mgi_score) WHEN 'temperature' THEN MAX(fi.temperature) WHEN 'humidity' THEN MAX(fi.humidity) END
    END AS metric_value,
    COUNT(*)::bigint AS record_count
  FROM filtered_images fi
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  GROUP BY group_key, group_id, m.metric_name ORDER BY group_key, m.metric_name;
END; $$;

DROP FUNCTION IF EXISTS get_analytics_comparison(uuid, timestamptz, timestamptz, text, uuid[], text[], text);

CREATE OR REPLACE FUNCTION get_analytics_comparison(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_entity_type text, p_entity_ids uuid[], p_metrics text[] DEFAULT ARRAY['mgi_score'], p_interval text DEFAULT '1 day'
)
RETURNS TABLE (timestamp_bucket timestamptz, entity_id uuid, entity_name text, metric_name text, metric_value numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT date_trunc('day', di.captured_at) AS timestamp_bucket,
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
  GROUP BY timestamp_bucket, entity_id, entity_name, m.metric_name ORDER BY timestamp_bucket, entity_name, m.metric_name;
END; $$;

DROP FUNCTION IF EXISTS get_analytics_drill_down(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], integer, integer);

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

GRANT EXECUTE ON FUNCTION get_analytics_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_comparison TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_drill_down TO authenticated;


-- ==========================================
-- VERIFICATION QUERIES (run after applying)
-- ==========================================

-- Test fn_parse_cron_wake_count:
-- SELECT fn_parse_cron_wake_count('*/15 * * * *');  -- Should return 96
-- SELECT fn_parse_cron_wake_count('0 8,16 * * *');  -- Should return 2
-- SELECT fn_parse_cron_wake_count('0 */6 * * *');   -- Should return 4
-- SELECT fn_parse_cron_wake_count('*/30 * * * *');  -- Should return 48

-- Test fn_calculate_next_wake:
-- SELECT fn_calculate_next_wake('*/15 * * * *', now());  -- Should return ~15 min from now
-- SELECT fn_calculate_next_wake('0 8,16 * * *', now());  -- Should return next 8am or 4pm
