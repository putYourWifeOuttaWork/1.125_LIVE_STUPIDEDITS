#!/usr/bin/env node
/**
 * Test Results Validation Script
 *
 * Comprehensive validation of test device data across all tables.
 * Provides detailed inspection of device sessions, telemetry, images, and history.
 *
 * Usage:
 *   node validate-test-results.mjs                      # Validate all test devices
 *   node validate-test-results.mjs --device=TEST-ESP32-001  # Validate specific device
 *   node validate-test-results.mjs --detailed            # Show full record details
 *   node validate-test-results.mjs --export              # Export to JSON file
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse command line arguments
const args = process.argv.slice(2);
const specificDevice = args.find((arg) => arg.startsWith('--device='))?.split('=')[1];
const showDetailed = args.includes('--detailed');
const exportToFile = args.includes('--export');

async function getTestDevices() {
  const query = supabase
    .from('devices')
    .select('*')
    .ilike('device_mac', 'TEST-ESP32-%')
    .order('device_mac');

  if (specificDevice) {
    query.eq('device_mac', specificDevice);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Failed to fetch devices:', error.message);
    return [];
  }

  return data || [];
}

async function validateDevice(device) {
  const deviceId = device.device_id;
  const results = {
    device: {
      mac: device.device_mac,
      code: device.device_code,
      name: device.device_name,
      status: device.provisioning_status,
      is_active: device.is_active,
      battery_voltage: device.battery_voltage,
      battery_health: device.battery_health_percent,
      last_seen: device.last_seen_at,
    },
    wake_sessions: { count: 0, data: [] },
    images: { count: 0, complete: 0, failed: 0, data: [] },
    telemetry: { count: 0, data: [] },
    history: { count: 0, by_category: {}, by_severity: {}, data: [] },
    commands: { count: 0, data: [] },
    submissions: { count: 0, data: [] },
    validations: {
      passed: [],
      warnings: [],
      failures: [],
    },
  };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📱 DEVICE: ${device.device_mac} (${device.device_code})`);
  console.log(`${'='.repeat(70)}`);

  // Validate device status
  if (device.is_active) {
    results.validations.passed.push('Device is active');
  } else {
    results.validations.warnings.push('Device is inactive');
  }

  if (device.last_seen_at) {
    const lastSeen = new Date(device.last_seen_at);
    const hoursSince = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) {
      results.validations.passed.push(`Device seen recently (${hoursSince.toFixed(1)}h ago)`);
    } else {
      results.validations.warnings.push(`Device last seen ${hoursSince.toFixed(1)}h ago`);
    }
  }

  // Wake Sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('device_wake_sessions')
    .select('*')
    .eq('device_id', deviceId)
    .order('wake_timestamp', { ascending: false })
    .limit(10);

  if (!sessionsError && sessions) {
    results.wake_sessions.count = sessions.length;
    results.wake_sessions.data = sessions;

    console.log(`\n📊 Wake Sessions: ${sessions.length}`);
    if (sessions.length > 0) {
      const successCount = sessions.filter((s) => s.status === 'success').length;
      const failedCount = sessions.filter((s) => s.status === 'failed').length;
      const successRate = ((successCount / sessions.length) * 100).toFixed(1);

      console.log(`   ✅ Success: ${successCount}`);
      console.log(`   ❌ Failed: ${failedCount}`);
      console.log(`   📈 Success Rate: ${successRate}%`);

      if (successRate >= 80) {
        results.validations.passed.push(`Good success rate (${successRate}%)`);
      } else {
        results.validations.failures.push(`Low success rate (${successRate}%)`);
      }

      // Show recent sessions
      console.log(`\n   Recent Sessions:`);
      for (const session of sessions.slice(0, 3)) {
        const timestamp = new Date(session.wake_timestamp).toLocaleString();
        const duration = session.session_duration_ms
          ? `${(session.session_duration_ms / 1000).toFixed(1)}s`
          : 'N/A';
        console.log(
          `   • ${timestamp} - ${session.status} (${duration}) - ${session.chunks_sent}/${session.chunks_total} chunks`
        );
        if (session.error_codes && session.error_codes.length > 0) {
          console.log(`     Errors: ${session.error_codes.join(', ')}`);
        }
      }
    } else {
      results.validations.warnings.push('No wake sessions found');
    }
  }

  // Device Images
  const { data: images, error: imagesError } = await supabase
    .from('device_images')
    .select('*')
    .eq('device_id', deviceId)
    .order('captured_at', { ascending: false })
    .limit(20);

  if (!imagesError && images) {
    results.images.count = images.length;
    results.images.complete = images.filter((img) => img.status === 'complete').length;
    results.images.failed = images.filter((img) => img.status === 'failed').length;
    results.images.data = images;

    console.log(`\n📷 Device Images: ${images.length}`);
    if (images.length > 0) {
      console.log(`   ✅ Complete: ${results.images.complete}`);
      console.log(`   ❌ Failed: ${results.images.failed}`);
      console.log(`   ⏳ In Progress: ${images.length - results.images.complete - results.images.failed}`);

      if (results.images.complete > 0) {
        results.validations.passed.push(`${results.images.complete} image(s) completed`);
      }
      if (results.images.failed > 0) {
        results.validations.failures.push(`${results.images.failed} image(s) failed`);
      }

      // Show recent images
      console.log(`\n   Recent Images:`);
      for (const img of images.slice(0, 3)) {
        const timestamp = new Date(img.captured_at).toLocaleString();
        console.log(
          `   • ${img.image_name} - ${img.status} - ${img.received_chunks}/${img.total_chunks} chunks`
        );
        if (img.error_code !== 0) {
          console.log(`     Error Code: ${img.error_code}`);
        }
      }
    } else {
      results.validations.warnings.push('No images found');
    }
  }

  // Device Telemetry
  const { data: telemetry, error: telemetryError } = await supabase
    .from('device_telemetry')
    .select('*')
    .eq('device_id', deviceId)
    .order('captured_at', { ascending: false })
    .limit(10);

  if (!telemetryError && telemetry) {
    results.telemetry.count = telemetry.length;
    results.telemetry.data = telemetry;

    console.log(`\n🌡️  Device Telemetry: ${telemetry.length} record(s)`);
    if (telemetry.length > 0) {
      results.validations.passed.push('Telemetry data recorded');

      // Calculate averages
      const avgTemp =
        telemetry.reduce((sum, t) => sum + (parseFloat(t.temperature) || 0), 0) /
        telemetry.length;
      const avgHumidity =
        telemetry.reduce((sum, t) => sum + (parseFloat(t.humidity) || 0), 0) /
        telemetry.length;

      console.log(`   📊 Averages (last ${telemetry.length} readings):`);
      console.log(`      Temperature: ${avgTemp.toFixed(1)}°F`);
      console.log(`      Humidity: ${avgHumidity.toFixed(1)}%`);

      if (showDetailed && telemetry.length > 0) {
        const latest = telemetry[0];
        console.log(`   🔍 Latest Reading:`);
        console.log(`      Temp: ${latest.temperature}°F`);
        console.log(`      Humidity: ${latest.humidity}%`);
        console.log(`      Pressure: ${latest.pressure} hPa`);
        console.log(`      Gas: ${latest.gas_resistance} kΩ`);
      }
    } else {
      results.validations.warnings.push('No telemetry data found');
    }
  }

  // Device History
  const { data: history, error: historyError } = await supabase
    .from('device_history')
    .select('*')
    .eq('device_id', deviceId)
    .order('event_timestamp', { ascending: false })
    .limit(50);

  if (!historyError && history) {
    results.history.count = history.length;
    results.history.data = history;

    // Categorize events
    const byCategory = {};
    const bySeverity = {};

    for (const event of history) {
      byCategory[event.event_category] = (byCategory[event.event_category] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
    }

    results.history.by_category = byCategory;
    results.history.by_severity = bySeverity;

    console.log(`\n📜 Device History: ${history.length} event(s)`);
    if (history.length > 0) {
      results.validations.passed.push('Device history logged');

      console.log(`\n   By Category:`);
      for (const [category, count] of Object.entries(byCategory)) {
        console.log(`      ${category}: ${count}`);
      }

      console.log(`\n   By Severity:`);
      for (const [severity, count] of Object.entries(bySeverity)) {
        const icon = severity === 'error' || severity === 'critical' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`      ${icon} ${severity}: ${count}`);
      }

      if (bySeverity.error > 0 || bySeverity.critical > 0) {
        results.validations.failures.push(
          `${(bySeverity.error || 0) + (bySeverity.critical || 0)} error/critical events`
        );
      }

      if (showDetailed) {
        console.log(`\n   Recent Events:`);
        for (const event of history.slice(0, 5)) {
          const timestamp = new Date(event.event_timestamp).toLocaleString();
          console.log(`   • [${event.severity}] ${event.event_type} - ${timestamp}`);
          if (event.description) {
            console.log(`     ${event.description}`);
          }
        }
      }
    } else {
      results.validations.warnings.push('No history events found');
    }
  }

  // Submissions (if device is mapped)
  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('*, petri_observations(*)')
    .eq('created_by_device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!submissionsError && submissions) {
    results.submissions.count = submissions.length;
    results.submissions.data = submissions;

    console.log(`\n📋 Submissions: ${submissions.length}`);
    if (submissions.length > 0) {
      results.validations.passed.push(`${submissions.length} submission(s) created`);
      console.log(`   ✅ Device is generating submissions and observations`);
    } else {
      results.validations.warnings.push('No submissions found (device may not be mapped to site)');
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ Validations Summary for ${device.device_mac}`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n✅ Passed (${results.validations.passed.length}):`);
  for (const pass of results.validations.passed) {
    console.log(`   • ${pass}`);
  }

  if (results.validations.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${results.validations.warnings.length}):`);
    for (const warning of results.validations.warnings) {
      console.log(`   • ${warning}`);
    }
  }

  if (results.validations.failures.length > 0) {
    console.log(`\n❌ Failures (${results.validations.failures.length}):`);
    for (const failure of results.validations.failures) {
      console.log(`   • ${failure}`);
    }
  }

  return results;
}

async function runValidation() {
  console.log('\n🔍 IoT Device Test Results Validation');
  console.log('='.repeat(70));

  const devices = await getTestDevices();

  if (devices.length === 0) {
    console.log('\n❌ No test devices found. Run: node test-seed-devices.mjs');
    process.exit(1);
  }

  console.log(`\n📱 Found ${devices.length} test device(s)`);

  const allResults = [];

  for (const device of devices) {
    const result = await validateDevice(device);
    allResults.push(result);
  }

  // Export if requested
  if (exportToFile) {
    const exportData = {
      timestamp: new Date().toISOString(),
      devices: allResults,
    };

    const filename = `test-results-${Date.now()}.json`;
    writeFileSync(filename, JSON.stringify(exportData, null, 2));
    console.log(`\n💾 Results exported to: ${filename}`);
  }

  // Overall summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 OVERALL TEST RESULTS`);
  console.log(`${'='.repeat(70)}`);

  const totalSessions = allResults.reduce((sum, r) => sum + r.wake_sessions.count, 0);
  const totalImages = allResults.reduce((sum, r) => sum + r.images.count, 0);
  const completeImages = allResults.reduce((sum, r) => sum + r.images.complete, 0);
  const totalTelemetry = allResults.reduce((sum, r) => sum + r.telemetry.count, 0);
  const totalHistory = allResults.reduce((sum, r) => sum + r.history.count, 0);
  const totalSubmissions = allResults.reduce((sum, r) => sum + r.submissions.count, 0);

  console.log(`\n📊 Data Summary:`);
  console.log(`   • Wake Sessions: ${totalSessions}`);
  console.log(`   • Images: ${completeImages}/${totalImages} complete`);
  console.log(`   • Telemetry Records: ${totalTelemetry}`);
  console.log(`   • History Events: ${totalHistory}`);
  console.log(`   • Submissions: ${totalSubmissions}`);

  const allPassed = allResults.every((r) => r.validations.failures.length === 0);

  if (allPassed) {
    console.log(`\n🎉 ALL VALIDATIONS PASSED!`);
    console.log(`\n✨ Your IoT device system is working correctly.`);
    console.log(`\n📋 Next Steps:`);
    console.log(`   1. View devices in UI: http://localhost:5173/devices`);
    console.log(`   2. Check device sessions and telemetry`);
    console.log(`   3. Verify device history timeline`);
    console.log(`   4. Review submissions and observations`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  SOME VALIDATIONS FAILED`);
    console.log(`\nReview the failures above and:`);
    console.log(`   1. Check MQTT service logs for errors`);
    console.log(`   2. Verify edge function is deployed and running`);
    console.log(`   3. Re-run failed test scenarios`);
    console.log(`   4. Check Supabase dashboard for errors`);
    process.exit(1);
  }
}

// Run validation
runValidation().catch((error) => {
  console.error('\n❌ Validation failed:', error);
  process.exit(1);
});
