/*
  # Fix Device Images Temperature Computed Columns

  1. Problem
    - device_images computed columns extract temperature in Celsius from metadata
    - Alert thresholds are configured in Fahrenheit
    - This causes temperature alerts to never trigger

  2. Changes
    - Update computed column defaults to extract Fahrenheit values
    - Add fallback to convert Celsius to Fahrenheit if Fahrenheit not available
    - Backfill existing rows with correct Fahrenheit values

  3. Security
    - No RLS changes required (existing policies remain)
*/

-- ============================================
-- 1. UPDATE COMPUTED COLUMN DEFAULTS
-- ============================================

-- Drop existing default and add new computed default for temperature
-- Priority: temperature_fahrenheit > temperature (converted to F)
ALTER TABLE public.device_images
  ALTER COLUMN temperature
  SET DEFAULT COALESCE(
    -- Try to get Fahrenheit value directly
    ((metadata ->> 'temperature_fahrenheit'::text))::numeric,
    -- Fallback: convert Celsius to Fahrenheit
    CASE
      WHEN (metadata ->> 'temperature_celsius'::text) IS NOT NULL
      THEN (((metadata ->> 'temperature_celsius'::text))::numeric * 1.8) + 32
      WHEN (metadata ->> 'temperature'::text) IS NOT NULL
      THEN (((metadata ->> 'temperature'::text))::numeric * 1.8) + 32
      ELSE NULL
    END
  );

-- Humidity, pressure, and gas_resistance should remain as-is (units are consistent)
-- But let's ensure they have proper fallbacks
ALTER TABLE public.device_images
  ALTER COLUMN humidity
  SET DEFAULT COALESCE(
    ((metadata ->> 'humidity'::text))::numeric,
    ((metadata ->> 'rh'::text))::numeric,
    ((metadata ->> 'relative_humidity'::text))::numeric
  );

ALTER TABLE public.device_images
  ALTER COLUMN pressure
  SET DEFAULT ((metadata ->> 'pressure'::text))::numeric;

ALTER TABLE public.device_images
  ALTER COLUMN gas_resistance
  SET DEFAULT ((metadata ->> 'gas_resistance'::text))::numeric;

-- ============================================
-- 2. BACKFILL EXISTING ROWS
-- ============================================

