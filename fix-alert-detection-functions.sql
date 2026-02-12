/*
  # Fix Alert Detection Functions - Overload Ambiguity + Column Fix

  1. Problem
    - TWO overloads of `create_device_alert` exist in the database:
      - Overload 1 (9 params): from migration 20251116120001
      - Overload 2 (12 params): from APPLY_SESSION_CONTEXT_MIGRATION
    - PostgreSQL error 42725: "function name is not unique"
    - Overload 2 references non-existent columns: d.device_coords, s.site_name,
      p.program_name, c.company_name
    - `alert_type` CHECK constraint blocks threshold alert types

  2. Fixes Applied
    - DROP both overloads explicitly by full type signature
    - Create ONE unified function with 12 parameters (session/snapshot/wake optional)
    - Use correct column names: d.x_position, d.y_position, s.name, p.name, c.name
    - Drop restrictive alert_type CHECK constraint

  3. Security
    - No RLS changes
    - Function remains SECURITY DEFINER for system-level alert creation
*/

-- ============================================
-- STEP 1: Drop restrictive alert_type CHECK constraint
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
-- STEP 2: Drop BOTH overloads of create_device_alert
-- Overload 1: 9-param (original from migration 20251116120001)
-- Overload 2: 12-param (from APPLY_SESSION_CONTEXT_MIGRATION)
-- ============================================

DROP FUNCTION IF EXISTS public.create_device_alert(uuid, text, text, text, text, numeric, numeric, jsonb, timestamptz);
DROP FUNCTION IF EXISTS public.create_device_alert(uuid, text, text, text, text, numeric, numeric, jsonb, timestamptz, uuid, uuid, integer);

-- ============================================
-- STEP 3: Create unified create_device_alert function
-- 12 parameters, last 3 (session/snapshot/wake) default to NULL
-- Uses correct column names from production schema
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
  p_measurement_timestamp timestamptz DEFAULT now(),
  p_session_id uuid DEFAULT NULL,
  p_snapshot_id uuid DEFAULT NULL,
  p_wake_number integer DEFAULT NULL
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
      session_id = COALESCE(p_session_id, device_alerts.session_id),
      snapshot_id = COALESCE(p_snapshot_id, device_alerts.snapshot_id),
      wake_number = COALESCE(p_wake_number, device_alerts.wake_number),
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
    session_id,
    snapshot_id,
    wake_number,
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
    p_session_id,
    p_snapshot_id,
    p_wake_number,
    jsonb_build_object(
      'device_code', v_device_record.device_code,
      'device_name', v_device_record.device_name
    )
  )
  RETURNING alert_id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

COMMENT ON FUNCTION public.create_device_alert IS 'Creates device alert with full routing context and optional session/snapshot/wake linkage. Unified function replacing previous overloads.';
