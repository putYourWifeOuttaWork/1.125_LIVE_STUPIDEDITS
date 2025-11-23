/*
  # Phase 3: Roll-Up Counter Triggers

  ## Purpose
  Create database triggers to automatically maintain roll-up counters on the devices table.
  These counters provide real-time statistics without expensive aggregation queries.

  ## Changes

  ### 1. Trigger: increment_device_wake_count
  - Fires on INSERT to device_wake_payloads
  - Increments devices.total_wakes
  - Updates devices.last_wake_at

  ### 2. Trigger: increment_device_image_count
  - Fires on UPDATE to device_images when status changes to 'complete'
  - Increments devices.total_images_taken
  - Updates devices.latest_mgi_score, latest_mgi_velocity, latest_mgi_at

  ### 3. Trigger: increment_device_alert_count
  - Fires on INSERT to device_alerts
  - Increments devices.total_alerts
  - Increments specific alert type counters (e.g., total_battery_health_alerts)

  ### 4. Scheduled Job: recalculate_expected_images
  - Runs daily at midnight UTC
  - Calculates total_images_expected_to_date from wake_schedule_cron
  - Accounts for days since device was mapped/provisioned

  ## Safety
  - Uses CREATE OR REPLACE for idempotency
  - Triggers are efficient (single UPDATE per event)
  - Scheduled job only processes active devices
*/

-- =====================================================================
-- 1. TRIGGER: Increment Wake Count
-- =====================================================================

CREATE OR REPLACE FUNCTION increment_device_wake_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devices
  SET
    total_wakes = COALESCE(total_wakes, 0) + 1,
    last_wake_at = NEW.captured_at,
    updated_at = NOW()
  WHERE device_id = NEW.device_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_wake_count ON device_wake_payloads;

CREATE TRIGGER trg_increment_wake_count
  AFTER INSERT ON device_wake_payloads
  FOR EACH ROW
  EXECUTE FUNCTION increment_device_wake_count();

COMMENT ON FUNCTION increment_device_wake_count() IS
  'Automatically increments devices.total_wakes and updates last_wake_at when a new wake payload is recorded';

-- =====================================================================
-- 2. TRIGGER: Increment Image Count
-- =====================================================================

CREATE OR REPLACE FUNCTION increment_device_image_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'complete' AND (OLD.status IS NULL OR OLD.status != 'complete') THEN
    UPDATE devices
    SET
      total_images_taken = COALESCE(total_images_taken, 0) + 1,
      latest_mgi_score = COALESCE(NEW.mgi_score, latest_mgi_score),
      latest_mgi_velocity = COALESCE(NEW.mgi_velocity, latest_mgi_velocity),
      latest_mgi_at = CASE
        WHEN NEW.scored_at IS NOT NULL THEN NEW.scored_at
        ELSE latest_mgi_at
      END,
      updated_at = NOW()
    WHERE device_id = NEW.device_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_image_count ON device_images;

CREATE TRIGGER trg_increment_image_count
  AFTER UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION increment_device_image_count();

COMMENT ON FUNCTION increment_device_image_count() IS
  'Automatically increments devices.total_images_taken and updates MGI metrics when an image completes';

-- =====================================================================
-- 3. TRIGGER: Increment Alert Count
-- =====================================================================

CREATE OR REPLACE FUNCTION increment_device_alert_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devices
  SET
    total_alerts = COALESCE(total_alerts, 0) + 1,
    total_battery_health_alerts = CASE
      WHEN NEW.alert_type = 'battery_health'
      THEN COALESCE(total_battery_health_alerts, 0) + 1
      ELSE COALESCE(total_battery_health_alerts, 0)
    END,
    updated_at = NOW()
  WHERE device_id = NEW.device_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_alert_count ON device_alerts;

CREATE TRIGGER trg_increment_alert_count
  AFTER INSERT ON device_alerts
  FOR EACH ROW
  EXECUTE FUNCTION increment_device_alert_count();

COMMENT ON FUNCTION increment_device_alert_count() IS
  'Automatically increments devices.total_alerts and specific alert type counters when new alerts are created';

-- =====================================================================
-- 4. SCHEDULED JOB: Recalculate Expected Images
-- =====================================================================

