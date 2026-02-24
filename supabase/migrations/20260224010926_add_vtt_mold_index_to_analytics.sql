/*
  # Add VTT Mold Risk Index to Analytics Pipeline

  1. Schema Changes
    - `device_images`: Add `vtt_mold_index` column (numeric, nullable, range 0-6)
    - Stores the cumulative VTT mold risk index at the time each image was captured

  2. Backfill
    - Replays VTT calculation chronologically per device for all ~2,084 historical
      images that have temperature + humidity data
    - Uses existing `fn_vtt_growth_rate_per_hour` function for consistent calculation
    - Updates `device_vtt_risk_state` to match final backfilled value per device

  3. Trigger Update
    - Updates `fn_update_vtt_risk_on_telemetry()` to write the VTT index back to
      the device_images row after computing it

  4. Analytics Functions Updated
    - `get_analytics_time_series`: Added `vtt_mold_index` CASE branch
    - `get_analytics_aggregated`: Added `vtt_mold_index` to all 4 aggregation modes
      and to the filtered_images CTE
    - `get_analytics_comparison`: Added `vtt_mold_index` CASE branch
    - `get_analytics_drill_down`: Added `vtt_mold_index` to SELECT and RETURNS TABLE

  5. Security
    - No RLS changes; existing policies cover the new column automatically
    - All functions remain SECURITY DEFINER with auth.uid() checks
*/

-- ============================================================
-- 1. Add vtt_mold_index column to device_images
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'vtt_mold_index'
  ) THEN
    ALTER TABLE device_images ADD COLUMN vtt_mold_index numeric;
  END IF;
END $$;

-- ============================================================
-- 2. Backfill historical VTT values
-- ============================================================

DO $$
DECLARE
  v_device record;
  v_image record;
  v_prev_index numeric := 0;
  v_prev_time timestamptz;
  v_temp_c numeric;
  v_growth_rate numeric;
  v_hours_elapsed numeric;
  v_new_index numeric;
  v_count integer := 0;
BEGIN
  FOR v_device IN
    SELECT DISTINCT device_id
    FROM device_images
    WHERE temperature IS NOT NULL
      AND humidity IS NOT NULL
      AND status = 'complete'
    ORDER BY device_id
  LOOP
    v_prev_index := 0;
    v_prev_time := NULL;

    FOR v_image IN
      SELECT image_id, captured_at, temperature, humidity
      FROM device_images
      WHERE device_id = v_device.device_id
        AND temperature IS NOT NULL
        AND humidity IS NOT NULL
        AND status = 'complete'
      ORDER BY captured_at ASC
    LOOP
      v_temp_c := (v_image.temperature - 32.0) * 5.0 / 9.0;

      v_growth_rate := fn_vtt_growth_rate_per_hour(v_temp_c, v_image.humidity, v_prev_index);

      IF v_prev_time IS NOT NULL THEN
        v_hours_elapsed := EXTRACT(EPOCH FROM (v_image.captured_at - v_prev_time)) / 3600.0;
        v_hours_elapsed := LEAST(v_hours_elapsed, 48.0);
      ELSE
        v_hours_elapsed := 1.0;
      END IF;

      v_new_index := v_prev_index + (v_growth_rate * v_hours_elapsed);
      v_new_index := GREATEST(0, LEAST(6.0, v_new_index));

      UPDATE device_images
      SET vtt_mold_index = ROUND(v_new_index, 3)
      WHERE image_id = v_image.image_id;

      v_prev_index := v_new_index;
      v_prev_time := v_image.captured_at;
      v_count := v_count + 1;
    END LOOP;

    UPDATE device_vtt_risk_state
    SET vtt_mold_index = v_prev_index,
        updated_at = now()
    WHERE device_id = v_device.device_id;
  END LOOP;

  RAISE NOTICE 'VTT backfill complete: % images updated', v_count;
END $$;

