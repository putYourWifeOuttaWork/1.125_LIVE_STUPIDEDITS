/*
  # Phase 1: Telemetry Foundations + Zone Tracking + Alert Infrastructure

  This migration adds:
  1. Device zone/placement fields for spatial tracking (X,Y coordinates)
  2. Site zones for zone-based monitoring
  3. Company alert preferences for threshold management
  4. Report subscriptions for automated alerts
  5. Site snapshots risk tracking
  6. Telemetry-only support (enhances existing device_telemetry table)

  IDEMPOTENT: Uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS where applicable
  NO BREAKING CHANGES: All new columns are nullable or have defaults
*/

-- ============================================
-- 1. DEVICES: Add zone and placement tracking
-- ============================================

-- Add zone identification columns
DO $$
BEGIN
  -- zone_id: Links device to a specific zone within a site
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'devices'
    AND column_name = 'zone_id'
  ) THEN
    ALTER TABLE public.devices ADD COLUMN zone_id uuid NULL;
    RAISE NOTICE 'Added column devices.zone_id';
  END IF;

  -- zone_label: Human-readable zone name (e.g., "North Corner", "Zone A")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'devices'
    AND column_name = 'zone_label'
  ) THEN
    ALTER TABLE public.devices ADD COLUMN zone_label text NULL;
    RAISE NOTICE 'Added column devices.zone_label';
  END IF;

  -- placement_json: Stores X,Y coordinates and additional placement metadata
  -- Format: { "x": 10.5, "y": 25.3, "height": "wall_mounted", "notes": "near door" }
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'devices'
    AND column_name = 'placement_json'
  ) THEN
    ALTER TABLE public.devices ADD COLUMN placement_json jsonb NOT NULL DEFAULT '{}';
    RAISE NOTICE 'Added column devices.placement_json';
  END IF;
END $$;

-- Add indexes for zone queries
CREATE INDEX IF NOT EXISTS idx_devices_zone_id ON public.devices(zone_id);
CREATE INDEX IF NOT EXISTS idx_devices_zone_label ON public.devices(zone_label);
CREATE INDEX IF NOT EXISTS idx_devices_placement_json ON public.devices USING gin(placement_json);

COMMENT ON COLUMN public.devices.zone_id IS 'Links device to a zone within its parent site for spatial tracking';
COMMENT ON COLUMN public.devices.zone_label IS 'Human-readable zone identifier (e.g., North Corner, Zone A)';
COMMENT ON COLUMN public.devices.placement_json IS 'Stores X,Y coordinates and placement metadata: {"x": float, "y": float, "height": string, "notes": string}';

-- ============================================
-- 2. SITES: Add zones configuration
-- ============================================

DO $$
BEGIN
  -- zones: Array of zone definitions for the site
  -- Format: [{ "id": "uuid", "label": "Zone A", "bounds": {"x1": 0, "y1": 0, "x2": 10, "y2": 10}, "risk_level": "medium" }]
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sites'
    AND column_name = 'zones'
  ) THEN
    ALTER TABLE public.sites ADD COLUMN zones jsonb NOT NULL DEFAULT '[]';
    RAISE NOTICE 'Added column sites.zones';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sites_zones ON public.sites USING gin(zones);

COMMENT ON COLUMN public.sites.zones IS 'Array of zone definitions: [{"id": "uuid", "label": "string", "bounds": {x1,y1,x2,y2}, "risk_level": "string"}]';

-- ============================================
-- 3. COMPANY_ALERT_PREFS: Alert threshold configuration
-- ============================================

