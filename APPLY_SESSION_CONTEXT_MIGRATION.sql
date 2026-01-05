/*
  # Add Session Context to Device Alerts

  INSTRUCTIONS:
  1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff
  2. Navigate to SQL Editor
  3. Copy and paste this entire SQL script
  4. Click "Run" to apply the migration

  This migration adds session/snapshot/wake context columns to device_alerts table
  and updates the create_device_alert function to support these parameters.
*/

-- ============================================
-- 1. ADD SESSION CONTEXT COLUMNS
-- ============================================

DO $$
BEGIN
  -- Link to session (when alert is session-specific)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'session_id'
  ) THEN
    ALTER TABLE public.device_alerts
      ADD COLUMN session_id UUID NULL
      REFERENCES public.site_device_sessions(session_id) ON DELETE CASCADE;
    RAISE NOTICE 'Added column device_alerts.session_id';
  END IF;

  -- Link to snapshot (when alert is snapshot-specific)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'snapshot_id'
  ) THEN
    ALTER TABLE public.device_alerts
      ADD COLUMN snapshot_id UUID NULL;
    RAISE NOTICE 'Added column device_alerts.snapshot_id';
  END IF;

  -- Link to wake event (when alert is wake-specific)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'wake_number'
  ) THEN
    ALTER TABLE public.device_alerts
      ADD COLUMN wake_number INTEGER NULL;
    RAISE NOTICE 'Added column device_alerts.wake_number';
  END IF;
END $$;

-- ============================================
-- 2. ADD INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_device_alerts_session
  ON public.device_alerts(session_id, triggered_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_alerts_session_active
  ON public.device_alerts(session_id, severity, triggered_at DESC)
  WHERE session_id IS NOT NULL AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_alerts_snapshot
  ON public.device_alerts(snapshot_id)
  WHERE snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_alerts_wake
  ON public.device_alerts(device_id, wake_number)
  WHERE wake_number IS NOT NULL;

-- ============================================
-- 3. UPDATE COMMENTS
-- ============================================

COMMENT ON COLUMN public.device_alerts.session_id IS 'Link to specific device session (NULL for device-level alerts)';
COMMENT ON COLUMN public.device_alerts.snapshot_id IS 'Link to specific snapshot (NULL for non-snapshot alerts)';
COMMENT ON COLUMN public.device_alerts.wake_number IS 'Link to specific wake event number (NULL for non-wake alerts)';

-- ============================================
-- 4. UPDATE create_device_alert FUNCTION
-- ============================================

DROP FUNCTION IF EXISTS public.create_device_alert(uuid, text, text, text, text, numeric, numeric, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION public.create_device_alert(
  p_device_id uuid,
  p_alert_type text,
  p_alert_category text DEFAULT 'absolute',
  p_severity text DEFAULT 'warning',
  p_message text DEFAULT '',
  p_value numeric DEFAULT NULL,
  p_threshold numeric DEFAULT NULL,
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
  v_device record;
BEGIN
  SELECT
    d.device_coords,
    d.zone_label,
    d.site_id,
    s.site_name,
    s.program_id,
    p.program_name,
    p.company_id,
    c.company_name
  INTO v_device
  FROM public.devices d
  LEFT JOIN public.sites s ON s.site_id = d.site_id
  LEFT JOIN public.pilot_programs p ON p.program_id = s.program_id
  LEFT JOIN public.companies c ON c.company_id = p.company_id
  WHERE d.device_id = p_device_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found: %', p_device_id;
  END IF;

  INSERT INTO public.device_alerts (
    device_id,
    alert_type,
    alert_category,
    severity,
    message,
    metadata,
    triggered_at,
    measurement_timestamp,
    device_coords,
    zone_label,
    site_id,
    site_name,
    program_id,
    program_name,
    company_id,
    company_name,
    threshold_context,
    session_id,
    snapshot_id,
    wake_number
  ) VALUES (
    p_device_id,
    p_alert_type,
    p_alert_category,
    p_severity,
    p_message,
    jsonb_build_object(
      'value', p_value,
      'threshold', p_threshold,
      'timestamp', p_measurement_timestamp
    ),
    now(),
    p_measurement_timestamp,
    v_device.device_coords,
    v_device.zone_label,
    v_device.site_id,
    v_device.site_name,
    v_device.program_id,
    v_device.program_name,
    v_device.company_id,
    v_device.company_name,
    p_threshold_context,
    p_session_id,
    p_snapshot_id,
    p_wake_number
  )
  RETURNING alert_id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

COMMENT ON FUNCTION public.create_device_alert IS 'Creates device alert with full routing context and optional session/snapshot/wake linkage';
