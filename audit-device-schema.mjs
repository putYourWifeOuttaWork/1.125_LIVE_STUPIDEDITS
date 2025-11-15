#!/usr/bin/env node
/**
 * Comprehensive Device Schema Audit
 * Queries actual database to understand complete device data structure
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 COMPREHENSIVE DEVICE SCHEMA AUDIT\n');
console.log('='.repeat(80));

// Core device tables to audit
const deviceTables = [
  'devices',
  'device_telemetry',
  'device_images',
  'device_commands',
  'device_alerts',
  'device_history',
  'device_site_assignments',
  'device_program_assignments',
  'device_ack_log',
  'sites',
  'pilot_programs'
];

async function getTableSchema(tableName) {
  console.log(`\n📋 TABLE: ${tableName.toUpperCase()}`);
  console.log('-'.repeat(80));

  // Get column information
  const { data: columns, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(0);

  if (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }

  // Get sample data to understand structure
  const { data: samples, error: sampleError } = await supabase
    .from(tableName)
    .select('*')
    .limit(3);

  if (sampleError) {
    console.log(`   ⚠️  Could not fetch samples: ${sampleError.message}`);
  }

  // Get row count
  const { count } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  console.log(`   Rows: ${count || 0}`);

  if (samples && samples.length > 0) {
    console.log(`   Sample Records: ${samples.length}`);
    console.log(`\n   Available Columns:`);
    const sampleRow = samples[0];
    Object.keys(sampleRow).forEach(key => {
      const value = sampleRow[key];
      const type = value === null ? 'null' : typeof value;
      const preview = value === null ? 'NULL' :
                     typeof value === 'object' ? JSON.stringify(value).substring(0, 50) :
                     String(value).substring(0, 50);
      console.log(`      - ${key}: ${type} (e.g., ${preview}${String(preview).length >= 50 ? '...' : ''})`);
    });
  } else {
    console.log(`   ⚠️  No sample data available`);
  }

  return { columns, samples, count };
}

// Audit all tables
const results = {};
for (const table of deviceTables) {
  try {
    results[table] = await getTableSchema(table);
  } catch (err) {
    console.log(`   ❌ Failed to audit ${table}: ${err.message}`);
  }
}

// Special queries for understanding relationships
console.log('\n\n' + '='.repeat(80));
console.log('🔗 RELATIONSHIP ANALYSIS');
console.log('='.repeat(80));

// Check device with full relationships
console.log('\n📋 Device with Full Relationships:');
const { data: deviceWithRels } = await supabase
  .from('devices')
  .select(`
    device_id,
    device_name,
    device_mac,
    mqtt_client_id,
    device_type,
    provisioning_status,
    battery_voltage,
    battery_health_percent,
    wifi_rssi,
    last_seen_at,
    last_wake_at,
    next_wake_at,
    wake_schedule_cron,
    is_active,
    sites:site_id(site_id, name, type, timezone),
    pilot_programs:program_id(program_id, name)
  `)
  .limit(1)
  .maybeSingle();

if (deviceWithRels) {
  console.log('   ✅ Sample device with relationships:');
  console.log(JSON.stringify(deviceWithRels, null, 2));
} else {
  console.log('   ⚠️  No devices found');
}

// Check telemetry data availability
console.log('\n📋 Device Telemetry Analysis:');
const { data: telemetryStats } = await supabase
  .from('device_telemetry')
  .select('device_id, captured_at, battery_voltage, wifi_rssi, temperature, humidity, pressure')
  .order('captured_at', { ascending: false })
  .limit(10);

if (telemetryStats && telemetryStats.length > 0) {
  console.log(`   ✅ Found ${telemetryStats.length} recent telemetry records`);
  console.log('   Recent telemetry fields:');
  const sample = telemetryStats[0];
  Object.keys(sample).forEach(key => {
    console.log(`      - ${key}: ${sample[key]}`);
  });
} else {
  console.log('   ⚠️  No telemetry data found');
}

// Check device history
console.log('\n📋 Device History Analysis:');
const { data: historyStats } = await supabase
  .from('device_history')
  .select('device_id, event_type, event_category, severity, event_data, recorded_at')
  .order('recorded_at', { ascending: false })
  .limit(5);

if (historyStats && historyStats.length > 0) {
  console.log(`   ✅ Found ${historyStats.length} recent history records`);
  console.log('   Event types found:');
  const eventTypes = [...new Set(historyStats.map(h => h.event_type))];
  eventTypes.forEach(type => {
    const count = historyStats.filter(h => h.event_type === type).length;
    console.log(`      - ${type}: ${count} records`);
  });
} else {
  console.log('   ⚠️  No device history found');
}

// Check device images
console.log('\n📋 Device Images Analysis:');
const { data: imageStats } = await supabase
  .from('device_images')
  .select('device_id, image_type, status, chunk_count, received_chunks, captured_at, received_at')
  .order('captured_at', { ascending: false })
  .limit(5);

if (imageStats && imageStats.length > 0) {
  console.log(`   ✅ Found ${imageStats.length} recent image records`);
  console.log('   Image statuses:');
  const statuses = [...new Set(imageStats.map(i => i.status))];
  statuses.forEach(status => {
    const count = imageStats.filter(i => i.status === status).length;
    console.log(`      - ${status}: ${count} images`);
  });
} else {
  console.log('   ⚠️  No device images found');
}

// Check device commands
console.log('\n📋 Device Commands Analysis:');
const { data: commandStats } = await supabase
  .from('device_commands')
  .select('device_id, command_type, status, created_at, sent_at, acknowledged_at')
  .order('created_at', { ascending: false })
  .limit(5);

if (commandStats && commandStats.length > 0) {
  console.log(`   ✅ Found ${commandStats.length} recent commands`);
  console.log('   Command types:');
  const types = [...new Set(commandStats.map(c => c.command_type))];
  types.forEach(type => {
    const count = commandStats.filter(c => c.command_type === type).length;
    console.log(`      - ${type}: ${count} commands`);
  });
  console.log('   Command statuses:');
  const statuses = [...new Set(commandStats.map(c => c.status))];
  statuses.forEach(status => {
    const count = commandStats.filter(c => c.status === status).length;
    console.log(`      - ${status}: ${count} commands`);
  });
} else {
  console.log('   ⚠️  No device commands found');
}

console.log('\n\n' + '='.repeat(80));
console.log('📊 SUMMARY');
console.log('='.repeat(80));

deviceTables.forEach(table => {
  const result = results[table];
  if (result && result.count !== undefined) {
    console.log(`   ${table.padEnd(30)} ${String(result.count).padStart(6)} rows`);
  }
});

console.log('\n✅ Schema audit complete!');
console.log('\nNext: Review output and identify missing UI elements\n');
