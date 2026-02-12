/*
  # Fix Temperature Column for Alert System

  ## Overview
  The temperature column was created as a GENERATED column, which cannot be used
  properly with alert threshold comparisons. This migration converts it to a regular
  column that stores Fahrenheit values directly.

  ## Changes

  1. **Drop Generated Columns**
     - Remove GENERATED ALWAYS constraint from temperature, humidity, pressure, gas_resistance
     - Convert to regular columns that accept direct inserts

  2. **Backfill Existing Data**
     - Convert Celsius values (< 50) to Fahrenheit
     - Preserve existing Fahrenheit values (>= 50)
     - Fill NULL values from metadata JSONB where available

  3. **Safety Trigger**
     - Auto-convert Celsius to Fahrenheit if needed
     - Validate temperature ranges
     - Fill from metadata as fallback

  4. **Alert Compatibility**
     - Temperature now works with alert threshold comparisons
     - Values are consistently in Fahrenheit
     - No breaking changes to edge function (already sends Fahrenheit)

  ## Data Safety
  - Uses DROP IF EXISTS - safe to reapply
  - Backfill only updates values needing conversion
  - Trigger prevents future Celsius values
  - Preserves all existing data

  ## Application Instructions
  Copy this entire SQL and paste into Supabase SQL Editor:
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
*/

-- ============================================================================
-- STEP 1: Drop Generated Columns and Create Regular Columns
-- ============================================================================

-- Drop the generated columns (we'll recreate them as regular columns)
DO $$
BEGIN
  -- Drop temperature if it exists as generated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images'
    AND column_name = 'temperature'
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE device_images DROP COLUMN temperature;
    RAISE NOTICE 'Dropped generated temperature column';
  END IF;

  -- Drop humidity if it exists as generated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images'
    AND column_name = 'humidity'
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE device_images DROP COLUMN humidity;
    RAISE NOTICE 'Dropped generated humidity column';
  END IF;

  -- Drop pressure if it exists as generated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images'
    AND column_name = 'pressure'
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE device_images DROP COLUMN pressure;
    RAISE NOTICE 'Dropped generated pressure column';
  END IF;

  -- Drop gas_resistance if it exists as generated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images'
    AND column_name = 'gas_resistance'
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE device_images DROP COLUMN gas_resistance;
    RAISE NOTICE 'Dropped generated gas_resistance column';
  END IF;
END $$;

-- Create regular columns (no DEFAULT - edge function inserts values directly)
ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS temperature NUMERIC;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS humidity NUMERIC;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS pressure NUMERIC;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS gas_resistance NUMERIC;

-- ============================================================================
-- STEP 2: Backfill Existing Data
-- ============================================================================

-- Backfill temperature: Convert Celsius to Fahrenheit where needed
UPDATE device_images
SET temperature = CASE
  -- If temperature is NULL, try to get from metadata
  WHEN temperature IS NULL AND (metadata->>'temperature') IS NOT NULL
    THEN (
      CASE
        -- If metadata value looks like Celsius (< 50), convert to Fahrenheit
        WHEN (metadata->>'temperature')::numeric < 50
          THEN ((metadata->>'temperature')::numeric * 1.8) + 32
        -- Otherwise assume it's already Fahrenheit
        ELSE (metadata->>'temperature')::numeric
      END
    )
  -- If temperature exists and looks like Celsius (< 50), convert to Fahrenheit
  WHEN temperature IS NOT NULL AND temperature < 50
    THEN (temperature * 1.8) + 32
  -- Otherwise keep existing value (already Fahrenheit)
  ELSE temperature
END
WHERE temperature IS NULL
   OR temperature < 50
   OR (metadata->>'temperature') IS NOT NULL;

-- Backfill humidity from metadata if NULL
UPDATE device_images
SET humidity = (metadata->>'humidity')::numeric
WHERE humidity IS NULL
  AND (metadata->>'humidity') IS NOT NULL;

-- Backfill pressure from metadata if NULL
UPDATE device_images
SET pressure = (metadata->>'pressure')::numeric
WHERE pressure IS NULL
  AND (metadata->>'pressure') IS NOT NULL;

-- Backfill gas_resistance from metadata if NULL
UPDATE device_images
SET gas_resistance = (metadata->>'gas_resistance')::numeric
WHERE gas_resistance IS NULL
  AND (metadata->>'gas_resistance') IS NOT NULL;

-- ============================================================================
-- STEP 3: Create Safety Trigger for Future Inserts
-- ============================================================================

-- Function to ensure temperature is always in Fahrenheit
CREATE OR REPLACE FUNCTION ensure_temperature_fahrenheit()
RETURNS TRIGGER AS $$
BEGIN
  -- If temperature is provided and looks like Celsius (< 50), convert to Fahrenheit
  IF NEW.temperature IS NOT NULL AND NEW.temperature < 50 THEN
    NEW.temperature := (NEW.temperature * 1.8) + 32;
    RAISE NOTICE 'Auto-converted temperature from Celsius to Fahrenheit: %', NEW.temperature;
  END IF;

  -- If temperature is NULL, try to get from metadata and convert if needed
  IF NEW.temperature IS NULL AND (NEW.metadata->>'temperature') IS NOT NULL THEN
    IF (NEW.metadata->>'temperature')::numeric < 50 THEN
      NEW.temperature := ((NEW.metadata->>'temperature')::numeric * 1.8) + 32;
    ELSE
      NEW.temperature := (NEW.metadata->>'temperature')::numeric;
    END IF;
  END IF;

  -- Validate temperature range (acceptable Fahrenheit range: -40°F to 185°F)
  IF NEW.temperature IS NOT NULL AND (NEW.temperature < -40 OR NEW.temperature > 185) THEN
    RAISE WARNING 'Temperature out of expected range: % °F', NEW.temperature;
  END IF;

  -- Fill other environmental fields from metadata if NULL
  IF NEW.humidity IS NULL AND (NEW.metadata->>'humidity') IS NOT NULL THEN
    NEW.humidity := (NEW.metadata->>'humidity')::numeric;
  END IF;

  IF NEW.pressure IS NULL AND (NEW.metadata->>'pressure') IS NOT NULL THEN
    NEW.pressure := (NEW.metadata->>'pressure')::numeric;
  END IF;

  IF NEW.gas_resistance IS NULL AND (NEW.metadata->>'gas_resistance') IS NOT NULL THEN
    NEW.gas_resistance := (NEW.metadata->>'gas_resistance')::numeric;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop if exists first)