-- ============================================================
-- 3. Update trigger to write VTT index to device_images row
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_vtt_risk_on_telemetry()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_new_index numeric;
BEGIN
  IF NEW.temperature IS NOT NULL AND NEW.humidity IS NOT NULL THEN
    v_result := fn_calculate_device_vtt_risk(NEW.device_id);

    v_new_index := (v_result->>'vtt_mold_index')::numeric;
    IF v_new_index IS NOT NULL THEN
      UPDATE device_images
      SET vtt_mold_index = ROUND(v_new_index, 3)
      WHERE image_id = NEW.image_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Update get_analytics_time_series with vtt_mold_index
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
  v_needs_gas_stats boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
      AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_interval_seconds := extract(epoch FROM p_interval::interval);

  v_needs_gas_stats := EXISTS (
    SELECT 1 FROM unnest(p_metrics) mn
    WHERE mn IN ('gas_resistance_baseline', 'gas_resistance_deviation', 'gas_resistance_zscore')
  );

  RETURN QUERY
  WITH gas_stats AS (
    SELECT
      gs.image_id,
      AVG(gs.gas_resistance) OVER w AS rolling_avg,
      STDDEV_SAMP(gs.gas_resistance) OVER w AS rolling_stddev
    FROM device_images gs
    WHERE v_needs_gas_stats
      AND gs.company_id = p_company_id
      AND gs.captured_at BETWEEN (p_time_start - interval '48 hours') AND p_time_end
      AND gs.status = 'complete'
      AND gs.gas_resistance IS NOT NULL
      AND (p_program_ids IS NULL OR gs.program_id = ANY(p_program_ids))
      AND (p_site_ids IS NULL OR gs.site_id = ANY(p_site_ids))
      AND (p_device_ids IS NULL OR gs.device_id = ANY(p_device_ids))
    WINDOW w AS (
      PARTITION BY gs.device_id
      ORDER BY gs.captured_at
      RANGE BETWEEN interval '24 hours' PRECEDING AND CURRENT ROW
    )
  )
  SELECT
    to_timestamp(
      floor(extract(epoch FROM di.captured_at) / v_interval_seconds) * v_interval_seconds
    ) AS ts_bucket,
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
      WHEN 'vtt_mold_index'  THEN AVG(di.vtt_mold_index)
      WHEN 'gas_resistance_compensated' THEN AVG(
        CASE WHEN di.pressure IS NOT NULL AND di.pressure > 0
          THEN di.gas_resistance * (1013.25 / di.pressure)
          ELSE di.gas_resistance
        END
      )
      WHEN 'gas_resistance_baseline' THEN AVG(gst.rolling_avg)
      WHEN 'gas_resistance_deviation' THEN AVG(
        CASE WHEN gst.rolling_avg IS NOT NULL AND gst.rolling_avg > 0
          THEN ((di.gas_resistance - gst.rolling_avg) / gst.rolling_avg) * 100.0
          ELSE NULL
        END
      )
      WHEN 'gas_resistance_zscore' THEN AVG(
        CASE WHEN gst.rolling_stddev IS NOT NULL AND gst.rolling_stddev > 0
          THEN (di.gas_resistance - gst.rolling_avg) / gst.rolling_stddev
          ELSE NULL
        END
      )
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
  LEFT JOIN gas_stats gst ON gst.image_id = di.image_id
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
  ORDER BY ts_bucket, m.metric_name, d.device_code;
END;
$$;

-- ============================================================
-- 5. Update get_analytics_aggregated with vtt_mold_index
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
      di.mgi_velocity, di.mgi_speed, di.vtt_mold_index,
      CASE WHEN di.pressure IS NOT NULL AND di.pressure > 0
        THEN di.gas_resistance * (1013.25 / di.pressure)
        ELSE di.gas_resistance
      END AS gas_resistance_compensated
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
        WHEN 'vtt_mold_index'  THEN AVG(fi.vtt_mold_index)
        WHEN 'gas_resistance_compensated' THEN AVG(fi.gas_resistance_compensated)
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
        WHEN 'vtt_mold_index'  THEN SUM(fi.vtt_mold_index)
        WHEN 'gas_resistance_compensated' THEN SUM(fi.gas_resistance_compensated)
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
        WHEN 'vtt_mold_index'  THEN MIN(fi.vtt_mold_index)
        WHEN 'gas_resistance_compensated' THEN MIN(fi.gas_resistance_compensated)
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
        WHEN 'vtt_mold_index'  THEN MAX(fi.vtt_mold_index)
        WHEN 'gas_resistance_compensated' THEN MAX(fi.gas_resistance_compensated)
      END
    END AS metric_value,
    COUNT(*)::bigint AS record_count
  FROM filtered_images fi
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  GROUP BY group_key, group_id, m.metric_name
  ORDER BY group_key, m.metric_name;
END; $$;

-- ============================================================
-- 6. Update get_analytics_comparison with vtt_mold_index
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
      WHEN 'vtt_mold_index'  THEN AVG(di.vtt_mold_index)
      WHEN 'gas_resistance_compensated' THEN AVG(
        CASE WHEN di.pressure IS NOT NULL AND di.pressure > 0
          THEN di.gas_resistance * (1013.25 / di.pressure)
          ELSE di.gas_resistance
        END
      )
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
-- 7. Update get_analytics_drill_down with vtt_mold_index
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
  image_url text,
  vtt_mold_index numeric
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
    di.image_url,
    di.vtt_mold_index
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