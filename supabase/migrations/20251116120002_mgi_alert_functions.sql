/*
  # MGI Alert Detection Functions

  1. MGI Velocity Detection
    - check_mgi_velocity() - Day-to-day MGI growth rate
    - Compares current MGI to previous session/day

  2. MGI Program Speed Detection
    - check_mgi_program_speed() - Average growth rate over program lifecycle
    - Calculates MGI/day and MGI/week from program start

  3. Scheduled Batch Processing
    - calculate_mgi_program_speeds() - Daily batch calculation
    - Can be called via pg_cron or edge function

  INTEGRATION: Called after MGI scoring completes
*/

-- ============================================
-- 1. CHECK MGI VELOCITY (Day-to-Day Growth)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_mgi_velocity(
  p_device_id uuid,
  p_current_mgi numeric,
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
  v_previous_mgi numeric;
  v_previous_timestamp timestamptz;
  v_mgi_change numeric;
  v_mgi_velocity numeric; -- Percentage change
BEGIN
  -- Get effective thresholds
  v_thresholds := public.get_device_alert_thresholds(p_device_id);

  IF v_thresholds = '{}'::jsonb THEN
    RETURN v_alerts;
  END IF;

  -- Get most recent MGI score before current timestamp
  SELECT
    mgi_score,
    scored_at
  INTO v_previous_mgi, v_previous_timestamp
  FROM public.device_images
  WHERE device_id = p_device_id
  AND mgi_score IS NOT NULL
  AND scored_at < p_measurement_timestamp
  ORDER BY scored_at DESC
  LIMIT 1;

  -- If no previous MGI, can't calculate velocity
  IF v_previous_mgi IS NULL THEN
    RETURN v_alerts;
  END IF;

  -- Calculate absolute change and percentage velocity
  v_mgi_change := p_current_mgi - v_previous_mgi;

  -- Calculate velocity as percentage of scale (0-100)
  -- If previous was 20 and current is 50, velocity = +30% of scale
  v_mgi_velocity := v_mgi_change;

  -- Only alert on increases (positive velocity)
  IF v_mgi_velocity > 0 THEN
    -- Check critical threshold
    IF v_mgi_velocity >= (v_thresholds->>'mgi_velocity_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_velocity_critical',
        'velocity',
        'critical',
        format('CRITICAL MGI velocity: +%s%% since last session (threshold: +%s%%)',
          ROUND(v_mgi_velocity, 1),
          v_thresholds->>'mgi_velocity_critical'),
        v_mgi_velocity,
        (v_thresholds->>'mgi_velocity_critical')::numeric,
        jsonb_build_object(
          'previous_mgi', v_previous_mgi,
          'current_mgi', p_current_mgi,
          'change', v_mgi_change,
          'velocity_percent', v_mgi_velocity,
          'previous_timestamp', v_previous_timestamp,
          'time_elapsed', EXTRACT(EPOCH FROM (p_measurement_timestamp - v_previous_timestamp)) / 3600 || ' hours'
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_velocity_critical');

    -- Check warning threshold
    ELSIF v_mgi_velocity >= (v_thresholds->>'mgi_velocity_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_velocity_warning',
        'velocity',
        'warning',
        format('Elevated MGI velocity: +%s%% since last session (threshold: +%s%%)',
          ROUND(v_mgi_velocity, 1),
          v_thresholds->>'mgi_velocity_warning'),
        v_mgi_velocity,
        (v_thresholds->>'mgi_velocity_warning')::numeric,
        jsonb_build_object(
          'previous_mgi', v_previous_mgi,
          'current_mgi', p_current_mgi,
          'change', v_mgi_change,
          'velocity_percent', v_mgi_velocity,
          'previous_timestamp', v_previous_timestamp,
          'time_elapsed', EXTRACT(EPOCH FROM (p_measurement_timestamp - v_previous_timestamp)) / 3600 || ' hours'
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_velocity_warning');
    END IF;
  END IF;

  RETURN v_alerts;
END;
$$;

COMMENT ON FUNCTION public.check_mgi_velocity IS 'Check MGI day-to-day velocity (growth rate from previous session)';

-- ============================================
-- 2. CHECK MGI PROGRAM SPEED (Average Over Lifecycle)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_mgi_program_speed(
  p_device_id uuid,
  p_current_mgi numeric,
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
  v_program_start_date date;
  v_program_id uuid;
  v_first_mgi numeric;
  v_first_mgi_date timestamptz;
  v_days_elapsed numeric;
  v_weeks_elapsed numeric;
  v_mgi_change numeric;
  v_speed_per_day numeric;
  v_speed_per_week numeric;
BEGIN
  -- Get effective thresholds
  v_thresholds := public.get_device_alert_thresholds(p_device_id);

  IF v_thresholds = '{}'::jsonb THEN
    RETURN v_alerts;
  END IF;

  -- Get device's program and start date
  SELECT
    d.program_id,
    p.start_date
  INTO v_program_id, v_program_start_date
  FROM public.devices d
  LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
  WHERE d.device_id = p_device_id;

  IF v_program_id IS NULL OR v_program_start_date IS NULL THEN
    RETURN v_alerts;
  END IF;

  -- Get first MGI score for this device in this program
  SELECT
    mgi_score,
    scored_at
  INTO v_first_mgi, v_first_mgi_date
  FROM public.device_images
  WHERE device_id = p_device_id
  AND program_id = v_program_id
  AND mgi_score IS NOT NULL
  ORDER BY scored_at ASC
  LIMIT 1;

  -- If no first MGI or same as current, can't calculate speed
  IF v_first_mgi IS NULL OR v_first_mgi_date IS NULL THEN
    RETURN v_alerts;
  END IF;

  -- Calculate time elapsed
  v_days_elapsed := EXTRACT(EPOCH FROM (p_measurement_timestamp - v_first_mgi_date)) / 86400;
  v_weeks_elapsed := v_days_elapsed / 7;

  -- Need at least 1 day elapsed
  IF v_days_elapsed < 1 THEN
    RETURN v_alerts;
  END IF;

  -- Calculate MGI change and speeds
  v_mgi_change := p_current_mgi - v_first_mgi;
  v_speed_per_day := v_mgi_change / v_days_elapsed;
  v_speed_per_week := v_mgi_change / v_weeks_elapsed;

  -- Check per-day speed thresholds (only if positive growth)
  IF v_speed_per_day > 0 THEN
    -- Critical
    IF v_speed_per_day >= (v_thresholds->>'mgi_speed_per_day_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_speed_per_day_critical',
        'speed',
        'critical',
        format('CRITICAL MGI growth speed: %s MGI/day over %s days (threshold: %s MGI/day)',
          ROUND(v_speed_per_day, 2),
          ROUND(v_days_elapsed, 1),
          v_thresholds->>'mgi_speed_per_day_critical'),
        v_speed_per_day,
        (v_thresholds->>'mgi_speed_per_day_critical')::numeric,
        jsonb_build_object(
          'first_mgi', v_first_mgi,
          'current_mgi', p_current_mgi,
          'total_change', v_mgi_change,
          'days_elapsed', v_days_elapsed,
          'speed_per_day', v_speed_per_day,
          'program_start', v_program_start_date,
          'first_mgi_date', v_first_mgi_date
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_day_critical');

    -- Warning
    ELSIF v_speed_per_day >= (v_thresholds->>'mgi_speed_per_day_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_speed_per_day_warning',
        'speed',
        'warning',
        format('Elevated MGI growth speed: %s MGI/day over %s days (threshold: %s MGI/day)',
          ROUND(v_speed_per_day, 2),
          ROUND(v_days_elapsed, 1),
          v_thresholds->>'mgi_speed_per_day_warning'),
        v_speed_per_day,
        (v_thresholds->>'mgi_speed_per_day_warning')::numeric,
        jsonb_build_object(
          'first_mgi', v_first_mgi,
          'current_mgi', p_current_mgi,
          'total_change', v_mgi_change,
          'days_elapsed', v_days_elapsed,
          'speed_per_day', v_speed_per_day,
          'program_start', v_program_start_date,
          'first_mgi_date', v_first_mgi_date
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_day_warning');
    END IF;
  END IF;

  -- Check per-week speed thresholds (only if at least 1 week elapsed)
  IF v_weeks_elapsed >= 1 AND v_speed_per_week > 0 THEN
    -- Critical
    IF v_speed_per_week >= (v_thresholds->>'mgi_speed_per_week_critical')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_speed_per_week_critical',
        'speed',
        'critical',
        format('CRITICAL MGI growth speed: %s MGI/week over %s weeks (threshold: %s MGI/week)',
          ROUND(v_speed_per_week, 2),
          ROUND(v_weeks_elapsed, 1),
          v_thresholds->>'mgi_speed_per_week_critical'),
        v_speed_per_week,
        (v_thresholds->>'mgi_speed_per_week_critical')::numeric,
        jsonb_build_object(
          'first_mgi', v_first_mgi,
          'current_mgi', p_current_mgi,
          'total_change', v_mgi_change,
          'weeks_elapsed', v_weeks_elapsed,
          'speed_per_week', v_speed_per_week,
          'program_start', v_program_start_date,
          'first_mgi_date', v_first_mgi_date
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_week_critical');

    -- Warning
    ELSIF v_speed_per_week >= (v_thresholds->>'mgi_speed_per_week_warning')::numeric THEN
      v_alert_id := public.create_device_alert(
        p_device_id,
        'mgi_speed_per_week_warning',
        'speed',
        'warning',
        format('Elevated MGI growth speed: %s MGI/week over %s weeks (threshold: %s MGI/week)',
          ROUND(v_speed_per_week, 2),
          ROUND(v_weeks_elapsed, 1),
          v_thresholds->>'mgi_speed_per_week_warning'),
        v_speed_per_week,
        (v_thresholds->>'mgi_speed_per_week_warning')::numeric,
        jsonb_build_object(
          'first_mgi', v_first_mgi,
          'current_mgi', p_current_mgi,
          'total_change', v_mgi_change,
          'weeks_elapsed', v_weeks_elapsed,
          'speed_per_week', v_speed_per_week,
          'program_start', v_program_start_date,
          'first_mgi_date', v_first_mgi_date
        ),
        p_measurement_timestamp
      );
      v_alerts := v_alerts || jsonb_build_object('alert_id', v_alert_id, 'type', 'mgi_speed_per_week_warning');
    END IF;
  END IF;

  RETURN v_alerts;
END;
$$;

COMMENT ON FUNCTION public.check_mgi_program_speed IS 'Check MGI program speed (average growth rate from program start to current)';

-- ============================================
-- 3. BATCH PROCESS ALL DEVICES FOR MGI SPEEDS
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_all_mgi_program_speeds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device record;
  v_latest_image record;
  v_alerts_created integer := 0;
  v_devices_processed integer := 0;
  v_result jsonb;
BEGIN
  -- Loop through all active devices with programs
  FOR v_device IN
    SELECT
      d.device_id,
      d.device_code,
      d.program_id
    FROM public.devices d
    WHERE d.is_active = true
    AND d.program_id IS NOT NULL
    AND d.provisioning_status = 'active'
  LOOP
    -- Get most recent MGI score for device
    SELECT
      image_id,
      mgi_score,
      scored_at
    INTO v_latest_image
    FROM public.device_images
    WHERE device_id = v_device.device_id
    AND mgi_score IS NOT NULL
    ORDER BY scored_at DESC
    LIMIT 1;

    IF v_latest_image.mgi_score IS NOT NULL THEN
      -- Check program speed and create alerts if needed
      v_result := public.check_mgi_program_speed(
        v_device.device_id,
        v_latest_image.mgi_score,
        v_latest_image.scored_at
      );

      v_devices_processed := v_devices_processed + 1;
      v_alerts_created := v_alerts_created + jsonb_array_length(v_result);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'devices_processed', v_devices_processed,
    'alerts_created', v_alerts_created,
    'processed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_all_mgi_program_speeds IS 'Batch process all devices to check MGI program speed thresholds (run daily via pg_cron)';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ MGI alert detection functions created successfully';
  RAISE NOTICE '   - check_mgi_velocity() for day-to-day growth';
  RAISE NOTICE '   - check_mgi_program_speed() for program lifecycle average';
  RAISE NOTICE '   - calculate_all_mgi_program_speeds() for batch processing';
  RAISE NOTICE '   - Ready for MGI scoring integration';
END $$;