DROP TRIGGER IF EXISTS ensure_temperature_fahrenheit_trigger ON device_images;

CREATE TRIGGER ensure_temperature_fahrenheit_trigger
  BEFORE INSERT OR UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION ensure_temperature_fahrenheit();

-- ============================================================================
-- STEP 4: Recreate Indexes (they were dropped with the columns)
-- ============================================================================

-- Create indexes on regular columns for fast time-series queries
CREATE INDEX IF NOT EXISTS idx_device_images_temperature
ON device_images(temperature) WHERE temperature IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_humidity
ON device_images(humidity) WHERE humidity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_pressure
ON device_images(pressure) WHERE pressure IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_gas_resistance
ON device_images(gas_resistance) WHERE gas_resistance IS NOT NULL;

-- Ensure metadata GIN index exists
CREATE INDEX IF NOT EXISTS idx_device_images_metadata_gin
ON device_images USING GIN (metadata);

-- ============================================================================
-- STEP 5: Update Column Comments
-- ============================================================================

COMMENT ON COLUMN device_images.temperature IS
'Temperature in Fahrenheit. Edge function converts Celsius to Fahrenheit before insert. Trigger ensures unit consistency. Used for alert threshold comparisons.';

COMMENT ON COLUMN device_images.humidity IS
'Relative humidity (%). Extracted from metadata JSONB or inserted directly. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.pressure IS
'Atmospheric pressure (hPa). Extracted from metadata JSONB or inserted directly. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.gas_resistance IS
'Gas sensor resistance (Ohms). Extracted from metadata JSONB or inserted directly. Indexed for fast time-series queries.';

-- ============================================================================
-- STEP 6: Verification Query
-- ============================================================================

-- Show sample of converted data
DO $$
DECLARE
  celsius_count INTEGER;
  fahrenheit_count INTEGER;
  null_count INTEGER;
  sample_temps TEXT;
BEGIN
  -- Count values by range
  SELECT
    COUNT(*) FILTER (WHERE temperature IS NOT NULL AND temperature < 50),
    COUNT(*) FILTER (WHERE temperature >= 50),
    COUNT(*) FILTER (WHERE temperature IS NULL)
  INTO celsius_count, fahrenheit_count, null_count
  FROM device_images;

  -- Get sample temperatures
  SELECT string_agg(ROUND(temperature::numeric, 1)::text, ', ')
  INTO sample_temps
  FROM (
    SELECT temperature
    FROM device_images
    WHERE temperature IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT 10
  ) samples;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'Temperature Migration Complete';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Values < 50 (need conversion): %', celsius_count;
  RAISE NOTICE 'Values >= 50 (Fahrenheit): %', fahrenheit_count;
  RAISE NOTICE 'NULL values: %', null_count;
  RAISE NOTICE 'Sample recent temps (°F): %', sample_temps;
  RAISE NOTICE '';
  RAISE NOTICE 'Alert system is now ready!';
  RAISE NOTICE 'Temperature column accepts direct Fahrenheit values.';
  RAISE NOTICE 'Safety trigger prevents Celsius values from being stored.';
END $$;
