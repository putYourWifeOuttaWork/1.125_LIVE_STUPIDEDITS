/*
  # Change colony_count default from NULL to 0

  1. Modified Columns
    - `device_images.colony_count` - Set DEFAULT 0, backfill existing NULLs to 0
    - `devices.latest_colony_count` - Set DEFAULT 0, backfill existing NULLs to 0

  2. Index Update
    - Replace partial index (WHERE colony_count IS NOT NULL) with a full index
      since all rows now have a value

  3. Trigger Update
    - Update `calculate_and_rollup_mgi()` to always compute colony_count_velocity
      (since colony_count is always 0 or higher, never NULL)

  4. Important Notes
    - colony_count = 0 now means either "no colonies detected" or "not yet analyzed"
    - All existing NULL colony_count values are backfilled to 0
    - No destructive changes; only defaults and backfills
*/

-- =====================================================
-- 1. Set DEFAULT 0 on colony_count columns
-- =====================================================

ALTER TABLE device_images ALTER COLUMN colony_count SET DEFAULT 0;
ALTER TABLE devices ALTER COLUMN latest_colony_count SET DEFAULT 0;

-- =====================================================
-- 2. Backfill existing NULLs to 0
-- =====================================================

UPDATE device_images SET colony_count = 0 WHERE colony_count IS NULL;
UPDATE devices SET latest_colony_count = 0 WHERE latest_colony_count IS NULL;

-- =====================================================
-- 3. Replace partial index with full index
-- =====================================================

DROP INDEX IF EXISTS idx_device_images_colony_count;

CREATE INDEX IF NOT EXISTS idx_device_images_colony_count
  ON device_images (device_id, captured_at);

-- =====================================================
-- 4. Update trigger function for 0-based colony_count
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_and_rollup_mgi()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_mgi numeric;
  v_prev_captured_at timestamptz;
  v_calculated_velocity numeric;
  v_program_start_date date;
  v_capture_date date;
  v_days_since_start numeric;
  v_prev_colony_count integer;
BEGIN
  IF NEW.mgi_score IS NOT NULL THEN
    SELECT mgi_score, captured_at
    INTO v_prev_mgi, v_prev_captured_at
    FROM device_images
    WHERE device_id = NEW.device_id
      AND captured_at < NEW.captured_at
      AND mgi_score IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT 1;

    IF v_prev_mgi IS NOT NULL THEN
      v_calculated_velocity := NEW.mgi_score - v_prev_mgi;
      NEW.mgi_velocity := v_calculated_velocity;
    ELSE
      NEW.mgi_velocity := 0;
    END IF;

    SELECT pp.start_date INTO v_program_start_date
    FROM sites s
    JOIN pilot_programs pp ON pp.program_id = s.program_id
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

    UPDATE devices
    SET
      latest_mgi_score = NEW.mgi_score,
      latest_mgi_velocity = NEW.mgi_velocity,
      latest_mgi_at = NEW.captured_at,
      updated_at = now()
    WHERE device_id = NEW.device_id
      AND (
        latest_mgi_at IS NULL
        OR NEW.captured_at > latest_mgi_at
      );
  END IF;

  IF NEW.colony_count IS NOT NULL THEN
    SELECT colony_count
    INTO v_prev_colony_count
    FROM device_images
    WHERE device_id = NEW.device_id
      AND captured_at < NEW.captured_at
    ORDER BY captured_at DESC
    LIMIT 1;

    NEW.colony_count_velocity := NEW.colony_count - COALESCE(v_prev_colony_count, 0);

    UPDATE devices
    SET
      latest_colony_count = NEW.colony_count,
      latest_colony_count_at = NEW.captured_at,
      updated_at = now()
    WHERE device_id = NEW.device_id
      AND (
        latest_colony_count_at IS NULL
        OR NEW.captured_at > latest_colony_count_at
      );
  END IF;

  RETURN NEW;
END;
$$;
