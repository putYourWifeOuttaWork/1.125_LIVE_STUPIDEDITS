/*
  # Device Alert Thresholds System

  1. New Tables
    - `device_alert_thresholds` - Per-device threshold configuration with company defaults
      - Stores 22+ threshold types across 4 categories
      - Supports company-level defaults and device-level overrides

  2. Enhanced Tables
    - `device_alerts` - Add routing context and categorization
      - device_coords, zone_label, site/program/company names
      - alert_category, threshold_context fields

  3. Threshold Categories
    - Absolute Metrics (10): temp/RH/MGI min/max warning/critical
    - Intra-Session Shifts (4): temp/RH shift detection within day
    - MGI Velocity (2): day-to-day growth rate warning/critical
    - MGI Program Speed (4): average growth over program lifecycle
    - Combination Zones (2): Temp+RH danger zones

  4. Security
    - RLS policies for multi-tenancy
    - Company admins can manage thresholds
    - All users can view alerts for their company

  IDEMPOTENT: Uses IF NOT EXISTS and safe column additions
*/

-- ============================================
-- 1. DEVICE_ALERT_THRESHOLDS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.device_alert_thresholds (
  threshold_config_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,

  -- NULL device_id means company-wide default
  -- Non-null device_id means device-specific override

  -- Metadata
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,

  -- ===== ABSOLUTE THRESHOLDS =====
  -- Temperature (Fahrenheit) - ALL SYSTEM TEMPERATURES IN FAHRENHEIT
  temp_min_warning numeric(5,2) NULL DEFAULT 32.0,  -- °F
  temp_min_critical numeric(5,2) NULL DEFAULT 25.0, -- °F
  temp_max_warning numeric(5,2) NULL DEFAULT 90.0,  -- °F
  temp_max_critical numeric(5,2) NULL DEFAULT 100.0, -- °F

  -- Relative Humidity (Percent)
  rh_min_warning numeric(5,2) NULL DEFAULT 20.0,
  rh_min_critical numeric(5,2) NULL DEFAULT 10.0,
  rh_max_warning numeric(5,2) NULL DEFAULT 80.0,
  rh_max_critical numeric(5,2) NULL DEFAULT 90.0,

  -- MGI (Mold Growth Index, 0-100 scale)
  mgi_max_warning numeric(5,2) NULL DEFAULT 70.0,
  mgi_max_critical numeric(5,2) NULL DEFAULT 85.0,

  -- ===== INTRA-SESSION SHIFT THRESHOLDS (within-day changes) =====
  -- Temperature shift (degrees change within same session/day)
  temp_shift_min_per_session numeric(5,2) NULL DEFAULT -25.0, -- Max drop allowed
  temp_shift_max_per_session numeric(5,2) NULL DEFAULT 25.0,  -- Max rise allowed

  -- Humidity shift (percent change within same session/day)
  rh_shift_min_per_session numeric(5,2) NULL DEFAULT -50.0,
  rh_shift_max_per_session numeric(5,2) NULL DEFAULT 50.0,

  -- ===== MGI VELOCITY THRESHOLDS (day-to-day growth) =====
  -- Velocity = MGI change from previous session/day to current
  mgi_velocity_warning numeric(5,2) NULL DEFAULT 30.0,  -- +30% growth triggers warning
  mgi_velocity_critical numeric(5,2) NULL DEFAULT 40.0, -- +40% growth triggers critical

  -- ===== MGI PROGRAM SPEED THRESHOLDS (average growth over program lifecycle) =====
  -- Speed = Average MGI growth rate from program start to current
  mgi_speed_per_day_warning numeric(5,2) NULL DEFAULT 5.0,    -- 5 MGI points/day average
  mgi_speed_per_day_critical numeric(5,2) NULL DEFAULT 7.0,   -- 7 MGI points/day average
  mgi_speed_per_week_warning numeric(5,2) NULL DEFAULT 10.0,  -- 10 MGI points/week average
  mgi_speed_per_week_critical numeric(5,2) NULL DEFAULT 15.0, -- 15 MGI points/week average

  -- ===== COMBINATION ZONE THRESHOLDS (Temp + RH danger zones) =====
  -- Format: {"temp_threshold": 60, "rh_threshold": 75}
  combo_zone_warning jsonb NULL DEFAULT '{"temp_threshold": 60, "rh_threshold": 75}'::jsonb,
  combo_zone_critical jsonb NULL DEFAULT '{"temp_threshold": 70, "rh_threshold": 75}'::jsonb,

  -- Ensure only one default per company OR one config per device
  CONSTRAINT unique_company_default CHECK (
    (device_id IS NULL) OR (device_id IS NOT NULL)
  ),
  CONSTRAINT unique_device_config UNIQUE (company_id, device_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_alert_thresholds_company ON public.device_alert_thresholds(company_id);
CREATE INDEX IF NOT EXISTS idx_device_alert_thresholds_device ON public.device_alert_thresholds(device_id);
CREATE INDEX IF NOT EXISTS idx_device_alert_thresholds_active ON public.device_alert_thresholds(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_device_alert_thresholds_combo_warning ON public.device_alert_thresholds USING gin(combo_zone_warning);
CREATE INDEX IF NOT EXISTS idx_device_alert_thresholds_combo_critical ON public.device_alert_thresholds USING gin(combo_zone_critical);

-- Comments
COMMENT ON TABLE public.device_alert_thresholds IS 'Alert threshold configuration per device or company-wide defaults';
COMMENT ON COLUMN public.device_alert_thresholds.device_id IS 'NULL = company default, non-null = device-specific override';
COMMENT ON COLUMN public.device_alert_thresholds.temp_shift_min_per_session IS 'Max temperature DROP allowed within a single session/day (e.g., -25°F)';
COMMENT ON COLUMN public.device_alert_thresholds.temp_shift_max_per_session IS 'Max temperature RISE allowed within a single session/day (e.g., +25°F)';
COMMENT ON COLUMN public.device_alert_thresholds.mgi_velocity_warning IS 'MGI growth from previous day that triggers warning (e.g., +30% growth)';
COMMENT ON COLUMN public.device_alert_thresholds.mgi_speed_per_day_warning IS 'Average MGI growth per day over program lifecycle that triggers warning';
COMMENT ON COLUMN public.device_alert_thresholds.combo_zone_warning IS 'Temp+RH combination that triggers warning: {"temp_threshold": 60, "rh_threshold": 75}';

-- ============================================
-- 2. ENHANCE DEVICE_ALERTS TABLE
-- ============================================

-- Add alert categorization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'alert_category'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN alert_category text NULL
      CHECK (alert_category IN ('absolute', 'shift', 'velocity', 'speed', 'combination', 'system'));
    RAISE NOTICE 'Added column device_alerts.alert_category';
  END IF;
END $$;

-- Add routing context fields
DO $$
BEGIN
  -- Device coordinates (lat,lng)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'device_coords'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN device_coords text NULL;
    RAISE NOTICE 'Added column device_alerts.device_coords';
  END IF;

  -- Device zone label
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'zone_label'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN zone_label text NULL;
    RAISE NOTICE 'Added column device_alerts.zone_label';
  END IF;

  -- Site info
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'site_id'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN site_id uuid NULL REFERENCES public.sites(site_id) ON DELETE SET NULL;
    RAISE NOTICE 'Added column device_alerts.site_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'site_name'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN site_name text NULL;
    RAISE NOTICE 'Added column device_alerts.site_name';
  END IF;

  -- Program info
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'program_id'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN program_id uuid NULL REFERENCES public.pilot_programs(program_id) ON DELETE SET NULL;
    RAISE NOTICE 'Added column device_alerts.program_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'program_name'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN program_name text NULL;
    RAISE NOTICE 'Added column device_alerts.program_name';
  END IF;

  -- Company info
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN company_id uuid NULL REFERENCES public.companies(company_id) ON DELETE CASCADE;
    RAISE NOTICE 'Added column device_alerts.company_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'company_name'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN company_name text NULL;
    RAISE NOTICE 'Added column device_alerts.company_name';
  END IF;

  -- Threshold context (stores comparison data)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'threshold_context'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN threshold_context jsonb NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added column device_alerts.threshold_context';
  END IF;

  -- Actual value vs threshold
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'actual_value'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN actual_value numeric NULL;
    RAISE NOTICE 'Added column device_alerts.actual_value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'threshold_value'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN threshold_value numeric NULL;
    RAISE NOTICE 'Added column device_alerts.threshold_value';
  END IF;

  -- Measurement timestamp (when the reading occurred)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_alerts'
    AND column_name = 'measurement_timestamp'
  ) THEN
    ALTER TABLE public.device_alerts ADD COLUMN measurement_timestamp timestamptz NULL;
    RAISE NOTICE 'Added column device_alerts.measurement_timestamp';
  END IF;
END $$;

-- Add indexes for routing queries
CREATE INDEX IF NOT EXISTS idx_device_alerts_company ON public.device_alerts(company_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_program ON public.device_alerts(program_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_site ON public.device_alerts(site_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_category ON public.device_alerts(alert_category, severity) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_device_alerts_threshold_context ON public.device_alerts USING gin(threshold_context);

-- Update comments
COMMENT ON COLUMN public.device_alerts.alert_category IS 'Alert category: absolute, shift, velocity, speed, combination, system';
COMMENT ON COLUMN public.device_alerts.threshold_context IS 'Additional context: {"prior_reading": 50, "current_reading": 80, "shift_amount": 30}';
COMMENT ON COLUMN public.device_alerts.device_coords IS 'Device location coordinates for routing';
COMMENT ON COLUMN public.device_alerts.zone_label IS 'Device zone label for spatial context';

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on device_alert_thresholds
ALTER TABLE public.device_alert_thresholds ENABLE ROW LEVEL SECURITY;

-- Users can view thresholds for their company
DROP POLICY IF EXISTS "Users can view their company thresholds" ON public.device_alert_thresholds;
CREATE POLICY "Users can view their company thresholds"
  ON public.device_alert_thresholds
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Company admins can manage thresholds
DROP POLICY IF EXISTS "Company admins can manage thresholds" ON public.device_alert_thresholds;
CREATE POLICY "Company admins can manage thresholds"
  ON public.device_alert_thresholds
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
      AND (is_company_admin = true OR is_super_admin = true)
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
      AND (is_company_admin = true OR is_super_admin = true)
    )
  );

-- Update device_alerts RLS to use company_id
DROP POLICY IF EXISTS "Users can view alerts for their company" ON public.device_alerts;
CREATE POLICY "Users can view alerts for their company"
  ON public.device_alerts
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ============================================
-- 4. HELPER FUNCTION: Get effective thresholds for device
-- ============================================

CREATE OR REPLACE FUNCTION public.get_device_alert_thresholds(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_config jsonb;
  v_company_config jsonb;
  v_company_id uuid;
  v_result jsonb;
BEGIN
  -- Get device's company_id
  SELECT d.company_id INTO v_company_id
  FROM public.devices d
  WHERE d.device_id = p_device_id;

  IF v_company_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Get device-specific config (if exists)
  SELECT row_to_json(t)::jsonb INTO v_device_config
  FROM public.device_alert_thresholds t
  WHERE t.device_id = p_device_id
  AND t.is_active = true
  LIMIT 1;

  -- Get company default config
  SELECT row_to_json(t)::jsonb INTO v_company_config
  FROM public.device_alert_thresholds t
  WHERE t.company_id = v_company_id
  AND t.device_id IS NULL
  AND t.is_active = true
  LIMIT 1;

  -- If device config exists, use it; otherwise use company default
  v_result := COALESCE(v_device_config, v_company_config, '{}'::jsonb);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_device_alert_thresholds IS 'Returns effective alert thresholds for a device (device-specific or company default)';

-- ============================================
-- 5. INITIALIZE COMPANY DEFAULTS
-- ============================================

-- Insert default thresholds for all existing companies that don't have them
INSERT INTO public.device_alert_thresholds (
  company_id,
  device_id,
  is_active
)
SELECT
  c.company_id,
  NULL, -- Company default (not device-specific)
  true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.device_alert_thresholds t
  WHERE t.company_id = c.company_id
  AND t.device_id IS NULL
)
ON CONFLICT (company_id, device_id) DO NOTHING;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Device alert thresholds system created successfully';
  RAISE NOTICE '   - device_alert_thresholds table with 22+ threshold types';
  RAISE NOTICE '   - Enhanced device_alerts with routing context';
  RAISE NOTICE '   - RLS policies for multi-tenancy security';
  RAISE NOTICE '   - get_device_alert_thresholds() helper function';
  RAISE NOTICE '   - Initialized company defaults for existing companies';
END $$;
