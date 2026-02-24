/*
  # VTT Predictive Mold Risk Engine

  1. New Tables
    - `device_vtt_risk_state`
      - `device_id` (uuid, primary key, references devices)
      - `company_id` (uuid, references companies)
      - `site_id` (uuid, references sites)
      - `vtt_mold_index` (numeric, 0-6 VTT scale)
      - `vtt_risk_level` (text: low/moderate/elevated/high/critical)
      - `latest_temperature_c` (numeric, last reading in Celsius)
      - `latest_humidity` (numeric, last reading RH%)
      - `rh_critical` (numeric, calculated critical RH threshold)
      - `rh_excess` (numeric, RH - RH_crit, positive = growth conditions)
      - `growth_favorability` (numeric 0-1, how favorable conditions are for mold)
      - `forecast_24h_index` / `forecast_48h_index` / `forecast_72h_index` (projected VTT index)
      - `forecast_24h_risk` / `forecast_48h_risk` / `forecast_72h_risk` (projected risk level)
      - `hours_to_next_level` (numeric, hours until risk escalates at current conditions)
      - `last_calculated_at` (timestamptz)

  2. New Functions
    - `fn_vtt_critical_rh(temperature_c)` - returns critical RH for mold growth at given temperature
    - `fn_vtt_mold_index_to_risk_level(index)` - maps VTT 0-6 index to risk level string
    - `fn_vtt_growth_rate_per_hour(temperature_c, rh, current_index)` - returns hourly growth rate
    - `fn_vtt_forecast_index(current_index, temperature_c, rh, hours_ahead)` - projects future index
    - `fn_calculate_device_vtt_risk(p_device_id)` - full risk calculation for a device
    - `fn_update_vtt_risk_on_telemetry()` - trigger function for automatic calculation

  3. Security
    - RLS enabled on `device_vtt_risk_state`
    - Policies for authenticated users scoped to their company
    - Trigger on `device_images` insert to recalculate VTT risk when new telemetry arrives

  4. Notes
    - VTT (Viitanen Temperature-Time) model predicts mold growth index 0-6
    - Critical RH formula: RH_crit = -0.00267*T^3 + 0.160*T^2 - 3.13*T + 100
    - Valid for temperatures 0-50 degrees C
    - Growth rate accelerates when RH exceeds RH_crit
    - Forecast uses current conditions projected forward
*/

-- ============================================================
-- 1. VTT Model Core Functions
-- ============================================================

CREATE OR REPLACE FUNCTION fn_vtt_critical_rh(p_temperature_c numeric)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_rh_crit numeric;
BEGIN
  IF p_temperature_c < 0 OR p_temperature_c > 50 THEN
    RETURN 100.0;
  END IF;

  v_rh_crit := -0.00267 * POWER(p_temperature_c, 3)
              + 0.160 * POWER(p_temperature_c, 2)
              - 3.13 * p_temperature_c
              + 100.0;

  RETURN GREATEST(65.0, LEAST(100.0, v_rh_crit));
END;
$$;

CREATE OR REPLACE FUNCTION fn_vtt_mold_index_to_risk_level(p_index numeric)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_index < 0.5 THEN RETURN 'low'; END IF;
  IF p_index < 1.5 THEN RETURN 'moderate'; END IF;
  IF p_index < 3.0 THEN RETURN 'elevated'; END IF;
  IF p_index < 5.0 THEN RETURN 'high'; END IF;
  RETURN 'critical';
END;
$$;

