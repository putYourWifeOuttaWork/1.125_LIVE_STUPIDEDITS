/*
  # Fix Alert Detection Functions - Critical Bug Fix

  1. Problem
    - `create_device_alert()` references non-existent column `d.device_coords` or `d.placement_json`
    - Devices table uses `x_position` and `y_position` columns for coordinates
    - This causes ALL threshold alerts to fail silently with SQL error
    - `alert_type` CHECK constraint on `device_alerts` only allows system alert types
      but threshold alerts use types like `temp_max_warning`, `temp_max_critical`, etc.

  2. Fixes Applied
    - Updated `create_device_alert()` to use `d.x_position` and `d.y_position`
    - Dropped restrictive `alert_type` CHECK constraint to allow threshold alert types
    - All detection functions (`check_absolute_thresholds`, `check_combination_zones`,
      `check_intra_session_shifts`) are unmodified as the bug is in `create_device_alert`

  3. Impact
    - Temperature, humidity, and MGI alerts will now generate correctly
    - Company default thresholds (e.g., 70F max warning) will trigger alerts as expected
    - Existing system alerts (missed_wake, low_battery, etc.) continue working

  4. Security
    - No RLS changes
    - Functions remain SECURITY DEFINER for system-level alert creation
*/

-- ============================================
-- STEP 1: Drop restrictive alert_type CHECK constraint
-- The original constraint only allows system alert types.
-- Threshold alerts need types like temp_max_warning, rh_min_critical, etc.
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'device_alerts'
    AND constraint_type = 'CHECK'
    AND constraint_name = 'device_alerts_alert_type_check'
  ) THEN
    ALTER TABLE public.device_alerts DROP CONSTRAINT device_alerts_alert_type_check;
    RAISE NOTICE 'Dropped restrictive alert_type CHECK constraint';
  END IF;
END $$;

-- ============================================
-- STEP 2: Fix create_device_alert function
-- Use x_position/y_position instead of placement_json/device_coords
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
  SELECT
    d.device_id,
    d.device_code,
    d.device_name,
    COALESCE(d.zone_label, 'Unknown') as zone_label,
    COALESCE(
      d.x_position::text || ',' || d.y_position::text,
      'No coords'
    ) as device_coords,
    d.site_id,
    s.name as site_name,
    d.program_id,
    p.name as program_name,
    COALESCE(d.company_id, p.company_id) as company_id,
    c.name as company_name
  INTO v_device_record
  FROM public.devices d
  LEFT JOIN public.sites s ON s.site_id = d.site_id
  LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
  LEFT JOIN public.companies c ON c.company_id = COALESCE(d.company_id, p.company_id)
  WHERE d.device_id = p_device_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device % not found', p_device_id;
  END IF;

  SELECT alert_id INTO v_alert_id
  FROM public.device_alerts
  WHERE device_id = p_device_id
  AND alert_type = p_alert_type
  AND alert_category = p_alert_category
  AND resolved_at IS NULL
  AND triggered_at > (now() - interval '5 minutes')
  LIMIT 1;

  IF v_alert_id IS NOT NULL THEN
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

COMMENT ON FUNCTION public.create_device_alert IS 'Creates device alert with full routing context (zone/site/program/company). Fixed to use x_position/y_position columns.';
