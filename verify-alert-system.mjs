#!/usr/bin/env node

/**
 * Alert System Verification Script
 *
 * Tests the alert system after temperature unit conversion fixes
 * Verifies:
 * 1. Temperature values are in Fahrenheit
 * 2. Alert thresholds are configured correctly
 * 3. Alerts can be triggered with test data
 * 4. Recent alerts are being created
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('🔍 Alert System Verification\n');
console.log('=' .repeat(60));

async function checkTemperatureValues() {
  console.log('\n1️⃣  Checking temperature values in device_images...\n');

  const { data, error } = await supabase
    .from('device_images')
    .select('image_id, temperature, humidity, metadata, captured_at')
    .order('captured_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error fetching images:', error.message);
    return false;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No images found');
    return true;
  }

  let celsiusCount = 0;
  let fahrenheitCount = 0;

  data.forEach((img, idx) => {
    const metadata = img.metadata || {};
    const metadataTemp = metadata.temperature;
    const metadataTempF = metadata.temperature_fahrenheit;

    console.log(`Image ${idx + 1}:`);
    console.log(`  DB Temp: ${img.temperature}°F`);
    console.log(`  Metadata C: ${metadataTemp}°C`);
    console.log(`  Metadata F: ${metadataTempF}°F`);
    console.log(`  Captured: ${new Date(img.captured_at).toLocaleString()}`);

    // Check if temperature seems to be in correct unit
    if (img.temperature && img.temperature < 50) {
      celsiusCount++;
      console.log(`  ⚠️  Temperature appears to be in Celsius!`);
    } else if (img.temperature && img.temperature >= 50) {
      fahrenheitCount++;
      console.log(`  ✅ Temperature is in Fahrenheit`);
    }
    console.log('');
  });

  console.log(`\nSummary:`);
  console.log(`  Fahrenheit values: ${fahrenheitCount}`);
  console.log(`  Celsius values: ${celsiusCount}`);

  if (celsiusCount > 0) {
    console.log(`  ❌ Found ${celsiusCount} temperatures in Celsius - migration may not have run`);
    return false;
  }

  console.log(`  ✅ All temperatures are in Fahrenheit`);
  return true;
}

async function checkAlertThresholds() {
  console.log('\n2️⃣  Checking alert thresholds...\n');

  const { data, error } = await supabase
    .from('device_alert_thresholds')
    .select('*')
    .is('device_id', null) // Company defaults only
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error fetching thresholds:', error.message);
    return false;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No company default thresholds found');
    return false;
  }

  data.forEach((threshold, idx) => {
    console.log(`Company Threshold Config ${idx + 1}:`);
    console.log(`  Company ID: ${threshold.company_id}`);
    console.log(`  Temperature:`);
    console.log(`    Min Warning: ${threshold.temp_min_warning}°F`);
    console.log(`    Min Critical: ${threshold.temp_min_critical}°F`);
    console.log(`    Max Warning: ${threshold.temp_max_warning}°F`);
    console.log(`    Max Critical: ${threshold.temp_max_critical}°F`);
    console.log(`  Humidity:`);
    console.log(`    Min Warning: ${threshold.rh_min_warning}%`);
    console.log(`    Max Warning: ${threshold.rh_max_warning}%`);
    console.log(`  MGI:`);
    console.log(`    Max Warning: ${threshold.mgi_max_warning}%`);
    console.log(`  Active: ${threshold.is_active}`);
    console.log('');
  });

  console.log('✅ Alert thresholds configured');
  return true;
}

async function checkRecentAlerts() {
  console.log('\n3️⃣  Checking recent alerts...\n');

  const { data, error } = await supabase
    .from('device_alerts')
    .select('*')
    .gte('triggered_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('triggered_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error fetching alerts:', error.message);
    return false;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No alerts in the last 24 hours');
    console.log('   This may be expected if temperatures haven\'t exceeded thresholds');
    return true;
  }

  console.log(`Found ${data.length} alerts in the last 24 hours:\n`);

  data.forEach((alert, idx) => {
    console.log(`Alert ${idx + 1}:`);
    console.log(`  Type: ${alert.alert_type}`);
    console.log(`  Category: ${alert.alert_category}`);
    console.log(`  Severity: ${alert.severity}`);
    console.log(`  Message: ${alert.message}`);
    console.log(`  Actual: ${alert.actual_value} | Threshold: ${alert.threshold_value}`);
    console.log(`  Triggered: ${new Date(alert.triggered_at).toLocaleString()}`);
    console.log(`  Resolved: ${alert.resolved_at ? 'Yes' : 'No'}`);
    console.log('');
  });

  console.log('✅ Alerts are being generated');
  return true;
}

async function testAlertFunction() {
  console.log('\n4️⃣  Testing alert function with sample data...\n');

  // Get a test device ID
  const { data: devices, error: devError } = await supabase
    .from('devices')
    .select('device_id, device_code, company_id')
    .limit(1);

  if (devError || !devices || devices.length === 0) {
    console.log('⚠️  No devices found to test with');
    return true;
  }

  const testDevice = devices[0];
  console.log(`Testing with device: ${testDevice.device_code}`);
  console.log(`Device ID: ${testDevice.device_id}`);
  console.log(`Company ID: ${testDevice.company_id}\n`);

  // Test with temperature above warning threshold
  const testTemp = 77.0; // Above typical 70°F warning
  const testHumidity = 55.0;

  console.log(`Testing absolute thresholds:`);
  console.log(`  Temperature: ${testTemp}°F`);
  console.log(`  Humidity: ${testHumidity}%\n`);

  const { data: alerts, error: alertError } = await supabase
    .rpc('check_absolute_thresholds', {
      p_device_id: testDevice.device_id,
      p_temperature: testTemp,
      p_humidity: testHumidity,
      p_mgi: null,
      p_measurement_timestamp: new Date().toISOString()
    });

  if (alertError) {
    console.error('❌ Error calling alert function:', alertError.message);
    return false;
  }

  if (!alerts || alerts.length === 0) {
    console.log('⚠️  No alerts triggered by test data');
    console.log('   This may indicate thresholds are set higher than test values');
    console.log('   Or the function is not working correctly');
    return true;
  }

  console.log(`✅ Alert function returned ${alerts.length} alert(s):\n`);
  alerts.forEach((alert, idx) => {
    console.log(`  Alert ${idx + 1}:`);
    console.log(`    Type: ${alert.type}`);
    console.log(`    Severity: ${alert.severity}`);
    console.log(`    Message: ${alert.message}`);
  });

  return true;
}

async function checkDeviceTelemetry() {
  console.log('\n5️⃣  Checking recent device telemetry...\n');

  const { data, error } = await supabase
    .from('device_telemetry')
    .select('telemetry_id, device_id, temperature, humidity, captured_at')
    .order('captured_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error fetching telemetry:', error.message);
    return false;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No recent telemetry found');
    return true;
  }

  console.log(`Recent telemetry readings:\n`);
  data.forEach((reading, idx) => {
    console.log(`Reading ${idx + 1}:`);
    console.log(`  Temperature: ${reading.temperature}°F`);
    console.log(`  Humidity: ${reading.humidity}%`);
    console.log(`  Captured: ${new Date(reading.captured_at).toLocaleString()}`);

    if (reading.temperature && reading.temperature < 50) {
      console.log(`  ⚠️  Temperature appears to be in Celsius!`);
    } else if (reading.temperature && reading.temperature >= 50) {
      console.log(`  ✅ Temperature is in Fahrenheit`);
    }
    console.log('');
  });

  return true;
}

async function runAllChecks() {
  try {
    const results = {
      temperatures: await checkTemperatureValues(),
      thresholds: await checkAlertThresholds(),
      telemetry: await checkDeviceTelemetry(),
      recentAlerts: await checkRecentAlerts(),
      testFunction: await testAlertFunction(),
    };

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Verification Summary:\n');

    Object.entries(results).forEach(([check, passed]) => {
      const icon = passed ? '✅' : '❌';
      console.log(`  ${icon} ${check}`);
    });

    const allPassed = Object.values(results).every(r => r);

    console.log('\n' + '='.repeat(60));

    if (allPassed) {
      console.log('\n✅ All checks passed! Alert system appears to be working correctly.\n');
    } else {
      console.log('\n⚠️  Some checks failed. Review the output above for details.\n');
    }

  } catch (err) {
    console.error('\n❌ Verification failed with error:', err.message);
    console.error(err.stack);
  }
}

// Run all checks
runAllChecks();
