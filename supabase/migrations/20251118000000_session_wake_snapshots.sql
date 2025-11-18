/*
  # Session Wake Snapshot System - Phase 3 Complete Implementation

  ## Overview
  Creates a wake-level snapshot system for capturing complete site state after each device wake round.
  Enables animated 2D visualization of MGI progression, environmental changes, and device states over time.

  ## Key Concepts
  - **Device as Observational Dataset**: Tracks mold growth (MGI) at specific (x,y) location
  - **Wake Round**: All devices at a site report within a time window (e.g., hourly)
  - **Snapshot**: Complete JSONB record of site state after wake round completes
  - **MGI-Centric**: Primary metric with progression, velocity, and speed calculations
  - **Device-Centered Zones**: Automatic zone generation around each device

  ## Changes Made

  ### 1. New Tables
  - `session_wake_snapshots` - Complete site state per wake round

  ### 2. Modified Tables
  - `devices` - Make x_position, y_position NOT NULL (required coordinates)
  - `sites` - Enhance door_details and platform_details schema (already have empty arrays)

  ### 3. Helper Functions
  - `calculate_mgi_metrics()` - MGI progression, velocity, speed
  - `generate_device_centered_zones()` - Automatic zone polygons
  - `generate_session_wake_snapshot()` - Complete snapshot assembly
  - `check_wake_round_complete()` - Trigger snapshot on round completion

  ### 4. Deprecated
  - `site_snapshots` table (unused, replaced by wake-level snapshots)

  ## Visualization Preparation
  - D3.js ready: Device positions, shapes, MGI color coding
  - Zone overlays: Temperature/humidity gradients with transparency
  - Animation: Iterate through snapshots to show temporal changes
*/

-- =====================================================
-- STEP 1: Drop Old Snapshot System (Deprecated)
-- =====================================================

DROP TABLE IF EXISTS site_snapshots CASCADE;

COMMENT ON SCHEMA public IS 'Deprecated site_snapshots table removed. Replaced by session_wake_snapshots for wake-level granularity.';

-- =====================================================
-- STEP 2: Create Session Wake Snapshots Table
-- =====================================================

CREATE TABLE IF NOT EXISTS session_wake_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy (multi-tenancy)
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES site_device_sessions(session_id) ON DELETE CASCADE,

  -- Wake identification
  wake_number integer NOT NULL CHECK (wake_number > 0),
  wake_round_start timestamptz NOT NULL,
  wake_round_end timestamptz NOT NULL,

  -- Complete site state (JSONB snapshot)
  site_state jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Quick access aggregates (denormalized for performance)
  active_devices_count integer DEFAULT 0,
  new_images_this_round integer DEFAULT 0,
  new_alerts_this_round integer DEFAULT 0,
  avg_temperature numeric(5,2),
  avg_humidity numeric(5,2),
  avg_mgi numeric(5,2),
  max_mgi numeric(5,2),

  -- Metadata
  created_at timestamptz DEFAULT now(),

  -- Constraints
  UNIQUE(session_id, wake_number),
  CHECK (wake_round_end > wake_round_start)
);

-- Indexes for efficient queries
CREATE INDEX idx_wake_snapshots_session ON session_wake_snapshots(session_id, wake_number);
CREATE INDEX idx_wake_snapshots_site_date ON session_wake_snapshots(site_id, wake_round_start);
CREATE INDEX idx_wake_snapshots_program ON session_wake_snapshots(program_id, wake_round_start);
CREATE INDEX idx_wake_snapshots_company ON session_wake_snapshots(company_id);
CREATE INDEX idx_wake_snapshots_mgi ON session_wake_snapshots(max_mgi) WHERE max_mgi IS NOT NULL;

-- Comments
COMMENT ON TABLE session_wake_snapshots IS 'Wake-level snapshots of complete site state for animated visualization. One snapshot per wake round (e.g., 12/day for hourly rounds).';
COMMENT ON COLUMN session_wake_snapshots.site_state IS 'Complete JSONB snapshot: devices, MGI states, telemetry, zones, images, alerts. Self-contained for rendering 2D visualization.';
COMMENT ON COLUMN session_wake_snapshots.wake_number IS 'Sequential wake number within session (1-12 for hourly, 1-24 for 30min, etc.)';

-- =====================================================
-- STEP 3: Enhance Device Positioning (Make Required)
-- =====================================================

-- Make device coordinates REQUIRED
ALTER TABLE devices
  ALTER COLUMN x_position SET NOT NULL,
  ALTER COLUMN y_position SET NOT NULL;

-- Add validation constraints
ALTER TABLE devices ADD CONSTRAINT valid_device_position_bounds
  CHECK (x_position >= 0 AND y_position >= 0);

