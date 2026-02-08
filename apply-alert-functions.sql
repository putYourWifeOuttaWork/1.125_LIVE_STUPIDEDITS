/*
  # Ensure Alert Detection Functions Exist

  Run this SQL in your Supabase SQL Editor to deploy all alert detection functions.
  All functions use CREATE OR REPLACE so this is safe to run multiple times.

  Functions: get_device_alert_thresholds, create_device_alert,
  check_absolute_thresholds, check_combination_zones, check_intra_session_shifts,
  check_mgi_velocity, check_mgi_program_speed, calculate_all_mgi_program_speeds
*/

CREATE OR REPLACE FUNCTION public.get_device_alert_thresholds(p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_device_config jsonb; v_company_config jsonb; v_company_id uuid;
BEGIN
  SELECT d.company_id INTO v_company_id FROM public.devices d WHERE d.device_id = p_device_id;
  IF v_company_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT row_to_json(t)::jsonb INTO v_device_config
  FROM public.device_alert_thresholds t WHERE t.device_id = p_device_id AND t.is_active = true LIMIT 1;

  SELECT row_to_json(t)::jsonb INTO v_company_config
  FROM public.device_alert_thresholds t WHERE t.company_id = v_company_id AND t.device_id IS NULL AND t.is_active = true LIMIT 1;

  RETURN COALESCE(v_device_config, v_company_config, '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.create_device_alert(
  p_device_id uuid, p_alert_type text, p_alert_category text, p_severity text, p_message text,
  p_actual_value numeric DEFAULT NULL, p_threshold_value numeric DEFAULT NULL,
  p_threshold_context jsonb DEFAULT '{}'::jsonb, p_measurement_timestamp timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_alert_id uuid; v_device_record record;
BEGIN
  SELECT d.device_id, d.device_code, d.device_name,
    COALESCE(d.zone_label, 'Unknown') as zone_label,
    COALESCE((d.placement_json->>'x')||','||(d.placement_json->>'y'), 'No coords') as device_coords,
    d.site_id, s.name as site_name, d.program_id, p.name as program_name,
    p.company_id, c.name as company_name
  INTO v_device_record
  FROM public.devices d
  LEFT JOIN public.sites s ON s.site_id = d.site_id
  LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
  LEFT JOIN public.companies c ON c.company_id = p.company_id
  WHERE d.device_id = p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Device % not found', p_device_id; END IF;

  SELECT alert_id INTO v_alert_id FROM public.device_alerts
  WHERE device_id = p_device_id AND alert_type = p_alert_type AND alert_category = p_alert_category
  AND resolved_at IS NULL AND triggered_at > (now() - interval '5 minutes') LIMIT 1;

  IF v_alert_id IS NOT NULL THEN
    UPDATE public.device_alerts SET actual_value = p_actual_value, threshold_value = p_threshold_value,
      threshold_context = p_threshold_context, measurement_timestamp = p_measurement_timestamp, updated_at = now()
    WHERE alert_id = v_alert_id;
    RETURN v_alert_id;
  END IF;

  INSERT INTO public.device_alerts (device_id, alert_type, alert_category, severity, message,
    actual_value, threshold_value, threshold_context, measurement_timestamp,
    device_coords, zone_label, site_id, site_name, program_id, program_name, company_id, company_name, metadata)
  VALUES (p_device_id, p_alert_type, p_alert_category, p_severity, p_message,
    p_actual_value, p_threshold_value, p_threshold_context, p_measurement_timestamp,
    v_device_record.device_coords, v_device_record.zone_label,
    v_device_record.site_id, v_device_record.site_name,
    v_device_record.program_id, v_device_record.program_name,
    v_device_record.company_id, v_device_record.company_name,
    jsonb_build_object('device_code', v_device_record.device_code, 'device_name', v_device_record.device_name))
  RETURNING alert_id INTO v_alert_id;
  RETURN v_alert_id;
END; $$;

CREATE OR REPLACE FUNCTION public.check_absolute_thresholds(
  p_device_id uuid, p_temperature numeric DEFAULT NULL, p_humidity numeric DEFAULT NULL,
  p_mgi numeric DEFAULT NULL, p_measurement_timestamp timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_thresholds jsonb; v_alerts jsonb := '[]'::jsonb; v_alert_id uuid;
BEGIN
  v_thresholds := public.get_device_alert_thresholds(p_device_id);
  IF v_thresholds = '{}'::jsonb THEN RETURN v_alerts; END IF;

  IF p_temperature IS NOT NULL THEN
    IF p_temperature >= (v_thresholds->>'temp_max_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'temp_max_critical', 'absolute', 'critical',
        format('Temperature critically high: %s F (threshold: %s F)', p_temperature, v_thresholds->>'temp_max_critical'),
        p_temperature, (v_thresholds->>'temp_max_critical')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'max_critical'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_max_critical');
    ELSIF p_temperature >= (v_thresholds->>'temp_max_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'temp_max_warning', 'absolute', 'warning',
        format('Temperature high: %s F (threshold: %s F)', p_temperature, v_thresholds->>'temp_max_warning'),
        p_temperature, (v_thresholds->>'temp_max_warning')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'max_warning'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_max_warning');
    END IF;
    IF p_temperature <= (v_thresholds->>'temp_min_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'temp_min_critical', 'absolute', 'critical',
        format('Temperature critically low: %s F (threshold: %s F)', p_temperature, v_thresholds->>'temp_min_critical'),
        p_temperature, (v_thresholds->>'temp_min_critical')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'min_critical'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_min_critical');
    ELSIF p_temperature <= (v_thresholds->>'temp_min_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'temp_min_warning', 'absolute', 'warning',
        format('Temperature low: %s F (threshold: %s F)', p_temperature, v_thresholds->>'temp_min_warning'),
        p_temperature, (v_thresholds->>'temp_min_warning')::numeric,
        jsonb_build_object('metric', 'temperature', 'type', 'min_warning'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_min_warning');
    END IF;
  END IF;

  IF p_humidity IS NOT NULL THEN
    IF p_humidity >= (v_thresholds->>'rh_max_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'rh_max_critical', 'absolute', 'critical',
        format('Humidity critically high: %s%% (threshold: %s%%)', p_humidity, v_thresholds->>'rh_max_critical'),
        p_humidity, (v_thresholds->>'rh_max_critical')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'max_critical'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_max_critical');
    ELSIF p_humidity >= (v_thresholds->>'rh_max_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'rh_max_warning', 'absolute', 'warning',
        format('Humidity high: %s%% (threshold: %s%%)', p_humidity, v_thresholds->>'rh_max_warning'),
        p_humidity, (v_thresholds->>'rh_max_warning')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'max_warning'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_max_warning');
    END IF;
    IF p_humidity <= (v_thresholds->>'rh_min_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'rh_min_critical', 'absolute', 'critical',
        format('Humidity critically low: %s%% (threshold: %s%%)', p_humidity, v_thresholds->>'rh_min_critical'),
        p_humidity, (v_thresholds->>'rh_min_critical')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'min_critical'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_min_critical');
    ELSIF p_humidity <= (v_thresholds->>'rh_min_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'rh_min_warning', 'absolute', 'warning',
        format('Humidity low: %s%% (threshold: %s%%)', p_humidity, v_thresholds->>'rh_min_warning'),
        p_humidity, (v_thresholds->>'rh_min_warning')::numeric,
        jsonb_build_object('metric', 'humidity', 'type', 'min_warning'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_min_warning');
    END IF;
  END IF;

  IF p_mgi IS NOT NULL THEN
    IF p_mgi >= (v_thresholds->>'mgi_max_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_max_critical', 'absolute', 'critical',
        format('MGI critically high: %s%% (threshold: %s%%)', p_mgi, v_thresholds->>'mgi_max_critical'),
        p_mgi, (v_thresholds->>'mgi_max_critical')::numeric,
        jsonb_build_object('metric', 'mgi', 'type', 'max_critical'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_max_critical');
    ELSIF p_mgi >= (v_thresholds->>'mgi_max_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_max_warning', 'absolute', 'warning',
        format('MGI high: %s%% (threshold: %s%%)', p_mgi, v_thresholds->>'mgi_max_warning'),
        p_mgi, (v_thresholds->>'mgi_max_warning')::numeric,
        jsonb_build_object('metric', 'mgi', 'type', 'max_warning'), p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_max_warning');
    END IF;
  END IF;

  RETURN v_alerts;
END; $$;

CREATE OR REPLACE FUNCTION public.check_combination_zones(
  p_device_id uuid, p_temperature numeric, p_humidity numeric,
  p_measurement_timestamp timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_thresholds jsonb; v_alerts jsonb := '[]'::jsonb; v_alert_id uuid;
  v_combo_warning jsonb; v_combo_critical jsonb;
BEGIN
  v_thresholds := public.get_device_alert_thresholds(p_device_id);
  IF v_thresholds = '{}'::jsonb THEN RETURN v_alerts; END IF;
  v_combo_warning := v_thresholds->'combo_zone_warning';
  v_combo_critical := v_thresholds->'combo_zone_critical';

  IF v_combo_critical IS NOT NULL AND p_temperature >= (v_combo_critical->>'temp_threshold')::numeric
     AND p_humidity >= (v_combo_critical->>'rh_threshold')::numeric THEN
    v_alert_id := public.create_device_alert(p_device_id, 'combo_zone_critical', 'combination', 'critical',
      format('CRITICAL DANGER ZONE: Temp %s F and Humidity %s%% (threshold: >%s F AND >%s%%)',
        p_temperature, p_humidity, v_combo_critical->>'temp_threshold', v_combo_critical->>'rh_threshold'),
      NULL, NULL, jsonb_build_object('temperature', p_temperature, 'humidity', p_humidity,
        'temp_threshold', (v_combo_critical->>'temp_threshold')::numeric, 'rh_threshold', (v_combo_critical->>'rh_threshold')::numeric),
      p_measurement_timestamp);
    v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'combo_zone_critical');
  ELSIF v_combo_warning IS NOT NULL AND p_temperature >= (v_combo_warning->>'temp_threshold')::numeric
        AND p_humidity >= (v_combo_warning->>'rh_threshold')::numeric THEN
    v_alert_id := public.create_device_alert(p_device_id, 'combo_zone_warning', 'combination', 'warning',
      format('Danger zone: Temp %s F and Humidity %s%% (threshold: >%s F AND >%s%%)',
        p_temperature, p_humidity, v_combo_warning->>'temp_threshold', v_combo_warning->>'rh_threshold'),
      NULL, NULL, jsonb_build_object('temperature', p_temperature, 'humidity', p_humidity,
        'temp_threshold', (v_combo_warning->>'temp_threshold')::numeric, 'rh_threshold', (v_combo_warning->>'rh_threshold')::numeric),
      p_measurement_timestamp);
    v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'combo_zone_warning');
  END IF;
  RETURN v_alerts;
END; $$;

CREATE OR REPLACE FUNCTION public.check_intra_session_shifts(
  p_device_id uuid, p_temperature numeric DEFAULT NULL, p_humidity numeric DEFAULT NULL,
  p_measurement_timestamp timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_thresholds jsonb; v_alerts jsonb := '[]'::jsonb; v_alert_id uuid;
  v_today_start timestamptz; v_today_end timestamptz;
  v_min_temp numeric; v_max_temp numeric; v_min_humidity numeric; v_max_humidity numeric;
  v_temp_shift numeric; v_humidity_shift numeric;
BEGIN
  v_thresholds := public.get_device_alert_thresholds(p_device_id);
  IF v_thresholds = '{}'::jsonb THEN RETURN v_alerts; END IF;

  v_today_start := date_trunc('day', p_measurement_timestamp);
  v_today_end := v_today_start + interval '1 day';

  SELECT LEAST(MIN(temperature), p_temperature), GREATEST(MAX(temperature), p_temperature)
  INTO v_min_temp, v_max_temp FROM public.device_telemetry
  WHERE device_id = p_device_id AND captured_at >= v_today_start AND captured_at < v_today_end AND temperature IS NOT NULL;

  SELECT LEAST(MIN(humidity), p_humidity), GREATEST(MAX(humidity), p_humidity)
  INTO v_min_humidity, v_max_humidity FROM public.device_telemetry
  WHERE device_id = p_device_id AND captured_at >= v_today_start AND captured_at < v_today_end AND humidity IS NOT NULL;

  IF v_min_temp IS NOT NULL AND v_max_temp IS NOT NULL THEN
    v_temp_shift := v_max_temp - v_min_temp;
    IF v_temp_shift >= (v_thresholds->>'temp_shift_max_per_session')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'temp_shift_max', 'shift', 'warning',
        format('Temperature shift +%s F within session (threshold: +%s F)', v_temp_shift, v_thresholds->>'temp_shift_max_per_session'),
        v_temp_shift, (v_thresholds->>'temp_shift_max_per_session')::numeric,
        jsonb_build_object('min_temp', v_min_temp, 'max_temp', v_max_temp, 'shift', v_temp_shift, 'session_start', v_today_start),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_shift_max');
    END IF;
    IF -v_temp_shift <= (v_thresholds->>'temp_shift_min_per_session')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'temp_shift_min', 'shift', 'warning',
        format('Temperature drop -%s F within session (threshold: %s F)', v_temp_shift, v_thresholds->>'temp_shift_min_per_session'),
        -v_temp_shift, (v_thresholds->>'temp_shift_min_per_session')::numeric,
        jsonb_build_object('min_temp', v_min_temp, 'max_temp', v_max_temp, 'shift', -v_temp_shift, 'session_start', v_today_start),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_shift_min');
    END IF;
  END IF;

  IF v_min_humidity IS NOT NULL AND v_max_humidity IS NOT NULL THEN
    v_humidity_shift := v_max_humidity - v_min_humidity;
    IF v_humidity_shift >= (v_thresholds->>'rh_shift_max_per_session')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'rh_shift_max', 'shift', 'warning',
        format('Humidity shift +%s%% within session (threshold: +%s%%)', v_humidity_shift, v_thresholds->>'rh_shift_max_per_session'),
        v_humidity_shift, (v_thresholds->>'rh_shift_max_per_session')::numeric,
        jsonb_build_object('min_humidity', v_min_humidity, 'max_humidity', v_max_humidity, 'shift', v_humidity_shift, 'session_start', v_today_start),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'rh_shift_max');
    END IF;
  END IF;
  RETURN v_alerts;
END; $$;

CREATE OR REPLACE FUNCTION public.check_mgi_velocity(
  p_device_id uuid, p_current_mgi numeric, p_measurement_timestamp timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_thresholds jsonb; v_alerts jsonb := '[]'::jsonb; v_alert_id uuid;
  v_previous_mgi numeric; v_previous_timestamp timestamptz;
  v_mgi_change numeric; v_mgi_velocity numeric;
BEGIN
  v_thresholds := public.get_device_alert_thresholds(p_device_id);
  IF v_thresholds = '{}'::jsonb THEN RETURN v_alerts; END IF;

  SELECT mgi_score, scored_at INTO v_previous_mgi, v_previous_timestamp FROM public.device_images
  WHERE device_id = p_device_id AND mgi_score IS NOT NULL AND scored_at < p_measurement_timestamp
  ORDER BY scored_at DESC LIMIT 1;
  IF v_previous_mgi IS NULL THEN RETURN v_alerts; END IF;

  v_mgi_change := p_current_mgi - v_previous_mgi;
  v_mgi_velocity := v_mgi_change;

  IF v_mgi_velocity > 0 THEN
    IF v_mgi_velocity >= (v_thresholds->>'mgi_velocity_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_velocity_critical', 'velocity', 'critical',
        format('CRITICAL MGI velocity: +%s%% since last session (threshold: +%s%%)', ROUND(v_mgi_velocity, 1), v_thresholds->>'mgi_velocity_critical'),
        v_mgi_velocity, (v_thresholds->>'mgi_velocity_critical')::numeric,
        jsonb_build_object('previous_mgi', v_previous_mgi, 'current_mgi', p_current_mgi, 'change', v_mgi_change,
          'velocity_percent', v_mgi_velocity, 'previous_timestamp', v_previous_timestamp,
          'time_elapsed', EXTRACT(EPOCH FROM (p_measurement_timestamp - v_previous_timestamp))/3600 || ' hours'),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_velocity_critical');
    ELSIF v_mgi_velocity >= (v_thresholds->>'mgi_velocity_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_velocity_warning', 'velocity', 'warning',
        format('Elevated MGI velocity: +%s%% since last session (threshold: +%s%%)', ROUND(v_mgi_velocity, 1), v_thresholds->>'mgi_velocity_warning'),
        v_mgi_velocity, (v_thresholds->>'mgi_velocity_warning')::numeric,
        jsonb_build_object('previous_mgi', v_previous_mgi, 'current_mgi', p_current_mgi, 'change', v_mgi_change,
          'velocity_percent', v_mgi_velocity, 'previous_timestamp', v_previous_timestamp,
          'time_elapsed', EXTRACT(EPOCH FROM (p_measurement_timestamp - v_previous_timestamp))/3600 || ' hours'),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_velocity_warning');
    END IF;
  END IF;
  RETURN v_alerts;
END; $$;

CREATE OR REPLACE FUNCTION public.check_mgi_program_speed(
  p_device_id uuid, p_current_mgi numeric, p_measurement_timestamp timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_thresholds jsonb; v_alerts jsonb := '[]'::jsonb; v_alert_id uuid;
  v_program_start_date date; v_program_id uuid;
  v_first_mgi numeric; v_first_mgi_date timestamptz;
  v_days_elapsed numeric; v_weeks_elapsed numeric;
  v_mgi_change numeric; v_speed_per_day numeric; v_speed_per_week numeric;
BEGIN
  v_thresholds := public.get_device_alert_thresholds(p_device_id);
  IF v_thresholds = '{}'::jsonb THEN RETURN v_alerts; END IF;

  SELECT d.program_id, p.start_date INTO v_program_id, v_program_start_date
  FROM public.devices d LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
  WHERE d.device_id = p_device_id;
  IF v_program_id IS NULL OR v_program_start_date IS NULL THEN RETURN v_alerts; END IF;

  SELECT mgi_score, scored_at INTO v_first_mgi, v_first_mgi_date FROM public.device_images
  WHERE device_id = p_device_id AND program_id = v_program_id AND mgi_score IS NOT NULL
  ORDER BY scored_at ASC LIMIT 1;
  IF v_first_mgi IS NULL OR v_first_mgi_date IS NULL THEN RETURN v_alerts; END IF;

  v_days_elapsed := EXTRACT(EPOCH FROM (p_measurement_timestamp - v_first_mgi_date)) / 86400;
  v_weeks_elapsed := v_days_elapsed / 7;
  IF v_days_elapsed < 1 THEN RETURN v_alerts; END IF;

  v_mgi_change := p_current_mgi - v_first_mgi;
  v_speed_per_day := v_mgi_change / v_days_elapsed;
  v_speed_per_week := v_mgi_change / v_weeks_elapsed;

  IF v_speed_per_day > 0 THEN
    IF v_speed_per_day >= (v_thresholds->>'mgi_speed_per_day_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_speed_per_day_critical', 'speed', 'critical',
        format('CRITICAL MGI growth speed: %s MGI/day over %s days (threshold: %s MGI/day)',
          ROUND(v_speed_per_day, 2), ROUND(v_days_elapsed, 1), v_thresholds->>'mgi_speed_per_day_critical'),
        v_speed_per_day, (v_thresholds->>'mgi_speed_per_day_critical')::numeric,
        jsonb_build_object('first_mgi', v_first_mgi, 'current_mgi', p_current_mgi, 'total_change', v_mgi_change,
          'days_elapsed', v_days_elapsed, 'speed_per_day', v_speed_per_day, 'program_start', v_program_start_date, 'first_mgi_date', v_first_mgi_date),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_day_critical');
    ELSIF v_speed_per_day >= (v_thresholds->>'mgi_speed_per_day_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_speed_per_day_warning', 'speed', 'warning',
        format('Elevated MGI growth speed: %s MGI/day over %s days (threshold: %s MGI/day)',
          ROUND(v_speed_per_day, 2), ROUND(v_days_elapsed, 1), v_thresholds->>'mgi_speed_per_day_warning'),
        v_speed_per_day, (v_thresholds->>'mgi_speed_per_day_warning')::numeric,
        jsonb_build_object('first_mgi', v_first_mgi, 'current_mgi', p_current_mgi, 'total_change', v_mgi_change,
          'days_elapsed', v_days_elapsed, 'speed_per_day', v_speed_per_day, 'program_start', v_program_start_date, 'first_mgi_date', v_first_mgi_date),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_day_warning');
    END IF;
  END IF;

  IF v_weeks_elapsed >= 1 AND v_speed_per_week > 0 THEN
    IF v_speed_per_week >= (v_thresholds->>'mgi_speed_per_week_critical')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_speed_per_week_critical', 'speed', 'critical',
        format('CRITICAL MGI growth speed: %s MGI/week over %s weeks (threshold: %s MGI/week)',
          ROUND(v_speed_per_week, 2), ROUND(v_weeks_elapsed, 1), v_thresholds->>'mgi_speed_per_week_critical'),
        v_speed_per_week, (v_thresholds->>'mgi_speed_per_week_critical')::numeric,
        jsonb_build_object('first_mgi', v_first_mgi, 'current_mgi', p_current_mgi, 'total_change', v_mgi_change,
          'weeks_elapsed', v_weeks_elapsed, 'speed_per_week', v_speed_per_week, 'program_start', v_program_start_date, 'first_mgi_date', v_first_mgi_date),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_week_critical');
    ELSIF v_speed_per_week >= (v_thresholds->>'mgi_speed_per_week_warning')::numeric THEN
      v_alert_id := public.create_device_alert(p_device_id, 'mgi_speed_per_week_warning', 'speed', 'warning',
        format('Elevated MGI growth speed: %s MGI/week over %s weeks (threshold: %s MGI/week)',
          ROUND(v_speed_per_week, 2), ROUND(v_weeks_elapsed, 1), v_thresholds->>'mgi_speed_per_week_warning'),
        v_speed_per_week, (v_thresholds->>'mgi_speed_per_week_warning')::numeric,
        jsonb_build_object('first_mgi', v_first_mgi, 'current_mgi', p_current_mgi, 'total_change', v_mgi_change,
          'weeks_elapsed', v_weeks_elapsed, 'speed_per_week', v_speed_per_week, 'program_start', v_program_start_date, 'first_mgi_date', v_first_mgi_date),
        p_measurement_timestamp);
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_week_warning');
    END IF;
  END IF;
  RETURN v_alerts;
END; $$;

CREATE OR REPLACE FUNCTION public.calculate_all_mgi_program_speeds()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_device record; v_latest_image record;
  v_alerts_created integer := 0; v_devices_processed integer := 0; v_result jsonb;
BEGIN
  FOR v_device IN
    SELECT d.device_id, d.device_code, d.program_id FROM public.devices d
    WHERE d.is_active = true AND d.program_id IS NOT NULL AND d.provisioning_status = 'active'
  LOOP
    SELECT image_id, mgi_score, scored_at INTO v_latest_image FROM public.device_images
    WHERE device_id = v_device.device_id AND mgi_score IS NOT NULL ORDER BY scored_at DESC LIMIT 1;
    IF v_latest_image.mgi_score IS NOT NULL THEN
      v_result := public.check_mgi_program_speed(v_device.device_id, v_latest_image.mgi_score, v_latest_image.scored_at);
      v_devices_processed := v_devices_processed + 1;
      v_alerts_created := v_alerts_created + jsonb_array_length(v_result);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('devices_processed', v_devices_processed, 'alerts_created', v_alerts_created, 'processed_at', now());
END; $$;

INSERT INTO public.device_alert_thresholds (company_id, device_id, is_active)
SELECT c.company_id, NULL, true FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.device_alert_thresholds t WHERE t.company_id = c.company_id AND t.device_id IS NULL)
ON CONFLICT (company_id, device_id) DO NOTHING;