CREATE TABLE IF NOT EXISTS public.company_alert_prefs (
  company_id uuid PRIMARY KEY REFERENCES public.companies(company_id) ON DELETE CASCADE,

  -- Threshold configuration (flexible JSON for different metric types)
  thresholds jsonb NOT NULL DEFAULT '{
    "telemetry": {
      "temp_max": 40,
      "temp_min": 5,
      "rh_max": 85,
      "rh_min": 20,
      "pressure_max": 1050,
      "pressure_min": 950
    },
    "mgi": {
      "absolute_high": 0.60,
      "absolute_critical": 0.80,
      "velocity_high": 0.25,
      "velocity_critical": 0.40,
      "speed_high_per_day": 0.12,
      "speed_critical_per_day": 0.20
    },
    "window_days": 5,
    "alert_levels": {
      "warning": {"temp": 35, "rh": 80, "mgi": 0.50},
      "danger": {"temp": 38, "rh": 83, "mgi": 0.65},
      "critical": {"temp": 40, "rh": 85, "mgi": 0.80}
    }
  }',

  -- Communication channels configuration
  channels jsonb NOT NULL DEFAULT '{
    "email": {
      "enabled": true,
      "addresses": [],
      "alert_levels": ["warning", "danger", "critical"]
    },
    "sms": {
      "enabled": false,
      "numbers": [],
      "alert_levels": ["danger", "critical"]
    },
    "webhook": {
      "enabled": false,
      "url": null,
      "alert_levels": ["critical"]
    },
    "in_app": {
      "enabled": true,
      "alert_levels": ["warning", "danger", "critical"]
    }
  }',

  -- Quiet hours configuration (no alerts during these times)
  quiet_hours jsonb NULL DEFAULT NULL,
  -- Format: { "enabled": true, "timezone": "America/New_York", "start": "22:00", "end": "07:00", "days": ["mon", "tue", "wed", "thu", "fri"] }

  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_alert_prefs_thresholds ON public.company_alert_prefs USING gin(thresholds);
CREATE INDEX IF NOT EXISTS idx_company_alert_prefs_channels ON public.company_alert_prefs USING gin(channels);

-- Row-level security
ALTER TABLE public.company_alert_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their company alert prefs" ON public.company_alert_prefs;
CREATE POLICY "Users can view their company alert prefs" ON public.company_alert_prefs
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Company admins can update alert prefs" ON public.company_alert_prefs;
CREATE POLICY "Company admins can update alert prefs" ON public.company_alert_prefs
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE id = auth.uid()
      AND (is_company_admin = true OR is_super_admin = true)
    )
  );

COMMENT ON TABLE public.company_alert_prefs IS 'Company-level alert threshold and notification channel configuration';
COMMENT ON COLUMN public.company_alert_prefs.thresholds IS 'Alert threshold definitions for telemetry, MGI, and other metrics';
COMMENT ON COLUMN public.company_alert_prefs.channels IS 'Notification channel configuration (email, SMS, webhook, in-app)';
COMMENT ON COLUMN public.company_alert_prefs.quiet_hours IS 'Optional quiet hours when alerts are suppressed';

-- ============================================
-- 4. REPORT_SUBSCRIPTIONS: Automated reporting
-- ============================================