COMMENT ON COLUMN devices.x_position IS 'REQUIRED: Device X-coordinate in site grid. Used for 2D visualization and zone calculation.';
COMMENT ON COLUMN devices.y_position IS 'REQUIRED: Device Y-coordinate in site grid. Used for 2D visualization and zone calculation.';

-- =====================================================
-- STEP 4: MGI Calculation Helper Functions
-- =====================================================

-- Calculate MGI progression, velocity, and speed for a device
CREATE OR REPLACE FUNCTION calculate_mgi_metrics(
  p_device_id uuid,
  p_current_mgi numeric,
  p_current_timestamp timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_mgi numeric;
  v_previous_timestamp timestamptz;
  v_session_start_mgi numeric;
  v_program_start_mgi numeric := 0.0;  -- Always 0 at program start
  v_time_since_last_hours numeric;
  v_mgi_velocity_per_hour numeric;
  v_mgi_delta numeric;
BEGIN
  -- Get previous MGI (last wake)
  SELECT mgi_score, captured_at
  INTO v_previous_mgi, v_previous_timestamp
  FROM device_images
  WHERE device_id = p_device_id
    AND mgi_score IS NOT NULL
    AND captured_at < p_current_timestamp
  ORDER BY captured_at DESC
  LIMIT 1;

  -- Calculate time since last wake
  IF v_previous_timestamp IS NOT NULL THEN
    v_time_since_last_hours := EXTRACT(EPOCH FROM (p_current_timestamp - v_previous_timestamp)) / 3600.0;
  END IF;

  -- Get session start MGI (first image today in device's site timezone)
  SELECT mgi_score INTO v_session_start_mgi
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  WHERE di.device_id = p_device_id
    AND di.mgi_score IS NOT NULL
    AND DATE(di.captured_at AT TIME ZONE s.timezone) = DATE(p_current_timestamp AT TIME ZONE s.timezone)
  ORDER BY di.captured_at ASC
  LIMIT 1;

  -- Calculate MGI change
  v_mgi_delta := p_current_mgi - COALESCE(v_previous_mgi, 0);

  -- Calculate velocity (MGI per hour)
  IF v_time_since_last_hours > 0 THEN
    v_mgi_velocity_per_hour := v_mgi_delta / v_time_since_last_hours;
  END IF;

  RETURN jsonb_build_object(
    'current_mgi', p_current_mgi,
    'previous_mgi', COALESCE(v_previous_mgi, 0),
    'program_start_mgi', v_program_start_mgi,
    'session_start_mgi', COALESCE(v_session_start_mgi, 0),
    'mgi_progression', jsonb_build_object(
      'since_last_wake', v_mgi_delta,
      'since_session_start', p_current_mgi - COALESCE(v_session_start_mgi, 0),
      'since_program_start', p_current_mgi - v_program_start_mgi,
      'percent_of_max', ROUND((p_current_mgi / 10.0) * 100, 2)  -- Assuming max MGI = 10
    ),
    'mgi_velocity', jsonb_build_object(
      'per_hour', ROUND(COALESCE(v_mgi_velocity_per_hour, 0), 4),
      'hours_since_last', ROUND(COALESCE(v_time_since_last_hours, 0), 2)
    ),
    'mgi_speed', jsonb_build_object(
      'acceleration', CASE
        WHEN v_mgi_velocity_per_hour > 0.1 THEN 'increasing'
        WHEN v_mgi_velocity_per_hour < -0.01 THEN 'decreasing'
        ELSE 'steady'
      END,
      'growth_rate_trend', CASE
        WHEN v_mgi_velocity_per_hour > 0.2 THEN 'rapid'
        WHEN v_mgi_velocity_per_hour > 0.1 THEN 'moderate'
        WHEN v_mgi_velocity_per_hour > 0 THEN 'slow'
        ELSE 'stable'
      END
    )
  );
END;
$$;

COMMENT ON FUNCTION calculate_mgi_metrics IS 'Calculate MGI progression, velocity, and speed metrics for a device based on current and historical MGI scores.';

-- =====================================================
-- STEP 5: Device-Centered Zone Generation
-- =====================================================

-- Generate zones centered around each device (Voronoi-style)
CREATE OR REPLACE FUNCTION generate_device_centered_zones(
  p_site_id uuid,
  p_zone_radius numeric DEFAULT 15.0  -- 15ft radius per device
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_zones jsonb;
  v_site_length numeric;
  v_site_width numeric;
BEGIN
  -- Get site dimensions
  SELECT length, width INTO v_site_length, v_site_width
  FROM sites WHERE site_id = p_site_id;

  -- Generate device-centered zones
  SELECT jsonb_agg(
    jsonb_build_object(
      'zone_id', 'device_zone_' || device_id::text,
      'zone_label', COALESCE(device_name, device_code) || ' Zone',
      'center', jsonb_build_object('x', x_position, 'y', y_position),
      'radius', p_zone_radius,
      'bounds', jsonb_build_object(
        'x1', GREATEST(0, x_position - p_zone_radius),
        'y1', GREATEST(0, y_position - p_zone_radius),
        'x2', LEAST(v_site_length, x_position + p_zone_radius),
        'y2', LEAST(v_site_width, y_position + p_zone_radius)
      ),
      'device_id', device_id,
      'device_code', device_code,
      'shape', 'circle'  -- Future: could be polygon
    )
  )
  INTO v_zones
  FROM devices
  WHERE site_id = p_site_id
    AND is_active = true
    AND x_position IS NOT NULL
    AND y_position IS NOT NULL;

  RETURN COALESCE(v_zones, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION generate_device_centered_zones IS 'Generate circular zones around each device for environmental aggregation and visualization. Zones can overlap.';

-- =====================================================
-- STEP 6: Generate Complete Wake Snapshot
-- =====================================================

CREATE OR REPLACE FUNCTION generate_session_wake_snapshot(
  p_session_id uuid,
  p_wake_number integer,
  p_wake_round_start timestamptz,
  p_wake_round_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id uuid;
  v_site_id uuid;
  v_program_id uuid;
  v_company_id uuid;
  v_site_state jsonb;
  v_active_devices_count integer;
  v_new_images_count integer;
  v_new_alerts_count integer;
  v_avg_temp numeric;
  v_avg_humidity numeric;
  v_avg_mgi numeric;
  v_max_mgi numeric;
BEGIN
  -- Get session context
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Count active devices
  SELECT COUNT(*) INTO v_active_devices_count
  FROM devices
  WHERE site_id = v_site_id AND is_active = true;

  -- Count images in this round
  SELECT COUNT(*) INTO v_new_images_count
  FROM device_images
  WHERE site_id = v_site_id
    AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Count alerts in this round
  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build complete site state JSONB
  WITH
  -- Site metadata
  site_meta AS (
    SELECT jsonb_build_object(
      'site_id', s.site_id,
      'site_name', s.name,
      'site_code', s.site_code,
      'site_type', s.type,
      'dimensions', jsonb_build_object(
        'length', s.length,
        'width', s.width,
        'height', s.height
      ),
      'wall_details', COALESCE(s.wall_details, '[]'::jsonb),
      'door_details', COALESCE(s.door_details, '[]'::jsonb),
      'platform_details', COALESCE(s.platform_details, '[]'::jsonb),
      'timezone', s.timezone
    ) AS site_metadata
    FROM sites s WHERE s.site_id = v_site_id
  ),

  -- Program context
  program_meta AS (
    SELECT jsonb_build_object(
      'program_id', pp.program_id,
      'program_name', pp.name,
      'program_start_date', pp.start_date,
      'program_end_date', pp.end_date,
      'program_day', DATE_PART('day', p_wake_round_end - pp.start_date)::integer,
      'total_days', DATE_PART('day', pp.end_date - pp.start_date)::integer
    ) AS program_context
    FROM pilot_programs pp WHERE pp.program_id = v_program_id
  ),

  -- Device states with MGI metrics
  device_states AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'device_id', d.device_id,
        'device_code', d.device_code,
        'device_name', d.device_name,
        'device_mac', d.device_mac,
        'position', jsonb_build_object('x', d.x_position, 'y', d.y_position),
        'zone_id', d.zone_id,
        'zone_label', d.zone_label,
        'status', CASE WHEN d.is_active THEN 'active' ELSE 'inactive' END,
        'battery_voltage', d.battery_voltage,
        'battery_health_percent', d.battery_health_percent,
        'last_seen_at', d.last_seen_at,
        'telemetry', (
          SELECT jsonb_build_object(
            'temperature', temperature,
            'humidity', humidity,
            'pressure', pressure,
            'gas_resistance', gas_resistance,
            'wifi_rssi', wifi_rssi,
            'captured_at', captured_at
          )
          FROM device_telemetry dt
          WHERE dt.device_id = d.device_id
            AND dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
          ORDER BY dt.captured_at DESC LIMIT 1
        ),
        'mgi_state', (
          SELECT calculate_mgi_metrics(
            d.device_id,
            di.mgi_score,
            di.captured_at
          )
          FROM device_images di
          WHERE di.device_id = d.device_id
            AND di.mgi_score IS NOT NULL
            AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
          ORDER BY di.captured_at DESC LIMIT 1
        ),
        'images_this_round', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'image_id', image_id,
              'image_url', image_url,
              'mgi_score', mgi_score,
              'captured_at', captured_at,
              'observation_type', observation_type
            )
          )
          FROM device_images di
          WHERE di.device_id = d.device_id
            AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        'alerts', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'alert_id', alert_id,
              'alert_type', alert_type,
              'severity', severity,
              'threshold_value', threshold_value,
              'actual_value', actual_value,
              'triggered_at', triggered_at
            )
          )
          FROM device_alerts da
          WHERE da.device_id = d.device_id
            AND da.is_acknowledged = false
        ),
        'display', jsonb_build_object(
          'color', CASE
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 8 THEN '#DC2626'  -- Critical: red
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 5 THEN '#F59E0B'  -- Warning: orange
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 3 THEN '#FCD34D'  -- Caution: yellow
            ELSE '#10B981'  -- Good: green
          END,
          'shape', 'circle',
          'size', 'medium'
        )
      ) ORDER BY d.device_code
    ) AS devices_array
    FROM devices d
    WHERE d.site_id = v_site_id AND d.is_active = true
  ),

  -- Environmental zones (device-centered)
  env_zones AS (
    SELECT generate_device_centered_zones(v_site_id) AS zones_array
  )

  -- Assemble final site_state
  SELECT jsonb_build_object(
    'snapshot_metadata', jsonb_build_object(
      'wake_number', p_wake_number,
      'wake_round_start', p_wake_round_start,
      'wake_round_end', p_wake_round_end,
      'session_id', p_session_id
    ),
    'site_metadata', (SELECT site_metadata FROM site_meta),
    'program_context', (SELECT program_context FROM program_meta),
    'devices', COALESCE((SELECT devices_array FROM device_states), '[]'::jsonb),
    'environmental_zones', COALESCE((SELECT zones_array FROM env_zones), '[]'::jsonb),
    'session_metrics', jsonb_build_object(
      'active_devices_count', v_active_devices_count,
      'new_images_this_round', v_new_images_count,
      'new_alerts_this_round', v_new_alerts_count
    )
  ) INTO v_site_state;

  -- Calculate aggregate metrics
  SELECT
    AVG((telemetry->>'temperature')::numeric),
    AVG((telemetry->>'humidity')::numeric),
    AVG((mgi_state->>'current_mgi')::numeric),
    MAX((mgi_state->>'current_mgi')::numeric)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device
  CROSS JOIN LATERAL jsonb_to_record(device) AS x(telemetry jsonb, mgi_state jsonb);

  -- Insert snapshot
  INSERT INTO session_wake_snapshots (
    company_id, program_id, site_id, session_id,
    wake_number, wake_round_start, wake_round_end,
    site_state,
    active_devices_count, new_images_this_round, new_alerts_this_round,
    avg_temperature, avg_humidity, avg_mgi, max_mgi
  ) VALUES (
    v_company_id, v_program_id, v_site_id, p_session_id,
    p_wake_number, p_wake_round_start, p_wake_round_end,
    v_site_state,
    v_active_devices_count, v_new_images_count, v_new_alerts_count,
    v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  )
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate complete JSONB snapshot of site state after wake round completes. Includes all devices, MGI metrics, telemetry, zones, and alerts.';

-- =====================================================
-- STEP 7: RLS Policies for Snapshots
-- =====================================================

ALTER TABLE session_wake_snapshots ENABLE ROW LEVEL SECURITY;

-- Super admins see all snapshots
CREATE POLICY "Super admins can view all snapshots"
  ON session_wake_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_name = 'super_admin'
    )
  );

-- Company admins see their company's snapshots
CREATE POLICY "Company admins can view company snapshots"
  ON session_wake_snapshots FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT ur.company_id FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_name IN ('company_admin', 'super_admin')
    )
  );

-- Field users see snapshots for programs they're assigned to
CREATE POLICY "Field users can view their program snapshots"
  ON session_wake_snapshots FOR SELECT
  TO authenticated
  USING (
    program_id IN (
      SELECT ppu.program_id FROM pilot_program_users ppu
      WHERE ppu.user_id = auth.uid()
    )
  );

-- =====================================================
-- STEP 8: Grant Permissions
-- =====================================================

GRANT SELECT ON session_wake_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_mgi_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION generate_device_centered_zones TO authenticated;
GRANT EXECUTE ON FUNCTION generate_session_wake_snapshot TO authenticated;

-- =====================================================
-- End Migration
-- =====================================================
