/*
  # Add min/max timestamps to intra-session shift alerts

  1. Changes
    - Updates `check_intra_session_shifts()` function to also capture
      the `captured_at` timestamps of when the min and max values occurred
    - Stores `min_temp_at`, `max_temp_at` in threshold_context for temperature shifts
    - Stores `min_humidity_at`, `max_humidity_at` in threshold_context for humidity shifts
    - These timestamps allow the frontend to highlight the exact time window of the shift

  2. Important Notes
    - Existing shift alerts will NOT have these new fields; the frontend
      handles this gracefully by falling back to session_start -> measurement_timestamp
    - No table changes -- only the function body is updated
    - The additional queries use the same index on (device_id, captured_at)
*/

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
  v_min_temp_at timestamptz;
  v_max_temp_at timestamptz;
  v_min_humidity numeric;
  v_max_humidity numeric;
  v_min_humidity_at timestamptz;
  v_max_humidity_at timestamptz;
  v_temp_shift numeric;
  v_humidity_shift numeric;
BEGIN
  v_thresholds := public.get_device_alert_thresholds(p_device_id);

  IF v_thresholds = '{}'::jsonb THEN
    RETURN v_alerts;
  END IF;

  v_today_start := date_trunc('day', p_measurement_timestamp);
  v_today_end := v_today_start + interval '1 day';

  SELECT
    LEAST(MIN(temperature), p_temperature),
    GREATEST(MAX(temperature), p_temperature)
  INTO v_min_temp, v_max_temp
  FROM public.device_telemetry
  WHERE device_id = p_device_id
  AND captured_at >= v_today_start
  AND captured_at < v_today_end
  AND temperature IS NOT NULL;

  IF v_min_temp IS NOT NULL AND v_max_temp IS NOT NULL THEN
    IF p_temperature IS NOT NULL AND p_temperature <= v_min_temp THEN
      v_min_temp_at := p_measurement_timestamp;
    ELSE
      SELECT captured_at INTO v_min_temp_at
      FROM public.device_telemetry
      WHERE device_id = p_device_id
        AND captured_at >= v_today_start
        AND captured_at < v_today_end
        AND temperature IS NOT NULL
      ORDER BY temperature ASC, captured_at ASC
      LIMIT 1;
    END IF;

    IF p_temperature IS NOT NULL AND p_temperature >= v_max_temp THEN
      v_max_temp_at := p_measurement_timestamp;
    ELSE
      SELECT captured_at INTO v_max_temp_at
      FROM public.device_telemetry
      WHERE device_id = p_device_id
        AND captured_at >= v_today_start
        AND captured_at < v_today_end
        AND temperature IS NOT NULL
      ORDER BY temperature DESC, captured_at ASC
      LIMIT 1;
    END IF;
  END IF;

  SELECT
    LEAST(MIN(humidity), p_humidity),
    GREATEST(MAX(humidity), p_humidity)
  INTO v_min_humidity, v_max_humidity
  FROM public.device_telemetry
  WHERE device_id = p_device_id
  AND captured_at >= v_today_start
  AND captured_at < v_today_end
  AND humidity IS NOT NULL;

  IF v_min_humidity IS NOT NULL AND v_max_humidity IS NOT NULL THEN
    IF p_humidity IS NOT NULL AND p_humidity <= v_min_humidity THEN
      v_min_humidity_at := p_measurement_timestamp;
    ELSE
      SELECT captured_at INTO v_min_humidity_at
      FROM public.device_telemetry
      WHERE device_id = p_device_id
        AND captured_at >= v_today_start
        AND captured_at < v_today_end
        AND humidity IS NOT NULL
      ORDER BY humidity ASC, captured_at ASC
      LIMIT 1;
    END IF;

    IF p_humidity IS NOT NULL AND p_humidity >= v_max_humidity THEN
      v_max_humidity_at := p_measurement_timestamp;
    ELSE
      SELECT captured_at INTO v_max_humidity_at
      FROM public.device_telemetry
      WHERE device_id = p_device_id
        AND captured_at >= v_today_start
        AND captured_at < v_today_end
        AND humidity IS NOT NULL
      ORDER BY humidity DESC, captured_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_min_temp IS NOT NULL AND v_max_temp IS NOT NULL THEN
    v_temp_shift := v_max_temp - v_min_temp;

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
          'min_temp_at', v_min_temp_at,
          'max_temp_at', v_max_temp_at,
          'shift', v_temp_shift,
          'session_start', v_today_start
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_shift_max');
    END IF;

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
          'min_temp_at', v_min_temp_at,
          'max_temp_at', v_max_temp_at,
          'shift', -v_temp_shift,
          'session_start', v_today_start
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'temp_shift_min');
    END IF;
  END IF;

  IF v_min_humidity IS NOT NULL AND v_max_humidity IS NOT NULL THEN
    v_humidity_shift := v_max_humidity - v_min_humidity;

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
          'min_humidity_at', v_min_humidity_at,
          'max_humidity_at', v_max_humidity_at,
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