-- Update existing rows where temperature is in Celsius (likely < 50 since it's stored as Celsius)
-- This assumes any temperature < 50 is Celsius and needs conversion
DO $$
DECLARE
  v_updated_count integer := 0;
  v_total_count integer := 0;
BEGIN
  -- Get count of rows that need updating
  SELECT COUNT(*) INTO v_total_count
  FROM public.device_images
  WHERE temperature IS NOT NULL
    AND temperature < 50  -- Likely Celsius values
    AND metadata IS NOT NULL;

  RAISE NOTICE 'Found % device_images rows with likely Celsius temperatures', v_total_count;

  -- Update rows with Celsius temperatures to Fahrenheit
  -- Check metadata for temperature_fahrenheit first, otherwise convert
  UPDATE public.device_images
  SET
    temperature = COALESCE(
      ((metadata ->> 'temperature_fahrenheit'))::numeric,
      CASE
        WHEN (metadata ->> 'temperature_celsius') IS NOT NULL
        THEN (((metadata ->> 'temperature_celsius'))::numeric * 1.8) + 32
        WHEN (metadata ->> 'temperature') IS NOT NULL
        THEN (((metadata ->> 'temperature'))::numeric * 1.8) + 32
        ELSE temperature
      END
    ),
    updated_at = now()
  WHERE temperature IS NOT NULL
    AND temperature < 50  -- Likely Celsius values
    AND metadata IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RAISE NOTICE 'Updated % device_images rows with correct Fahrenheit temperatures', v_updated_count;

  -- Also update any NULL temperatures where we have metadata
  UPDATE public.device_images
  SET
    temperature = COALESCE(
      ((metadata ->> 'temperature_fahrenheit'))::numeric,
      CASE
        WHEN (metadata ->> 'temperature_celsius') IS NOT NULL
        THEN (((metadata ->> 'temperature_celsius'))::numeric * 1.8) + 32
        WHEN (metadata ->> 'temperature') IS NOT NULL
        THEN (((metadata ->> 'temperature'))::numeric * 1.8) + 32
        ELSE NULL
      END
    ),
    humidity = COALESCE(
      humidity,
      ((metadata ->> 'humidity'))::numeric,
      ((metadata ->> 'rh'))::numeric
    ),
    pressure = COALESCE(
      pressure,
      ((metadata ->> 'pressure'))::numeric
    ),
    gas_resistance = COALESCE(
      gas_resistance,
      ((metadata ->> 'gas_resistance'))::numeric
    ),
    updated_at = now()
  WHERE (temperature IS NULL OR humidity IS NULL OR pressure IS NULL OR gas_resistance IS NULL)
    AND metadata IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RAISE NOTICE 'Filled in % NULL environmental values from metadata', v_updated_count;
END $$;

-- ============================================
-- 3. CREATE HELPER FUNCTION FOR FUTURE INSERTS
-- ============================================

-- Function to ensure temperature is always in Fahrenheit
CREATE OR REPLACE FUNCTION public.ensure_fahrenheit_temperature()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If temperature is provided and seems to be in Celsius (< 50), convert it
  IF NEW.temperature IS NOT NULL AND NEW.temperature < 50 AND NEW.metadata IS NOT NULL THEN
    -- Try to get Fahrenheit from metadata first
    NEW.temperature := COALESCE(
      ((NEW.metadata ->> 'temperature_fahrenheit'))::numeric,
      -- Convert Celsius to Fahrenheit
      (NEW.temperature * 1.8) + 32
    );
  END IF;

  -- Fill in any NULL environmental values from metadata
  IF NEW.temperature IS NULL AND NEW.metadata IS NOT NULL THEN
    NEW.temperature := COALESCE(
      ((NEW.metadata ->> 'temperature_fahrenheit'))::numeric,
      CASE
        WHEN (NEW.metadata ->> 'temperature_celsius') IS NOT NULL
        THEN (((NEW.metadata ->> 'temperature_celsius'))::numeric * 1.8) + 32
        WHEN (NEW.metadata ->> 'temperature') IS NOT NULL
        THEN (((NEW.metadata ->> 'temperature'))::numeric * 1.8) + 32
        ELSE NULL
      END
    );
  END IF;

  IF NEW.humidity IS NULL AND NEW.metadata IS NOT NULL THEN
    NEW.humidity := COALESCE(
      ((NEW.metadata ->> 'humidity'))::numeric,
      ((NEW.metadata ->> 'rh'))::numeric
    );
  END IF;

  IF NEW.pressure IS NULL AND NEW.metadata IS NOT NULL THEN
    NEW.pressure := ((NEW.metadata ->> 'pressure'))::numeric;
  END IF;

  IF NEW.gas_resistance IS NULL AND NEW.metadata IS NOT NULL THEN
    NEW.gas_resistance := ((NEW.metadata ->> 'gas_resistance'))::numeric;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS ensure_fahrenheit_temperature_trigger ON public.device_images;

-- Create trigger to run before INSERT or UPDATE
CREATE TRIGGER ensure_fahrenheit_temperature_trigger
  BEFORE INSERT OR UPDATE ON public.device_images
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_fahrenheit_temperature();

COMMENT ON FUNCTION public.ensure_fahrenheit_temperature() IS
  'Ensures temperature is stored in Fahrenheit and fills environmental values from metadata';

-- ============================================
-- 4. VERIFICATION
-- ============================================

-- Show sample of updated data
DO $$
DECLARE
  v_sample_record RECORD;
BEGIN
  RAISE NOTICE '=== Sample of Updated Device Images ===';

  FOR v_sample_record IN (
    SELECT
      image_id,
      device_id,
      temperature,
      humidity,
      (metadata ->> 'temperature')::numeric as metadata_temp,
      (metadata ->> 'temperature_fahrenheit')::numeric as metadata_temp_f,
      captured_at
    FROM public.device_images
    WHERE temperature IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT 5
  )
  LOOP
    RAISE NOTICE 'Image: % | Temp: %°F | Metadata C: %°C | Metadata F: %°F | Captured: %',
      v_sample_record.image_id,
      v_sample_record.temperature,
      v_sample_record.metadata_temp,
      v_sample_record.metadata_temp_f,
      v_sample_record.captured_at;
  END LOOP;
END $$;