CREATE OR REPLACE FUNCTION recalculate_expected_images()
RETURNS void AS $$
DECLARE
  device_record RECORD;
  wakes_per_day INTEGER;
  days_active INTEGER;
  expected_count INTEGER;
BEGIN
  FOR device_record IN
    SELECT
      device_id,
      wake_schedule_cron,
      mapped_at,
      provisioned_at,
      total_images_expected_to_date
    FROM devices
    WHERE is_active = TRUE
      AND wake_schedule_cron IS NOT NULL
  LOOP
    wakes_per_day := 0;

    IF device_record.wake_schedule_cron ~ '0 \*/(\d+) \* \* \*' THEN
      wakes_per_day := 24 / CAST(
        substring(device_record.wake_schedule_cron FROM '\*/(\d+)') AS INTEGER
      );
    ELSIF device_record.wake_schedule_cron ~ '0 ([0-9,]+) \* \* \*' THEN
      wakes_per_day := array_length(
        string_to_array(
          substring(device_record.wake_schedule_cron FROM '0 ([0-9,]+)'),
          ','
        ),
        1
      );
    END IF;

    days_active := GREATEST(
      1,
      EXTRACT(DAY FROM (
        NOW() - COALESCE(device_record.mapped_at, device_record.provisioned_at, NOW())
      ))::INTEGER
    );

    expected_count := wakes_per_day * days_active;

    IF expected_count != COALESCE(device_record.total_images_expected_to_date, 0) THEN
      UPDATE devices
      SET
        total_images_expected_to_date = expected_count,
        updated_at = NOW()
      WHERE device_id = device_record.device_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Expected images recalculated for active devices';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_expected_images() IS
  'Daily job to calculate total_images_expected_to_date based on wake schedule and days active';

DO $$
BEGIN
  PERFORM cron.unschedule('recalculate-expected-images');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'recalculate-expected-images',
    '0 0 * * *',
    $$SELECT recalculate_expected_images()$$
  );
  RAISE NOTICE 'Scheduled recalculate_expected_images to run daily at midnight UTC';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron extension not available. Expected images will need manual recalculation.';
  WHEN others THEN
    RAISE WARNING 'Could not schedule job: %', SQLERRM;
END $$;

-- =====================================================================
-- 5. BACKFILL: Recalculate All Existing Counters
-- =====================================================================

UPDATE devices d
SET
  total_wakes = (
    SELECT COUNT(*)
    FROM device_wake_payloads
    WHERE device_id = d.device_id
  ),
  total_images_taken = (
    SELECT COUNT(*)
    FROM device_images
    WHERE device_id = d.device_id
      AND status = 'complete'
  ),
  total_alerts = (
    SELECT COUNT(*)
    FROM device_alerts
    WHERE device_id = d.device_id
  ),
  total_battery_health_alerts = (
    SELECT COUNT(*)
    FROM device_alerts
    WHERE device_id = d.device_id
      AND alert_type = 'battery_health'
  ),
  latest_mgi_score = (
    SELECT mgi_score
    FROM device_images
    WHERE device_id = d.device_id
      AND mgi_score IS NOT NULL
      AND status = 'complete'
    ORDER BY scored_at DESC NULLS LAST
    LIMIT 1
  ),
  latest_mgi_velocity = (
    SELECT mgi_velocity
    FROM device_images
    WHERE device_id = d.device_id
      AND mgi_velocity IS NOT NULL
      AND status = 'complete'
    ORDER BY scored_at DESC NULLS LAST
    LIMIT 1
  ),
  latest_mgi_at = (
    SELECT scored_at
    FROM device_images
    WHERE device_id = d.device_id
      AND scored_at IS NOT NULL
      AND status = 'complete'
    ORDER BY scored_at DESC
    LIMIT 1
  ),
  last_wake_at = (
    SELECT captured_at
    FROM device_wake_payloads
    WHERE device_id = d.device_id
    ORDER BY captured_at DESC
    LIMIT 1
  ),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM device_wake_payloads WHERE device_id = d.device_id
  UNION
  SELECT 1 FROM device_images WHERE device_id = d.device_id
  UNION
  SELECT 1 FROM device_alerts WHERE device_id = d.device_id
);

SELECT recalculate_expected_images();
