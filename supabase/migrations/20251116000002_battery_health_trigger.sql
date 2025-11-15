/*
  # Battery Health Auto-Calculation Trigger

  1. Purpose
    - Auto-calculate battery_health_percent from battery_voltage
    - Ensures consistency regardless of update source (edge function, manual, etc.)
    - Triggers on INSERT or UPDATE of battery_voltage

  2. Formula
    - Range: 3.0V (0%) to 4.2V (100%)
    - Formula: ((voltage - 3.0) / (4.2 - 3.0)) * 100
    - Clamps result to 0-100 range

  3. Battery Types
    - Designed for LiPo batteries (common in ESP32 devices)
    - 3.0V: Dead (0%)
    - 3.4V: Critical (33%)
    - 3.6V: Warning (50%)
    - 3.7V: Nominal (58%)
    - 4.2V: Fully charged (100%)

  4. Trigger Behavior
    - Executes BEFORE INSERT or UPDATE
    - Only recalculates when battery_voltage changes
    - Sets to NULL if voltage is NULL
*/

-- ==========================================
-- BATTERY HEALTH CALCULATION FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION trg_calculate_battery_health()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate battery health percentage when voltage changes
  -- Formula: ((voltage - min) / (max - min)) * 100
  -- LiPo battery range: 3.0V (empty) to 4.2V (full)

  IF NEW.battery_voltage IS NOT NULL THEN
    -- Calculate percentage with clamping to 0-100 range
    NEW.battery_health_percent := GREATEST(0, LEAST(100,
      ROUND(((NEW.battery_voltage - 3.0) / (4.2 - 3.0)) * 100)
    ))::INT;

    -- Log warning if battery is critical
    IF NEW.battery_voltage < 3.4 THEN
      RAISE WARNING 'Device % battery critical: % V (% %%)',
        NEW.device_id, NEW.battery_voltage, NEW.battery_health_percent;
    END IF;
  ELSE
    -- No voltage data, clear health percentage
    NEW.battery_health_percent := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_calculate_battery_health IS
'Auto-calculate battery_health_percent from battery_voltage.
Formula: ((voltage - 3.0) / (4.2 - 3.0)) * 100, clamped to 0-100.
Designed for LiPo batteries (3.0V = 0%, 4.2V = 100%).
Triggers on INSERT or UPDATE of battery_voltage.';

-- ==========================================
-- APPLY TRIGGER TO DEVICES TABLE
-- ==========================================

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trg_devices_battery_health ON devices;

-- Create trigger on INSERT or UPDATE of battery_voltage
CREATE TRIGGER trg_devices_battery_health
  BEFORE INSERT OR UPDATE OF battery_voltage ON devices
  FOR EACH ROW
  EXECUTE FUNCTION trg_calculate_battery_health();

-- ==========================================
-- BACKFILL EXISTING DEVICES
-- ==========================================

-- Recalculate battery_health_percent for all existing devices with voltage data
UPDATE devices
SET battery_health_percent = GREATEST(0, LEAST(100,
  ROUND(((battery_voltage - 3.0) / (4.2 - 3.0)) * 100)
))::INT
WHERE battery_voltage IS NOT NULL
  AND (
    battery_health_percent IS NULL
    OR battery_health_percent != GREATEST(0, LEAST(100,
      ROUND(((battery_voltage - 3.0) / (4.2 - 3.0)) * 100)
    ))::INT
  );

-- Log backfill results
DO $$
DECLARE
  v_updated_count INT;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled battery_health_percent for % devices', v_updated_count;
END $$;
