-- Add wake_payload_id to device_images
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS wake_payload_id UUID REFERENCES device_wake_payloads(payload_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_device_images_wake_payload ON device_images(wake_payload_id);

-- Add wake_payload_id to device_telemetry
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS wake_payload_id UUID REFERENCES device_wake_payloads(payload_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_device_telemetry_wake_payload ON device_telemetry(wake_payload_id);

-- Add MGI fields to device_images
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS mgi_velocity NUMERIC(6,2);
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS mgi_speed NUMERIC(6,3);
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS roboflow_response JSONB;
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

-- Add indexes for MGI queries
CREATE INDEX IF NOT EXISTS idx_device_images_mgi_score ON device_images(mgi_score) WHERE mgi_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_images_mgi_velocity ON device_images(mgi_velocity) WHERE mgi_velocity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_images_device_captured ON device_images(device_id, captured_at DESC);

-- Add latest MGI to devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS latest_mgi_score NUMERIC(5,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS latest_mgi_velocity NUMERIC(6,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS latest_mgi_at TIMESTAMPTZ;

-- Add snapshot cadence to sites
ALTER TABLE sites ADD COLUMN IF NOT EXISTS snapshot_cadence_hours INT DEFAULT 3 CHECK (snapshot_cadence_hours >= 1 AND snapshot_cadence_hours <= 24);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_snapshot_at TIMESTAMPTZ;

-- Create site_snapshots table
CREATE TABLE IF NOT EXISTS site_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  snapshot_time TIMESTAMPTZ NOT NULL,
  device_states JSONB NOT NULL,
  zone_analytics JSONB,
  device_count INT NOT NULL DEFAULT 0,
  active_device_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_snapshots_company ON site_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_site_snapshots_site ON site_snapshots(site_id);
CREATE INDEX IF NOT EXISTS idx_site_snapshots_time ON site_snapshots(snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_site_snapshots_site_time ON site_snapshots(site_id, snapshot_time DESC);

ALTER TABLE site_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see snapshots in their company" ON site_snapshots;
CREATE POLICY "Users see snapshots in their company"
  ON site_snapshots FOR SELECT TO authenticated
  USING (company_id = get_active_company_id());

-- MGI Velocity Calculation Trigger
CREATE OR REPLACE FUNCTION calculate_mgi_velocity()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_day_last_mgi NUMERIC(5,2);
  v_capture_date DATE;
  v_previous_date DATE;
BEGIN
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    v_capture_date := DATE(NEW.captured_at AT TIME ZONE 'UTC');
    v_previous_date := v_capture_date - INTERVAL '1 day';
    
    SELECT mgi_score INTO v_previous_day_last_mgi
    FROM device_images
    WHERE device_id = NEW.device_id
      AND DATE(captured_at AT TIME ZONE 'UTC') = v_previous_date
      AND mgi_score IS NOT NULL
      AND image_id != NEW.image_id
    ORDER BY captured_at DESC
    LIMIT 1;
    
    IF v_previous_day_last_mgi IS NOT NULL THEN
      NEW.mgi_velocity := (NEW.mgi_score - v_previous_day_last_mgi) / 1.0;
    ELSE
      NEW.mgi_velocity := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mgi_score_calculate_velocity ON device_images;
CREATE TRIGGER on_mgi_score_calculate_velocity
  BEFORE INSERT OR UPDATE OF mgi_score ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION calculate_mgi_velocity();

-- MGI Speed Calculation Trigger
CREATE OR REPLACE FUNCTION calculate_mgi_speed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_program_start_date DATE;
  v_capture_date DATE;
  v_days_since_start NUMERIC;
BEGIN
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    SELECT s.program_start_date INTO v_program_start_date
    FROM sites s
    WHERE s.site_id = NEW.site_id;
    
    IF v_program_start_date IS NOT NULL THEN
      v_capture_date := DATE(NEW.captured_at AT TIME ZONE 'UTC');
      v_days_since_start := v_capture_date - v_program_start_date;
      
      IF v_days_since_start > 0 THEN
        NEW.mgi_speed := NEW.mgi_score / v_days_since_start;
      ELSE
        NEW.mgi_speed := NEW.mgi_score;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mgi_score_calculate_speed ON device_images;
CREATE TRIGGER on_mgi_score_calculate_speed
  BEFORE INSERT OR UPDATE OF mgi_score ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION calculate_mgi_speed();

-- Update Device Latest MGI Trigger
CREATE OR REPLACE FUNCTION update_device_latest_mgi()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    UPDATE devices
    SET 
      latest_mgi_score = NEW.mgi_score,
      latest_mgi_velocity = NEW.mgi_velocity,
      latest_mgi_at = NEW.captured_at
    WHERE device_id = NEW.device_id
      AND (latest_mgi_at IS NULL OR NEW.captured_at > latest_mgi_at);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mgi_score_update_device ON device_images;
CREATE TRIGGER on_mgi_score_update_device
  AFTER INSERT OR UPDATE OF mgi_score ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION update_device_latest_mgi();

-- Generate Site Snapshot Function
CREATE OR REPLACE FUNCTION generate_site_snapshot(p_site_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_snapshot_id UUID;
  v_company_id UUID;
  v_program_id UUID;
  v_device_states JSONB;
  v_device_count INT;
  v_active_count INT;
BEGIN
  SELECT s.company_id, s.program_id INTO v_company_id, v_program_id
  FROM sites s
  WHERE s.site_id = p_site_id;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Site not found: %', p_site_id;
  END IF;
  
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'device_id', d.device_id,
        'device_name', d.device_name,
        'x_position', d.x_position,
        'y_position', d.y_position,
        'latest_mgi_score', d.latest_mgi_score,
        'latest_mgi_velocity', d.latest_mgi_velocity,
        'battery_voltage', d.battery_voltage
      )
    ),
    COUNT(*),
    COUNT(*) FILTER (WHERE d.is_active = true)
  INTO v_device_states, v_device_count, v_active_count
  FROM devices d
  WHERE d.site_id = p_site_id;
  
  INSERT INTO site_snapshots (
    company_id, program_id, site_id, snapshot_time,
    device_states, device_count, active_device_count
  ) VALUES (
    v_company_id, v_program_id, p_site_id, NOW(),
    COALESCE(v_device_states, '[]'::jsonb),
    COALESCE(v_device_count, 0), COALESCE(v_active_count, 0)
  )
  RETURNING snapshot_id INTO v_snapshot_id;
  
  UPDATE sites SET last_snapshot_at = NOW() WHERE site_id = p_site_id;
  
  RETURN v_snapshot_id;
END;
$$;

-- Generate Due Site Snapshots Function
CREATE OR REPLACE FUNCTION generate_due_site_snapshots()
RETURNS TABLE (site_id UUID, snapshot_id UUID, snapshot_time TIMESTAMPTZ)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_site RECORD;
  v_snapshot_id UUID;
BEGIN
  FOR v_site IN
    SELECT s.site_id
    FROM sites s
    WHERE s.is_active = true
      AND (s.last_snapshot_at IS NULL
        OR s.last_snapshot_at < NOW() - (s.snapshot_cadence_hours || ' hours')::INTERVAL)
  LOOP
    v_snapshot_id := generate_site_snapshot(v_site.site_id);
    RETURN QUERY SELECT v_site.site_id, v_snapshot_id, NOW();
  END LOOP;
  
  RETURN;
END;
$$;
