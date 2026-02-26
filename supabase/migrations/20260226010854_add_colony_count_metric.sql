/*
  # Add Spore Colony Count Metric

  1. New Columns on `device_images`
    - `colony_count` (integer) - Total spore colonies detected by Roboflow
    - `colony_count_confidence` (numeric) - Average detection confidence (0.0-1.0)
    - `colony_detections` (jsonb) - Raw Roboflow detection array (bounding boxes, individual confidences)
    - `colony_count_velocity` (integer) - Change in colony count from prior image

  2. New Columns on `devices` (rollup)
    - `latest_colony_count` (integer) - Most recent colony count for this device
    - `latest_colony_count_at` (timestamptz) - When the latest colony count was recorded

  3. Trigger Update
    - Extends `calculate_and_rollup_mgi` to also compute `colony_count_velocity`
      and roll up `latest_colony_count` to the `devices` table

  4. Analytics Support
    - Updates `get_analytics_time_series` with `colony_count` metric
    - Updates `get_analytics_drill_down` to return `colony_count`

  5. Important Notes
    - colony_count is nullable (null means not yet scored or Roboflow did not return it)
    - colony_count_velocity is the simple delta: current - previous
    - No destructive changes; all columns are additive
*/

-- =====================================================
-- 1. Add colony_count columns to device_images
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'colony_count'
  ) THEN
    ALTER TABLE device_images ADD COLUMN colony_count integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'colony_count_confidence'
  ) THEN
    ALTER TABLE device_images ADD COLUMN colony_count_confidence numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'colony_detections'
  ) THEN
    ALTER TABLE device_images ADD COLUMN colony_detections jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'colony_count_velocity'
  ) THEN
    ALTER TABLE device_images ADD COLUMN colony_count_velocity integer;
  END IF;
END $$;

-- =====================================================
-- 2. Add rollup columns to devices
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'latest_colony_count'
  ) THEN
    ALTER TABLE devices ADD COLUMN latest_colony_count integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'latest_colony_count_at'
  ) THEN
    ALTER TABLE devices ADD COLUMN latest_colony_count_at timestamptz;
  END IF;
END $$;

-- =====================================================
-- 3. Index for analytics queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_device_images_colony_count
  ON device_images (device_id, captured_at)
  WHERE colony_count IS NOT NULL;

-- =====================================================
-- 4. Update calculate_and_rollup_mgi trigger function
--    to also handle colony_count
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_and_rollup_mgi()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_mgi numeric;
  v_prev_captured_at timestamptz;
  v_calculated_velocity numeric;
  v_program_start_date date;
  v_capture_date date;
  v_days_since_start numeric;
  v_prev_colony_count integer;
BEGIN
  -- MGI scoring logic (unchanged)
  IF NEW.mgi_score IS NOT NULL THEN
    SELECT mgi_score, captured_at
    INTO v_prev_mgi, v_prev_captured_at
    FROM device_images
    WHERE device_id = NEW.device_id
      AND captured_at < NEW.captured_at
      AND mgi_score IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT 1;

    IF v_prev_mgi IS NOT NULL THEN
      v_calculated_velocity := NEW.mgi_score - v_prev_mgi;
      NEW.mgi_velocity := v_calculated_velocity;
    ELSE
      NEW.mgi_velocity := 0;
    END IF;

    SELECT pp.start_date INTO v_program_start_date
    FROM sites s
    JOIN pilot_programs pp ON pp.program_id = s.program_id
    WHERE s.site_id = NEW.site_id;

    IF v_program_start_date IS NOT NULL THEN
      v_capture_date := DATE(NEW.captured_at AT TIME ZONE 'UTC');
      v_days_since_start := v_capture_date - v_program_start_date;

      IF v_days_since_start > 0 THEN
        NEW.mgi_speed := NEW.mgi_score / v_days_since_start;
      ELSE
        NEW.mgi_speed := NEW.mgi_score;
      END IF;
    END IF;

    UPDATE devices
    SET
      latest_mgi_score = NEW.mgi_score,
      latest_mgi_velocity = NEW.mgi_velocity,
      latest_mgi_at = NEW.captured_at,
      updated_at = now()
    WHERE device_id = NEW.device_id
      AND (
        latest_mgi_at IS NULL
        OR NEW.captured_at > latest_mgi_at
      );
  END IF;

  -- Colony count logic (new)
  IF NEW.colony_count IS NOT NULL THEN
    SELECT colony_count
    INTO v_prev_colony_count
    FROM device_images
    WHERE device_id = NEW.device_id
      AND captured_at < NEW.captured_at
      AND colony_count IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT 1;

    IF v_prev_colony_count IS NOT NULL THEN
      NEW.colony_count_velocity := NEW.colony_count - v_prev_colony_count;
    ELSE
      NEW.colony_count_velocity := 0;
    END IF;

    UPDATE devices
    SET
      latest_colony_count = NEW.colony_count,
      latest_colony_count_at = NEW.captured_at,
      updated_at = now()
    WHERE device_id = NEW.device_id
      AND (
        latest_colony_count_at IS NULL
        OR NEW.captured_at > latest_colony_count_at
      );
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================
-- 5. Update analytics time series function
-- =====================================================

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
      WHEN 'colony_count'    THEN AVG(di.colony_count::numeric)
      WHEN 'colony_count_velocity' THEN AVG(di.colony_count_velocity::numeric)
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
    m.metric_name, di.device_id, d.device_code, di.site_id, s.name, di.program_id, pp.name
  ORDER BY ts_bucket, m.metric_name, d.device_code;
END;
$$;

-- =====================================================
-- 6. Update analytics drill-down function
-- =====================================================

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
  vtt_mold_index numeric,
  colony_count integer,
  colony_count_velocity integer
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
    di.vtt_mold_index,
    di.colony_count,
    di.colony_count_velocity
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
