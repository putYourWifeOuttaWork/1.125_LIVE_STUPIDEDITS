/*
  # Alert Detection Functions

  1. Detection Functions
    - check_absolute_thresholds() - Check temp/RH/MGI absolute limits
    - check_intra_session_shifts() - Check temp/RH shifts within day
    - check_combination_zones() - Check Temp+RH danger zones
    - check_mgi_velocity() - Check day-to-day MGI growth
    - check_mgi_program_speed() - Check average MGI speed over program

  2. Alert Creation Function
    - create_device_alert() - Unified alert creation with full routing context

  3. Trigger Integration Points
    - Called from MQTT handler on telemetry arrival
    - Called from MGI scoring on score update
    - Scheduled batch processing for program speed

  SECURITY: All functions use SECURITY DEFINER for system-level alert creation
*/

-- ============================================
-- 1. UNIFIED ALERT CREATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.create_device_alert(
  p_device_id uuid,
  p_alert_type text,
  p_alert_category text,
  p_severity text,
  p_message text,
  p_actual_value numeric DEFAULT NULL,
  p_threshold_value numeric DEFAULT NULL,
  p_threshold_context jsonb DEFAULT '{}'::jsonb,
  p_measurement_timestamp timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
  v_device_record record;
BEGIN
  -- Get device routing context
  SELECT
    d.device_id,
    d.device_code,
    d.device_name,
    COALESCE(d.zone_label, 'Unknown') as zone_label,
    COALESCE(
      (d.placement_json->>'x') || ',' || (d.placement_json->>'y'),
      'No coords'
    ) as device_coords,
    d.site_id,
    s.name as site_name,
    d.program_id,
    p.name as program_name,
    p.company_id,
    c.name as company_name
  INTO v_device_record
  FROM public.devices d
  LEFT JOIN public.sites s ON s.site_id = d.site_id
  LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
  LEFT JOIN public.companies c ON c.company_id = p.company_id
  WHERE d.device_id = p_device_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device % not found', p_device_id;
  END IF;

  -- Check if similar alert already exists (avoid duplicates within 5 minutes)
  SELECT alert_id INTO v_alert_id
  FROM public.device_alerts
  WHERE device_id = p_device_id
  AND alert_type = p_alert_type
  AND alert_category = p_alert_category
  AND resolved_at IS NULL
  AND triggered_at > (now() - interval '5 minutes')
  LIMIT 1;

  IF v_alert_id IS NOT NULL THEN
    -- Update existing alert with new measurement
    UPDATE public.device_alerts
    SET
      actual_value = p_actual_value,
      threshold_value = p_threshold_value,
      threshold_context = p_threshold_context,
      measurement_timestamp = p_measurement_timestamp,
      updated_at = now()
    WHERE alert_id = v_alert_id;

    RETURN v_alert_id;
  END IF;

  -- Create new alert with full routing context
  INSERT INTO public.device_alerts (
    device_id,
    alert_type,
    alert_category,
    severity,
    message,
    actual_value,
    threshold_value,
    threshold_context,
    measurement_timestamp,
    device_coords,
    zone_label,
    site_id,
    site_name,
    program_id,
    program_name,
    company_id,
    company_name,
    metadata
  ) VALUES (
    p_device_id,
    p_alert_type,
    p_alert_category,
    p_severity,
    p_message,
    p_actual_value,
    p_threshold_value,
    p_threshold_context,
    p_measurement_timestamp,
    v_device_record.device_coords,
    v_device_record.zone_label,
    v_device_record.site_id,
    v_device_record.site_name,
    v_device_record.program_id,
    v_device_record.program_name,
    v_device_record.company_id,
    v_device_record.company_name,
    jsonb_build_object(
      'device_code', v_device_record.device_code,
      'device_name', v_device_record.device_name
    )
  )
  RETURNING alert_id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

COMMENT ON FUNCTION public.create_device_alert IS 'Creates device alert with full routing context (zone/site/program/company)';

-- ============================================
-- 2. CHECK ABSOLUTE THRESHOLDS
-- ============================================

CREATE OR REPLACE FUNCTION public.check_absolute_thresholds(
  p_device_id uuid,
  p_temperature numeric DEFAULT NULL,
  p_humidity numeric DEFAULT NULL,
  p_mgi numeric DEFAULT NULL,
  p_measurement_timestamp timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thresholds jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_alert_id uuid;
BEGIN
  -- Get effective thresholds for device
  v_thresholds := public.get_device_alert_thresholds(p_device_id);

  IF v_thresholds = '{}'::jsonb THEN
    RETURN v_alerts;
  END IF;

  -- Check temperature thresholds
  IF p_temperature IS NOT NULL THEN
    -- Critical high
    IF p_temperature >= (v_thresholds->>'temp_max_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'temp_max_critical',
        'absolute',
        'critical',
        format('Temperature critically high: %s°F (threshold: %s°F)',
          p_temperature, v_thresholds->>'temp_max_critical'),
        p_temperature,
        (v_thresholds->>'temp_max_critical')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'max_critical'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_max_critical');

    -- Warning high
    ELSIF p_temperature >= (v_thresholds->>'temp_max_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'temp_max_warning',
        'absolute',
        'warning',
        format('Temperature high: %s°F (threshold: %s°F)',
          p_temperature, v_thresholds->>'temp_max_warning'),
        p_temperature,
        (v_thresholds->>'temp_max_warning')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'max_warning'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_max_warning');
    END IF;

    -- Critical low
    IF p_temperature <= (v_thresholds->>'temp_min_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'temp_min_critical',
        'absolute',
        'critical',
        format('Temperature critically low: %s°F (threshold: %s°F)',
          p_temperature, v_thresholds->>'temp_min_critical'),
        p_temperature,
        (v_thresholds->>'temp_min_critical')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'min_critical'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_min_critical');

    -- Warning low
    ELSIF p_temperature <= (v_thresholds->>'temp_min_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'temp_min_warning',
        'absolute',
        'warning',
        format('Temperature low: %s°F (threshold: %s°F)',
          p_temperature, v_thresholds->>'temp_min_warning'),
        p_temperature,
        (v_thresholds->>'temp_min_warning')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'min_warning'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_min_warning');
    END IF;
  END IF;

  -- Check humidity thresholds
  IF p_humidity IS NOT NULL THEN
    -- Critical high
    IF p_humidity >= (v_thresholds->>'rh_max_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'rh_max_critical',
        'absolute',
        'critical',
        format('Humidity critically high: %s%% (threshold: %s%%)',
          p_humidity, v_thresholds->>'rh_max_critical'),
        p_humidity,
        (v_thresholds->>'rh_max_critical')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'max_critical'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_max_critical');

    -- Warning high
    ELSIF p_humidity >= (v_thresholds->>'rh_max_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'rh_max_warning',
        'absolute',
        'warning',
        format('Humidity high: %s%% (threshold: %s%%)',
          p_humidity, v_thresholds->>'rh_max_warning'),
        p_humidity,
        (v_thresholds->>'rh_max_warning')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'max_warning'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_max_warning');
    END IF;

    -- Critical low
    IF p_humidity <= (v_thresholds->>'rh_min_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'rh_min_critical',
        'absolute',
        'critical',
        format('Humidity critically low: %s%% (threshold: %s%%)',
          p_humidity, v_thresholds->>'rh_min_critical'),
        p_humidity,
        (v_thresholds->>'rh_min_critical')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'min_critical'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_min_critical');

    -- Warning low
    ELSIF p_humidity <= (v_thresholds->>'rh_min_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'rh_min_warning',
        'absolute',
        'warning',
        format('Humidity low: %s%% (threshold: %s%%)',
          p_humidity, v_thresholds->>'rh_min_warning'),
        p_humidity,
        (v_thresholds->>'rh_min_warning')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'min_warning'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_min_warning');
    END IF;
  END IF;

  -- Check MGI thresholds
  IF p_mgi IS NOT NULL THEN
    -- Critical high
    IF p_mgi >= (v_thresholds->>'mgi_max_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_max_critical',
        'absolute',
        'critical',
        format('MGI critically high: %s%% (threshold: %s%%)',
          p_mgi, v_thresholds->>'mgi_max_critical'),
        p_mgi,
        (v_thresholds->>'mgi_max_critical')::numeric,
        jsonb_build_object('metric', 'mgi', 'type', 'max_critical'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_max_critical');

    -- Warning high
    ELSIF p_mgi >= (v_thresholds->>'mgi_max_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_max_warning',
        'absolute',
        'warning',
        format('MGI high: %s%% (threshold: %s%%)',
          p_mgi, v_thresholds->>'mgi_max_warning'),
        p_mgi,
        (v_thresholds->>'mgi_max_warning')::numeric,
        jsonb_build_object('metric', 'mgi', 'type', 'max_warning'),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_max_warning');
    END IF;
  END IF;

  RETURN v_alerts;
END;
$$;

COMMENT ON FUNCTION public.check_absolute_thresholds IS 'Check temperature, humidity, and MGI against absolute thresholds';

-- ============================================
-- 3. CHECK COMBINATION ZONES (Temp + RH)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_combination_zones(
  p_device_id uuid,
  p_temperature numeric,
  p_humidity numeric,
  p_measurement_timestamp timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thresholds jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_alert_id uuid;
  v_combo_warning jsonb;
  v_combo_critical jsonb;
BEGIN
  -- Get effective thresholds
  v_thresholds := public.get_device_alert_thresholds(p_device_id);

  IF v_thresholds = '{}'::jsonb THEN
    RETURN v_alerts;
  END IF;

  v_combo_warning := v_thresholds->'combo_zone_warning';
  v_combo_critical := v_thresholds->'combo_zone_critical';

  -- Check critical combination zone
  IF p_temperature >= (v_combo_critical->>'temp_threshold')::numeric
     AND p_humidity >= (v_combo_critical->>'rh_threshold')::numeric THEN
    v_alert_id := public.create_device_alert(
      p_device_id,
      'combo_zone_critical',
      'combination',
      'critical',
      format('CRITICAL DANGER ZONE: Temp %s°F and Humidity %s%% (threshold: >%s°F AND >%s%%)',
        p_temperature, p_humidity,
        v_combo_critical->>'temp_threshold',
        v_combo_critical->>'rh_threshold'),
      NULL, -- No single actual value for combination
      NULL,
      jsonb_build_object(
        'temperature', p_temperature,
        'humidity', p_humidity,
        'temp_threshold', (v_combo_critical->>'temp_threshold')::numeric,
        'rh_threshold', (v_combo_critical->>'rh_threshold')::numeric
      ),
      p_measurement_timestamp
    );
    v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'combo_zone_critical');

  -- Check warning combination zone
  ELSIF p_temperature >= (v_combo_warning->>'temp_threshold')::numeric
        AND p_humidity >= (v_combo_warning->>'rh_threshold')::numeric THEN
    v_alert_id := public.create_device_alert(
      p_device_id,
      'combo_zone_warning',
      'combination',
      'warning',
      format('Danger zone: Temp %s°F and Humidity %s%% (threshold: >%s°F AND >%s%%)',
        p_temperature, p_humidity,
        v_combo_warning->>'temp_threshold',
        v_combo_warning->>'rh_threshold'),
      NULL,
      NULL,
      jsonb_build_object(
        'temperature', p_temperature,
        'humidity', p_humidity,
        'temp_threshold', (v_combo_warning->>'temp_threshold')::numeric,
        'rh_threshold', (v_combo_warning->>'rh_threshold')::numeric
      ),
      p_measurement_timestamp
    );
    v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'combo_zone_warning');
  END IF;

  RETURN v_alerts;
END;
$$;

COMMENT ON FUNCTION public.check_combination_zones IS 'Check if Temp+RH combination enters danger zones';

-- ============================================
-- 4. CHECK INTRA-SESSION SHIFTS
-- ============================================

CREATE OR REPLACE FUNCTION public.check_intra_session_shifts(
  p_device_id uuid,
  p_temperature numeric DEFAULT NULL,
  p_humidity numeric DEFAULT NULL,
  p_measurement_timestamp timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thresholds jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_alert_id uuid;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_min_temp numeric;
  v_max_temp numeric;
  v_min_humidity numeric;
  v_max_humidity numeric;
  v_temp_shift numeric;
  v_humidity_shift numeric;
BEGIN
  -- Get effective thresholds
  v_thresholds := public.get_device_alert_thresholds(p_device_id);

  IF v_thresholds = '{}'::jsonb THEN
    RETURN v_alerts;
  END IF;

  -- Define "today" in device's timezone (assume UTC for now, can enhance later)
  v_today_start := date_trunc('day', p_measurement_timestamp);
  v_today_end := v_today_start + interval '1 day';

  -- Get min/max temperature for today (including current reading)
  SELECT
    LEAST(MIN(temperature), p_temperature),
    GREATEST(MAX(temperature), p_temperature)
  INTO v_min_temp, v_max_temp
  FROM public.device_telemetry
  WHERE device_id = p_device_id
  AND captured_at >= v_today_start
  AND captured_at < v_today_end
  AND temperature IS NOT NULL;

  -- Get min/max humidity for today (including current reading)
  SELECT
    LEAST(MIN(humidity), p_humidity),
    GREATEST(MAX(humidity), p_humidity)
  INTO v_min_humidity, v_max_humidity
  FROM public.device_telemetry
  WHERE device_id = p_device_id
  AND captured_at >= v_today_start
  AND captured_at < v_today_end
  AND humidity IS NOT NULL;

  -- Check temperature shift
  IF v_min_temp IS NOT NULL AND v_max_temp IS NOT NULL THEN
    v_temp_shift := v_max_temp - v_min_temp;

    -- Check if shift exceeds max allowed
    IF v_temp_shift >= (v_thresholds->>'temp_shift_max_per_session')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'temp_shift_max',
        'shift',
        'warning',
        format('Temperature shift +%s°F within session (threshold: +%s°F)',
          v_temp_shift, v_thresholds->>'temp_shift_max_per_session'),
        v_temp_shift,
        (v_thresholds->>'temp_shift_max_per_session')::numeric,
        jsonb_build_object(
          'min_temp', v_min_temp,
          'max_temp', v_max_temp,
          'shift', v_temp_shift,
          'session_start', v_today_start
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_shift_max');
    END IF;

    -- Check for excessive drop (shift_min is negative, e.g., -25)
    IF -v_temp_shift <= (v_thresholds->>'temp_shift_min_per_session')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'temp_shift_min',
        'shift',
        'warning',
        format('Temperature drop -%s°F within session (threshold: %s°F)',
          v_temp_shift, v_thresholds->>'temp_shift_min_per_session'),
        -v_temp_shift,
        (v_thresholds->>'temp_shift_min_per_session')::numeric,
        jsonb_build_object(
          'min_temp', v_min_temp,
          'max_temp', v_max_temp,
          'shift', -v_temp_shift,
          'session_start', v_today_start
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_shift_min');
    END IF;
  END IF;

  -- Check humidity shift
  IF v_min_humidity IS NOT NULL AND v_max_humidity IS NOT NULL THEN
    v_humidity_shift := v_max_humidity - v_min_humidity;

    -- Check if shift exceeds max allowed
    IF v_humidity_shift >= (v_thresholds->>'rh_shift_max_per_session')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'rh_shift_max',
        'shift',
        'warning',
        format('Humidity shift +%s%% within session (threshold: +%s%%)',
          v_humidity_shift, v_thresholds->>'rh_shift_max_per_session'),
        v_humidity_shift,
        (v_thresholds->>'rh_shift_max_per_session')::numeric,
        jsonb_build_object(
          'min_humidity', v_min_humidity,
          'max_humidity', v_max_humidity,
          'shift', v_humidity_shift,
          'session_start', v_today_start
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_shift_max');
    END IF;
  END IF;

  RETURN v_alerts;
END;
$$;

COMMENT ON FUNCTION public.check_intra_session_shifts IS 'Check for excessive temperature or humidity shifts within a single session/day';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Alert detection functions created successfully';
  RAISE NOTICE '   - create_device_alert() with full routing context';
  RAISE NOTICE '   - check_absolute_thresholds() for temp/RH/MGI';
  RAISE NOTICE '   - check_combination_zones() for Temp+RH danger zones';
  RAISE NOTICE '   - check_intra_session_shifts() for within-day changes';
  RAISE NOTICE '   - Ready for MQTT handler integration';
END $$;
