import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== CHECKING SNAPSHOT FUNCTION VERSION ===\n');

// Get the function source code
const { data, error } = await supabase
  .rpc('exec_sql', {
    sql: `
      SELECT pg_get_functiondef(oid) as function_def
      FROM pg_proc
      WHERE proname = 'generate_session_wake_snapshot';
    `
  });

if (error) {
  console.log('❌ Error getting function:', error.message);
} else if (!data || data.length === 0) {
  console.log('❌ Function does not exist');
} else {
  const funcDef = data[0]?.function_def || '';

  console.log('Function exists! Checking which version...\n');

  // Check for key indicators
  const usesDeviceTelemetry = funcDef.includes('FROM device_telemetry');
  const usesDeviceImages = funcDef.includes('di.temperature') || funcDef.includes('device_images di');
  const hasLocfHelper = funcDef.includes('get_device_environmental_with_locf');

  console.log('Analysis:');
  console.log(`  Uses device_telemetry: ${usesDeviceTelemetry ? '✅ YES' : '❌ NO'}`);
  console.log(`  Uses device_images for env data: ${usesDeviceImages ? '✅ YES' : '❌ NO'}`);
  console.log(`  Uses LOCF helper function: ${hasLocfHelper ? '✅ YES' : '❌ NO'}\n`);

  if (hasLocfHelper) {
    console.log('📋 Current version: NEW ARCHITECTURE (device_images)');
    console.log('   Source: 20260104_session_wake_snapshots_device_images.sql');
  } else if (usesDeviceTelemetry && !usesDeviceImages) {
    console.log('📋 Current version: OLD ARCHITECTURE (device_telemetry)');
    console.log('   Source: 20260104_fix_snapshot_aggregates.sql');
  } else if (usesDeviceImages && !usesDeviceTelemetry) {
    console.log('📋 Current version: MIXED - device_images only');
    console.log('   Source: 20260104_session_wake_snapshots_device_images.sql (partial)');
  } else {
    console.log('📋 Current version: MIXED ARCHITECTURE');
    console.log('   ⚠️ Function uses both device_telemetry and device_images');
  }

  // Show relevant excerpt
  console.log('\n--- Function Excerpt (Environmental Data Section) ---');
  const lines = funcDef.split('\n');
  const telemetryLine = lines.findIndex(l => l.includes('telemetry') && l.includes('jsonb_build_object'));

  if (telemetryLine > -1) {
    console.log(lines.slice(telemetryLine, Math.min(telemetryLine + 20, lines.length)).join('\n'));
  }
}

console.log('\n=== CHECK COMPLETE ===');