CREATE OR REPLACE FUNCTION fn_vtt_growth_rate_per_hour(
  p_temperature_c numeric,
  p_rh numeric,
  p_current_index numeric
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_rh_crit numeric;
  v_rh_excess numeric;
  v_temp_factor numeric;
  v_rh_factor numeric;
  v_index_factor numeric;
  v_rate numeric;
BEGIN
  IF p_temperature_c < 0 OR p_temperature_c > 50 THEN
    RETURN 0.0;
  END IF;

  v_rh_crit := fn_vtt_critical_rh(p_temperature_c);
  v_rh_excess := p_rh - v_rh_crit;

  IF v_rh_excess <= 0 THEN
    IF p_current_index > 0 THEN
      RETURN -0.001;
    END IF;
    RETURN 0.0;
  END IF;

  v_temp_factor := CASE
    WHEN p_temperature_c BETWEEN 20 AND 30 THEN 1.0
    WHEN p_temperature_c BETWEEN 15 AND 20 THEN 0.5 + (p_temperature_c - 15) * 0.1
    WHEN p_temperature_c BETWEEN 30 AND 40 THEN 1.0 - (p_temperature_c - 30) * 0.08
    WHEN p_temperature_c BETWEEN 5 AND 15 THEN 0.1 + (p_temperature_c - 5) * 0.04
    ELSE 0.05
  END;

  v_rh_factor := LEAST(1.0, v_rh_excess / 20.0);

  v_index_factor := CASE
    WHEN p_current_index < 1.0 THEN 1.0
    WHEN p_current_index < 3.0 THEN 0.8
    WHEN p_current_index < 5.0 THEN 0.5
    ELSE 0.2
  END;

  v_rate := 0.015 * v_temp_factor * v_rh_factor * v_index_factor;

  RETURN GREATEST(-0.005, LEAST(0.1, v_rate));
END;
$$;

CREATE OR REPLACE FUNCTION fn_vtt_forecast_index(
  p_current_index numeric,
  p_temperature_c numeric,
  p_rh numeric,
  p_hours_ahead numeric
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_index numeric;
  v_step_hours numeric := 1.0;
  v_elapsed numeric := 0;
  v_rate numeric;
BEGIN
  v_index := COALESCE(p_current_index, 0);

  WHILE v_elapsed < p_hours_ahead LOOP
    v_rate := fn_vtt_growth_rate_per_hour(p_temperature_c, p_rh, v_index);
    v_index := v_index + (v_rate * v_step_hours);
    v_index := GREATEST(0, LEAST(6.0, v_index));
    v_elapsed := v_elapsed + v_step_hours;
  END LOOP;

  RETURN ROUND(v_index, 3);
END;
$$;

-- ============================================================
-- 2. Risk State Table
-- ============================================================

CREATE TABLE IF NOT EXISTS device_vtt_risk_state (
  device_id uuid PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
  company_id uuid,
  site_id uuid,
  vtt_mold_index numeric(6,3) DEFAULT 0,
  vtt_risk_level text DEFAULT 'low',
  latest_temperature_c numeric(6,2),
  latest_humidity numeric(6,2),
  rh_critical numeric(6,2),
  rh_excess numeric(6,2),
  growth_favorability numeric(4,3) DEFAULT 0,
  forecast_24h_index numeric(6,3),
  forecast_48h_index numeric(6,3),
  forecast_72h_index numeric(6,3),
  forecast_24h_risk text,
  forecast_48h_risk text,
  forecast_72h_risk text,
  hours_to_next_level numeric(7,1),
  last_calculated_at timestamptz DEFAULT now(),
  calculation_inputs jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE device_vtt_risk_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view VTT risk for their company devices"
  ON device_vtt_risk_state
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "System can insert VTT risk state"
  ON device_vtt_risk_state
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update VTT risk state"
  ON device_vtt_risk_state
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 3. Full Risk Calculation Function
-- ============================================================

CREATE OR REPLACE FUNCTION fn_calculate_device_vtt_risk(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_device record;
  v_telemetry record;
  v_temp_c numeric;
  v_humidity numeric;
  v_rh_crit numeric;
  v_rh_excess numeric;
  v_favorability numeric;
  v_current_index numeric;
  v_risk_level text;
  v_forecast_24h numeric;
  v_forecast_48h numeric;
  v_forecast_72h numeric;
  v_hours_to_next numeric;
  v_next_threshold numeric;
  v_rate numeric;
  v_result jsonb;
BEGIN
  SELECT d.device_id, d.company_id, d.site_id
  INTO v_device
  FROM devices d
  WHERE d.device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Device not found');
  END IF;

  SELECT di.temperature, di.humidity
  INTO v_telemetry
  FROM device_images di
  WHERE di.device_id = p_device_id
    AND di.temperature IS NOT NULL
    AND di.humidity IS NOT NULL
  ORDER BY di.captured_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT dt.temperature, dt.humidity
    INTO v_telemetry
    FROM device_telemetry dt
    WHERE dt.device_id = p_device_id
      AND dt.temperature IS NOT NULL
      AND dt.humidity IS NOT NULL
    ORDER BY dt.captured_at DESC
    LIMIT 1;
  END IF;

  IF v_telemetry IS NULL OR v_telemetry.temperature IS NULL THEN
    RETURN jsonb_build_object('error', 'No telemetry data available');
  END IF;

  v_temp_c := (v_telemetry.temperature - 32.0) * 5.0 / 9.0;
  v_humidity := v_telemetry.humidity;

  v_rh_crit := fn_vtt_critical_rh(v_temp_c);
  v_rh_excess := v_humidity - v_rh_crit;

  IF v_rh_excess > 0 THEN
    v_favorability := LEAST(1.0, v_rh_excess / 25.0) *
      CASE
        WHEN v_temp_c BETWEEN 20 AND 30 THEN 1.0
        WHEN v_temp_c BETWEEN 15 AND 35 THEN 0.7
        WHEN v_temp_c BETWEEN 5 AND 40 THEN 0.4
        ELSE 0.1
      END;
  ELSE
    v_favorability := 0;
  END IF;

  SELECT COALESCE(vrs.vtt_mold_index, 0)
  INTO v_current_index
  FROM device_vtt_risk_state vrs
  WHERE vrs.device_id = p_device_id;

  IF NOT FOUND THEN
    v_current_index := 0;
  END IF;

  v_rate := fn_vtt_growth_rate_per_hour(v_temp_c, v_humidity, v_current_index);

  IF v_rate > 0 THEN
    v_current_index := GREATEST(0, LEAST(6.0,
      v_current_index + v_rate * 1.0
    ));
  ELSIF v_rate < 0 THEN
    v_current_index := GREATEST(0, v_current_index + v_rate * 1.0);
  END IF;

  v_risk_level := fn_vtt_mold_index_to_risk_level(v_current_index);

  v_forecast_24h := fn_vtt_forecast_index(v_current_index, v_temp_c, v_humidity, 24);
  v_forecast_48h := fn_vtt_forecast_index(v_current_index, v_temp_c, v_humidity, 48);
  v_forecast_72h := fn_vtt_forecast_index(v_current_index, v_temp_c, v_humidity, 72);

  v_hours_to_next := NULL;
  IF v_rate > 0.0001 THEN
    v_next_threshold := CASE
      WHEN v_current_index < 0.5 THEN 0.5
      WHEN v_current_index < 1.5 THEN 1.5
      WHEN v_current_index < 3.0 THEN 3.0
      WHEN v_current_index < 5.0 THEN 5.0
      ELSE NULL
    END;
    IF v_next_threshold IS NOT NULL THEN
      v_hours_to_next := ROUND((v_next_threshold - v_current_index) / v_rate, 1);
    END IF;
  END IF;

  INSERT INTO device_vtt_risk_state (
    device_id, company_id, site_id,
    vtt_mold_index, vtt_risk_level,
    latest_temperature_c, latest_humidity,
    rh_critical, rh_excess, growth_favorability,
    forecast_24h_index, forecast_48h_index, forecast_72h_index,
    forecast_24h_risk, forecast_48h_risk, forecast_72h_risk,
    hours_to_next_level,
    last_calculated_at, calculation_inputs, updated_at
  )
  VALUES (
    p_device_id, v_device.company_id, v_device.site_id,
    ROUND(v_current_index, 3), v_risk_level,
    ROUND(v_temp_c, 2), ROUND(v_humidity, 2),
    ROUND(v_rh_crit, 2), ROUND(v_rh_excess, 2), ROUND(v_favorability, 3),
    v_forecast_24h, v_forecast_48h, v_forecast_72h,
    fn_vtt_mold_index_to_risk_level(v_forecast_24h),
    fn_vtt_mold_index_to_risk_level(v_forecast_48h),
    fn_vtt_mold_index_to_risk_level(v_forecast_72h),
    v_hours_to_next,
    now(),
    jsonb_build_object(
      'temperature_f', v_telemetry.temperature,
      'temperature_c', ROUND(v_temp_c, 2),
      'humidity', ROUND(v_humidity, 2),
      'rh_critical', ROUND(v_rh_crit, 2),
      'growth_rate_per_hour', ROUND(v_rate, 6)
    ),
    now()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    site_id = EXCLUDED.site_id,
    vtt_mold_index = EXCLUDED.vtt_mold_index,
    vtt_risk_level = EXCLUDED.vtt_risk_level,
    latest_temperature_c = EXCLUDED.latest_temperature_c,
    latest_humidity = EXCLUDED.latest_humidity,
    rh_critical = EXCLUDED.rh_critical,
    rh_excess = EXCLUDED.rh_excess,
    growth_favorability = EXCLUDED.growth_favorability,
    forecast_24h_index = EXCLUDED.forecast_24h_index,
    forecast_48h_index = EXCLUDED.forecast_48h_index,
    forecast_72h_index = EXCLUDED.forecast_72h_index,
    forecast_24h_risk = EXCLUDED.forecast_24h_risk,
    forecast_48h_risk = EXCLUDED.forecast_48h_risk,
    forecast_72h_risk = EXCLUDED.forecast_72h_risk,
    hours_to_next_level = EXCLUDED.hours_to_next_level,
    last_calculated_at = EXCLUDED.last_calculated_at,
    calculation_inputs = EXCLUDED.calculation_inputs,
    updated_at = EXCLUDED.updated_at;

  v_result := jsonb_build_object(
    'device_id', p_device_id,
    'vtt_mold_index', ROUND(v_current_index, 3),
    'vtt_risk_level', v_risk_level,
    'growth_favorability', ROUND(v_favorability, 3),
    'rh_critical', ROUND(v_rh_crit, 2),
    'rh_excess', ROUND(v_rh_excess, 2),
    'forecast_24h', jsonb_build_object('index', v_forecast_24h, 'risk', fn_vtt_mold_index_to_risk_level(v_forecast_24h)),
    'forecast_48h', jsonb_build_object('index', v_forecast_48h, 'risk', fn_vtt_mold_index_to_risk_level(v_forecast_48h)),
    'forecast_72h', jsonb_build_object('index', v_forecast_72h, 'risk', fn_vtt_mold_index_to_risk_level(v_forecast_72h)),
    'hours_to_next_level', v_hours_to_next
  );

  RETURN v_result;
END;
$$;

-- ============================================================
-- 4. Trigger to auto-calculate VTT risk on new telemetry
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_vtt_risk_on_telemetry()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.temperature IS NOT NULL AND NEW.humidity IS NOT NULL THEN
    PERFORM fn_calculate_device_vtt_risk(NEW.device_id);
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vtt_risk_on_device_images'
  ) THEN
    CREATE TRIGGER trg_vtt_risk_on_device_images
      AFTER INSERT ON device_images
      FOR EACH ROW
      EXECUTE FUNCTION fn_update_vtt_risk_on_telemetry();
  END IF;
END $$;

-- ============================================================
-- 5. RPC function for site-level risk summary
-- ============================================================

CREATE OR REPLACE FUNCTION fn_get_site_vtt_risk_summary(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'site_id', p_site_id,
    'device_count', COUNT(*),
    'avg_mold_index', ROUND(AVG(vtt_mold_index), 3),
    'max_mold_index', ROUND(MAX(vtt_mold_index), 3),
    'avg_growth_favorability', ROUND(AVG(growth_favorability), 3),
    'max_growth_favorability', ROUND(MAX(growth_favorability), 3),
    'worst_risk_level', (
      SELECT vtt_risk_level FROM device_vtt_risk_state
      WHERE site_id = p_site_id
      ORDER BY vtt_mold_index DESC LIMIT 1
    ),
    'avg_rh_excess', ROUND(AVG(rh_excess), 2),
    'devices_above_critical_rh', COUNT(*) FILTER (WHERE rh_excess > 0),
    'worst_24h_forecast', (
      SELECT forecast_24h_risk FROM device_vtt_risk_state
      WHERE site_id = p_site_id
      ORDER BY forecast_24h_index DESC LIMIT 1
    ),
    'worst_72h_forecast', (
      SELECT forecast_72h_risk FROM device_vtt_risk_state
      WHERE site_id = p_site_id
      ORDER BY forecast_72h_index DESC LIMIT 1
    ),
    'min_hours_to_escalation', MIN(hours_to_next_level),
    'last_calculated_at', MAX(last_calculated_at),
    'devices', (
      SELECT jsonb_agg(jsonb_build_object(
        'device_id', r.device_id,
        'vtt_mold_index', r.vtt_mold_index,
        'vtt_risk_level', r.vtt_risk_level,
        'growth_favorability', r.growth_favorability,
        'rh_excess', r.rh_excess,
        'forecast_24h_risk', r.forecast_24h_risk,
        'hours_to_next_level', r.hours_to_next_level
      ) ORDER BY r.vtt_mold_index DESC)
      FROM device_vtt_risk_state r
      WHERE r.site_id = p_site_id
    )
  )
  INTO v_result
  FROM device_vtt_risk_state
  WHERE site_id = p_site_id;

  RETURN COALESCE(v_result, jsonb_build_object('site_id', p_site_id, 'device_count', 0));
END;
$$;

-- ============================================================
-- 6. Index for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_device_vtt_risk_site
  ON device_vtt_risk_state(site_id);

CREATE INDEX IF NOT EXISTS idx_device_vtt_risk_company
  ON device_vtt_risk_state(company_id);

CREATE INDEX IF NOT EXISTS idx_device_vtt_risk_level
  ON device_vtt_risk_state(vtt_risk_level);
