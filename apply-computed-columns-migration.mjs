#!/usr/bin/env node

import pkg from 'pg';
const { Client } = pkg;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const migration = `
/*
  # Device Images - Computed Columns and Enhanced Indexing

  ## Overview
  This migration establishes device_images as the single source of truth for all wake data,
  including environmental telemetry. Previously, device_telemetry was used for historical
  analysis, but all environmental data is now stored in device_images.metadata JSONB.

  ## Changes

  1. **Computed Columns**
     - Add generated columns for fast access to environmental data from metadata JSONB
     - temperature: Extracted from metadata->>'temperature' as numeric
     - humidity: Extracted from metadata->>'humidity' as numeric
     - pressure: Extracted from metadata->>'pressure' as numeric
     - gas_resistance: Extracted from metadata->>'gas_resistance' as numeric

  2. **Performance Indexes**
     - Create indexes on computed columns for fast time-series queries
     - Create GIN index on metadata JSONB for flexible querying
     - Enable efficient filtering and aggregation operations

  3. **Documentation**
     - Update table comment to reflect canonical status
     - Document LOCF (Last Observation Carried Forward) strategy for gaps

  ## Architecture Notes

  - device_images now contains complete wake lifecycle data
  - Each row represents one holistic wake session with all attributes
  - Environmental data is part of the wake record, not separate telemetry
  - LOCF is applied when metadata fields are null (handled by helper function)
  - device_telemetry is deprecated and will be removed in future migration
*/

-- Add computed columns for environmental data from metadata JSONB
-- These are STORED (not VIRTUAL) for better query performance
ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS temperature NUMERIC
GENERATED ALWAYS AS ((metadata->>'temperature')::numeric) STORED;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS humidity NUMERIC
GENERATED ALWAYS AS ((metadata->>'humidity')::numeric) STORED;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS pressure NUMERIC
GENERATED ALWAYS AS ((metadata->>'pressure')::numeric) STORED;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS gas_resistance NUMERIC
GENERATED ALWAYS AS ((metadata->>'gas_resistance')::numeric) STORED;

-- Create indexes on computed columns for fast time-series queries
CREATE INDEX IF NOT EXISTS idx_device_images_temperature
ON device_images(temperature) WHERE temperature IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_humidity
ON device_images(humidity) WHERE humidity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_pressure
ON device_images(pressure) WHERE pressure IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_gas_resistance
ON device_images(gas_resistance) WHERE gas_resistance IS NOT NULL;

-- Create GIN index on metadata JSONB for flexible queries
CREATE INDEX IF NOT EXISTS idx_device_images_metadata_gin
ON device_images USING GIN (metadata);

-- Create composite index for device + time series queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_device_images_device_captured
ON device_images(device_id, captured_at DESC) WHERE status = 'complete';

-- Create composite index for session + time series queries
CREATE INDEX IF NOT EXISTS idx_device_images_session_captured
ON device_images(site_device_session_id, captured_at DESC) WHERE status = 'complete';

-- Update table and column comments to reflect architectural role
COMMENT ON TABLE device_images IS
'Canonical source of truth for device wake data. Each row represents one complete wake session with environmental telemetry, image data, MGI scoring, and metadata. Replaces device_telemetry for historical analysis.';

COMMENT ON COLUMN device_images.metadata IS
'Complete device metadata including environmental readings (temperature, humidity, pressure, gas_resistance), location data, and device state. This is the authoritative source for all wake-associated data.';

COMMENT ON COLUMN device_images.temperature IS
'Computed column: Temperature in Celsius extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.humidity IS
'Computed column: Relative humidity (%) extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.pressure IS
'Computed column: Atmospheric pressure (hPa) extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.gas_resistance IS
'Computed column: Gas sensor resistance (Ohms) extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.wake_payload_id IS
'Links this image to its wake payload record. Critical for MQTT protocol compliance and wake lifecycle tracking.';
`;

async function applyMigration() {
  console.log('🔧 Applying Device Images Computed Columns Migration...\n');

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.log('❌ No DATABASE_URL found in environment');
    console.log('\n📋 Please apply the SQL manually:');
    console.log('1. Open Supabase SQL Editor');
    console.log(`2. Go to: https://supabase.com/dashboard/project/${supabaseUrl.replace('https://', '').replace('.supabase.co', '')}/sql`);
    console.log('3. Copy and paste the following migration SQL:\n');
    console.log(migration);
    console.log('\n4. Click "Run"\n');
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('🚀 Executing migration...\n');
    await client.query(migration);

    console.log('✅ Migration applied successfully!\n');

    // Verify the columns were created
    console.log('🔍 Verifying computed columns...\n');
    const result = await client.query(`
      SELECT column_name, data_type, is_generated
      FROM information_schema.columns
      WHERE table_name = 'device_images'
      AND column_name IN ('temperature', 'humidity', 'pressure', 'gas_resistance')
      ORDER BY column_name;
    `);

    if (result.rows.length > 0) {
      console.log('Computed columns created:');
      result.rows.forEach(row => {
        console.log(`  ✓ ${row.column_name}: ${row.data_type} (generated: ${row.is_generated})`);
      });
    } else {
      console.log('⚠️  Note: Columns may already exist or need manual verification');
    }

    // Check indexes
    console.log('\n🔍 Verifying indexes...\n');
    const indexResult = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'device_images'
      AND indexname LIKE 'idx_device_images_%'
      ORDER BY indexname;
    `);

    if (indexResult.rows.length > 0) {
      console.log('Indexes created:');
      indexResult.rows.forEach(row => {
        console.log(`  ✓ ${row.indexname}`);
      });
    }

    // Test query to ensure computed columns work
    console.log('\n🧪 Testing computed columns with sample query...\n');
    const testResult = await client.query(`
      SELECT
        image_id,
        temperature,
        humidity,
        pressure,
        gas_resistance
      FROM device_images
      WHERE status = 'complete'
      AND metadata IS NOT NULL
      LIMIT 3;
    `);

    console.log(`✅ Found ${testResult.rows.length} sample rows with environmental data`);
    if (testResult.rows.length > 0) {
      console.log('Sample data:');
      testResult.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. Temp: ${row.temperature}°C, Humidity: ${row.humidity}%, Pressure: ${row.pressure}hPa`);
      });
    }

    console.log('\n🎉 Migration complete! device_images is now the single source of truth.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please apply migration manually via Supabase SQL Editor\n');
    console.log(migration);
  } finally {
    await client.end();
  }
}

applyMigration().catch(console.error);