CREATE TABLE IF NOT EXISTS public.report_subscriptions (
  subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Report type
  kind text NOT NULL CHECK (kind IN ('weekly_digest', 'daily_rollup', 'threshold_alerts', 'mgi_trends', 'zone_comparison')),

  -- Filter configuration for the report
  filters jsonb NOT NULL DEFAULT '{}',
  -- Format: { "program_ids": [], "site_ids": [], "device_ids": [], "metric_types": ["mgi", "temperature"] }

  -- Schedule in cron format (e.g., "0 8 * * 1" for Monday 8am)
  schedule text NOT NULL,

  -- Active status
  active boolean NOT NULL DEFAULT true,

  -- Tracking
  last_sent_at timestamptz NULL,
  next_scheduled_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_company ON public.report_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_user ON public.report_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_active ON public.report_subscriptions(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_next_scheduled ON public.report_subscriptions(next_scheduled_at) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_filters ON public.report_subscriptions USING gin(filters);

-- Row-level security
ALTER TABLE public.report_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.report_subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON public.report_subscriptions
  FOR SELECT
  USING (user_id = auth.uid() OR company_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid() AND (is_company_admin = true OR is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.report_subscriptions;
CREATE POLICY "Users can manage their own subscriptions" ON public.report_subscriptions
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE public.report_subscriptions IS 'User subscriptions for automated reports and alerts';
COMMENT ON COLUMN public.report_subscriptions.kind IS 'Type of report: weekly_digest, daily_rollup, threshold_alerts, mgi_trends, zone_comparison';
COMMENT ON COLUMN public.report_subscriptions.filters IS 'Report scope filters (programs, sites, devices, metrics)';
COMMENT ON COLUMN public.report_subscriptions.schedule IS 'Cron expression for report delivery schedule';

-- ============================================
-- 5. SITE_SNAPSHOTS: Risk snapshot tracking
-- ============================================

-- Check if site_snapshots table exists, create if not
CREATE TABLE IF NOT EXISTS public.site_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(site_id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.pilot_programs(program_id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  snapshot_timestamp timestamptz NOT NULL DEFAULT now(),

  -- Environmental averages
  avg_temperature numeric(5,2),
  avg_humidity numeric(5,2),
  avg_pressure numeric(7,2),

  -- Device health metrics
  total_devices integer DEFAULT 0,
  active_devices integer DEFAULT 0,
  devices_with_alerts integer DEFAULT 0,

  -- Observation counts
  total_observations integer DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add risk_snapshot column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'site_snapshots'
    AND column_name = 'risk_snapshot'
  ) THEN
    ALTER TABLE public.site_snapshots ADD COLUMN risk_snapshot jsonb NOT NULL DEFAULT '{}';
    RAISE NOTICE 'Added column site_snapshots.risk_snapshot';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_site_snapshots_site ON public.site_snapshots(site_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_site_snapshots_risk ON public.site_snapshots USING gin(risk_snapshot);

COMMENT ON COLUMN public.site_snapshots.risk_snapshot IS 'Risk assessment data: {"overall_risk": "low|medium|high|critical", "mgi_avg": float, "mgi_max": float, "zones": {...}, "alerts": {...}}';

-- ============================================
-- 6. TELEMETRY: Ensure company_id exists
-- ============================================

-- Add company_id to device_telemetry for proper data segregation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'device_telemetry'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.device_telemetry ADD COLUMN company_id uuid NULL REFERENCES public.companies(company_id) ON DELETE CASCADE;
    RAISE NOTICE 'Added column device_telemetry.company_id';

    -- Backfill company_id from device lineage
    UPDATE public.device_telemetry dt
    SET company_id = d.company_id
    FROM (
      SELECT
        d.device_id,
        p.company_id
      FROM public.devices d
      LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
      WHERE d.program_id IS NOT NULL
    ) d
    WHERE dt.device_id = d.device_id AND dt.company_id IS NULL;

    RAISE NOTICE 'Backfilled device_telemetry.company_id from device lineage';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_telemetry_company ON public.device_telemetry(company_id);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_captured_at ON public.device_telemetry(captured_at DESC);

-- ============================================
-- 7. HELPER VIEW: Device zone summary
-- ============================================

CREATE OR REPLACE VIEW public.vw_device_zones AS
SELECT
  d.device_id,
  d.device_mac,
  d.device_name,
  d.device_code,
  d.zone_id,
  d.zone_label,
  d.placement_json,
  (d.placement_json->>'x')::numeric AS placement_x,
  (d.placement_json->>'y')::numeric AS placement_y,
  (d.placement_json->>'height') AS placement_height,
  d.site_id,
  s.name AS site_name,
  s.zones AS site_zones,
  d.program_id,
  p.name AS program_name,
  p.company_id,
  c.name AS company_name,
  d.is_active,
  d.last_seen_at,
  d.provisioning_status
FROM public.devices d
LEFT JOIN public.sites s ON s.site_id = d.site_id
LEFT JOIN public.pilot_programs p ON p.program_id = d.program_id
LEFT JOIN public.companies c ON c.company_id = p.company_id;

COMMENT ON VIEW public.vw_device_zones IS 'Device zone placement with site context and X,Y coordinates extracted from placement_json';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Phase 1 migration completed successfully';
  RAISE NOTICE '   - Added device zone tracking (zone_id, zone_label, placement_json with X,Y)';
  RAISE NOTICE '   - Added site zones configuration';
  RAISE NOTICE '   - Created company_alert_prefs table with RLS';
  RAISE NOTICE '   - Created report_subscriptions table';
  RAISE NOTICE '   - Enhanced site_snapshots with risk_snapshot';
  RAISE NOTICE '   - Added company_id to device_telemetry with backfill';
  RAISE NOTICE '   - Created vw_device_zones view';
END $$;
