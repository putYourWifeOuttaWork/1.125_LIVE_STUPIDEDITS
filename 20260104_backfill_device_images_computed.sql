/*
  # Backfill Computed Columns for device_images

  ## Purpose
  After adding GENERATED STORED columns (temperature, humidity, pressure, gas_resistance),
  existing rows need to be updated to populate these computed columns from metadata JSONB.

  ## Context
  - Total device_images: 408
  - Rows with metadata: 271
  - Rows with computed values before backfill: 35 (8.6%)
  - Expected after backfill: ~175 (all complete rows with metadata)

  ## What This Does
  Triggers an UPDATE on all rows with metadata, forcing PostgreSQL to compute
  the GENERATED STORED column values from the metadata JSONB.

  ## Application Instructions
  Run via Supabase SQL Editor:
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql

  Expected runtime: <5 seconds for 271 rows
*/

-- Backfill computed columns by triggering UPDATE
-- This forces PostgreSQL to compute values from metadata JSONB
UPDATE device_images
SET updated_at = NOW()
WHERE metadata IS NOT NULL
  AND temperature IS NULL;

-- Verify results
DO $$
DECLARE
  v_total INTEGER;
  v_with_metadata INTEGER;
  v_with_temperature INTEGER;
  v_backfilled INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM device_images;
  SELECT COUNT(*) INTO v_with_metadata FROM device_images WHERE metadata IS NOT NULL;
  SELECT COUNT(*) INTO v_with_temperature FROM device_images WHERE temperature IS NOT NULL;

  v_backfilled := v_with_temperature;

  RAISE NOTICE '=== BACKFILL COMPLETE ===';
  RAISE NOTICE 'Total rows: %', v_total;
  RAISE NOTICE 'Rows with metadata: %', v_with_metadata;
  RAISE NOTICE 'Rows with computed temperature: % (%.1f%%)',
    v_with_temperature,
    (v_with_temperature::float / v_total * 100);
  RAISE NOTICE '';

  IF v_with_temperature >= v_with_metadata * 0.9 THEN
    RAISE NOTICE '✅ SUCCESS: Computed columns populated for %.1f%% of metadata rows',
      (v_with_temperature::float / v_with_metadata * 100);
  ELSIF v_with_temperature > v_with_metadata * 0.5 THEN
    RAISE NOTICE '⚠️  WARNING: Only %.1f%% of metadata rows have computed values',
      (v_with_temperature::float / v_with_metadata * 100);
  ELSE
    RAISE NOTICE '❌ ISSUE: Only %.1f%% of metadata rows have computed values',
      (v_with_temperature::float / v_with_metadata * 100);
  END IF;
END $$;
