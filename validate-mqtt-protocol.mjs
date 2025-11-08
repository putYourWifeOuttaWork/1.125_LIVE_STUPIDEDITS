#!/usr/bin/env node
/**
 * MQTT Protocol Validation and Monitoring Script
 *
 * Validates that the MQTT protocol is working correctly by checking:
 * - Device status updates
 * - Image transmission and reassembly
 * - Telemetry data collection
 * - Submission and observation creation
 * - Wake session tracking
 * - Device history logging
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

function result(passed, message) {
  const icon = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`${icon} ${message}`, color);
}

async function checkDeviceStatus(deviceMac) {
  section('Device Status Check');

  try {
    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('device_mac', deviceMac)
      .maybeSingle();

    if (error) {
      result(false, `Database error: ${error.message}`);
      return null;
    }

    if (!device) {
      result(false, `Device ${deviceMac} not found in database`);
      log('  This is expected for first-time devices (will be auto-provisioned)', 'yellow');
      return null;
    }

    result(true, `Device found: ${device.device_code || device.device_mac}`);
    log(`  Device ID: ${device.device_id}`, 'gray');
    log(`  Status: ${device.provisioning_status}`, 'gray');
    log(`  Active: ${device.is_active}`, 'gray');
    log(`  Last Seen: ${device.last_seen_at || 'Never'}`, 'gray');
    log(`  Firmware: ${device.firmware_version || 'Unknown'}`, 'gray');

    return device;
  } catch (err) {
    result(false, `Exception: ${err.message}`);
    return null;
  }
}

async function checkRecentTelemetry(deviceId, sinceMinutes = 10) {
  section('Telemetry Data Check');

  try {
    const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    const { data: telemetry, error } = await supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .gte('captured_at', sinceTime)
      .order('captured_at', { ascending: false });

    if (error) {
      result(false, `Database error: ${error.message}`);
      return [];
    }

    if (!telemetry || telemetry.length === 0) {
      result(false, `No telemetry data in last ${sinceMinutes} minutes`);
      return [];
    }

    result(true, `Found ${telemetry.length} telemetry record(s) in last ${sinceMinutes} minutes`);

    telemetry.slice(0, 3).forEach((record, idx) => {
      log(`  Record ${idx + 1}:`, 'gray');
      log(`    Temperature: ${record.temperature}°F`, 'gray');
      log(`    Humidity: ${record.humidity}%`, 'gray');
      log(`    Pressure: ${record.pressure} hPa`, 'gray');
      log(`    Gas Resistance: ${record.gas_resistance}`, 'gray');
      log(`    Captured: ${record.captured_at}`, 'gray');
    });

    return telemetry;
  } catch (err) {
    result(false, `Exception: ${err.message}`);
    return [];
  }
}

async function checkImageTransmission(deviceId, sinceMinutes = 10) {
  section('Image Transmission Check');

  try {
    const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    const { data: images, error } = await supabase
      .from('device_images')
      .select('*')
      .eq('device_id', deviceId)
      .gte('created_at', sinceTime)
      .order('created_at', { ascending: false });

    if (error) {
      result(false, `Database error: ${error.message}`);
      return [];
    }

    if (!images || images.length === 0) {
      result(false, `No images transmitted in last ${sinceMinutes} minutes`);
      return [];
    }

    result(true, `Found ${images.length} image(s) transmitted in last ${sinceMinutes} minutes`);

    images.forEach((img, idx) => {
      const statusIcon = img.status === 'complete' ? '✅' : img.status === 'receiving' ? '⏳' : '❌';
      log(`  Image ${idx + 1}: ${statusIcon}`, 'gray');
      log(`    Name: ${img.image_name}`, 'gray');
      log(`    Status: ${img.status}`, 'gray');
      log(`    Size: ${img.image_size} bytes`, 'gray');
      log(`    Chunks: ${img.received_chunks}/${img.total_chunks}`, 'gray');

      if (img.status === 'complete') {
        log(`    ✅ Image URL: ${img.image_url?.substring(0, 60)}...`, 'green');
      } else if (img.status === 'receiving') {
        const progress = ((img.received_chunks / img.total_chunks) * 100).toFixed(1);
        log(`    ⏳ Progress: ${progress}%`, 'yellow');
      } else if (img.status === 'failed') {
        log(`    ❌ Error Code: ${img.error_code}`, 'red');
      }

      log(`    Created: ${img.created_at}`, 'gray');
      if (img.received_at) {
        log(`    Completed: ${img.received_at}`, 'gray');
      }
    });

    // Check for stuck transmissions
    const stuck = images.filter(img => {
      if (img.status !== 'receiving') return false;
      const ageMinutes = (Date.now() - new Date(img.created_at).getTime()) / 1000 / 60;
      return ageMinutes > 5;
    });

    if (stuck.length > 0) {
      log(`\n  ⚠️  Warning: ${stuck.length} image(s) stuck in receiving state for >5 minutes`, 'yellow');
    }

    return images;
  } catch (err) {
    result(false, `Exception: ${err.message}`);
    return [];
  }
}

async function checkWakeSessions(deviceId, sinceMinutes = 10) {
  section('Wake Session Check');

  try {
    const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    const { data: sessions, error } = await supabase
      .from('device_wake_sessions')
      .select('*')
      .eq('device_id', deviceId)
      .gte('wake_timestamp', sinceTime)
      .order('wake_timestamp', { ascending: false });

    if (error) {
      result(false, `Database error: ${error.message}`);
      return [];
    }

    if (!sessions || sessions.length === 0) {
      result(false, `No wake sessions in last ${sinceMinutes} minutes`);
      return [];
    }

    result(true, `Found ${sessions.length} wake session(s) in last ${sinceMinutes} minutes`);

    sessions.forEach((session, idx) => {
      const statusIcon = session.status === 'success' ? '✅' : session.status === 'in_progress' ? '⏳' : '❌';
      log(`  Session ${idx + 1}: ${statusIcon}`, 'gray');
      log(`    Session ID: ${session.session_id}`, 'gray');
      log(`    Status: ${session.status}`, 'gray');
      log(`    Wake Time: ${session.wake_timestamp}`, 'gray');

      if (session.image_captured) {
        log(`    ✅ Image captured`, 'gray');
      }

      if (session.chunks_sent && session.chunks_total) {
        const progress = ((session.chunks_sent / session.chunks_total) * 100).toFixed(1);
        log(`    Chunks: ${session.chunks_sent}/${session.chunks_total} (${progress}%)`, 'gray');
      }

      if (session.transmission_complete) {
        log(`    ✅ Transmission complete`, 'gray');
      }

      if (session.session_duration_ms) {
        const duration = (session.session_duration_ms / 1000).toFixed(2);
        log(`    Duration: ${duration}s`, 'gray');
      }

      if (session.telemetry_data) {
        log(`    📊 Telemetry recorded`, 'gray');
      }

      if (session.next_wake_scheduled) {
        log(`    ⏰ Next wake: ${session.next_wake_scheduled}`, 'gray');
      }
    });

    return sessions;
  } catch (err) {
    result(false, `Exception: ${err.message}`);
    return [];
  }
}

async function checkDeviceHistory(deviceId, sinceMinutes = 10) {
  section('Device History Check');

  try {
    const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    const { data: history, error } = await supabase
      .from('device_history')
      .select('*')
      .eq('device_id', deviceId)
      .gte('event_timestamp', sinceTime)
      .order('event_timestamp', { ascending: false })
      .limit(20);

    if (error) {
      result(false, `Database error: ${error.message}`);
      return [];
    }

    if (!history || history.length === 0) {
      result(false, `No history events in last ${sinceMinutes} minutes`);
      return [];
    }

    result(true, `Found ${history.length} history event(s) in last ${sinceMinutes} minutes`);

    // Group by category
    const categories = {};
    history.forEach(event => {
      if (!categories[event.event_category]) {
        categories[event.event_category] = [];
      }
      categories[event.event_category].push(event);
    });

    Object.entries(categories).forEach(([category, events]) => {
      log(`\n  ${category} (${events.length} events):`, 'blue');
      events.slice(0, 5).forEach(event => {
        const severityIcon = event.severity === 'error' ? '❌' : event.severity === 'warning' ? '⚠️' : 'ℹ️';
        log(`    ${severityIcon} ${event.event_type}`, 'gray');
        if (event.description) {
          log(`       ${event.description}`, 'gray');
        }
        log(`       ${event.event_timestamp}`, 'gray');
      });
    });

    return history;
  } catch (err) {
    result(false, `Exception: ${err.message}`);
    return [];
  }
}

async function checkSubmissionsAndObservations(deviceId, sinceMinutes = 10) {
  section('Submissions & Observations Check');

  try {
    const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

    // Check submissions
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select('*')
      .eq('created_by_device_id', deviceId)
      .gte('created_at', sinceTime)
      .order('created_at', { ascending: false });

    if (subError) {
      result(false, `Submissions error: ${subError.message}`);
      return { submissions: [], observations: [] };
    }

    if (!submissions || submissions.length === 0) {
      result(false, `No submissions created in last ${sinceMinutes} minutes`);
      log('  This is expected if device is not mapped to a site yet', 'yellow');
      return { submissions: [], observations: [] };
    }

    result(true, `Found ${submissions.length} submission(s) created in last ${sinceMinutes} minutes`);

    // Check observations for each submission
    const submissionIds = submissions.map(s => s.submission_id);
    const { data: observations, error: obsError } = await supabase
      .from('petri_observations')
      .select('*')
      .in('submission_id', submissionIds)
      .order('created_at', { ascending: false });

    if (obsError) {
      result(false, `Observations error: ${obsError.message}`);
    } else {
      result(true, `Found ${observations?.length || 0} observation(s) linked to submissions`);
    }

    submissions.forEach((sub, idx) => {
      log(`  Submission ${idx + 1}:`, 'gray');
      log(`    ID: ${sub.submission_id}`, 'gray');
      log(`    Site: ${sub.site_id}`, 'gray');
      log(`    Program: ${sub.program_id}`, 'gray');
      log(`    Device Generated: ${sub.is_device_generated}`, 'gray');
      log(`    Created: ${sub.created_at}`, 'gray');

      const relatedObs = observations?.filter(o => o.submission_id === sub.submission_id) || [];
      if (relatedObs.length > 0) {
        log(`    ✅ ${relatedObs.length} observation(s) linked`, 'green');
        relatedObs.forEach(obs => {
          log(`       - ${obs.observation_id}`, 'gray');
          if (obs.image_url) {
            log(`         Image: ${obs.image_url.substring(0, 50)}...`, 'gray');
          }
        });
      }
    });

    return { submissions, observations: observations || [] };
  } catch (err) {
    result(false, `Exception: ${err.message}`);
    return { submissions: [], observations: [] };
  }
}

async function runProtocolValidation(deviceMac, sinceMinutes = 10) {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║        MQTT Protocol Validation & Monitoring                      ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════════════╝', 'cyan');
  log(`\nDevice MAC: ${deviceMac}`, 'blue');
  log(`Time Window: Last ${sinceMinutes} minutes\n`, 'blue');

  const device = await checkDeviceStatus(deviceMac);

  if (!device) {
    log('\n⚠️  Device not found. Run the simulator first to auto-provision it.', 'yellow');
    log('   Command: python3 mqtt-test-device-simulator.py --mac ' + deviceMac, 'gray');
    return;
  }

  const deviceId = device.device_id;

  // Run all checks
  await checkRecentTelemetry(deviceId, sinceMinutes);
  await checkImageTransmission(deviceId, sinceMinutes);
  await checkWakeSessions(deviceId, sinceMinutes);
  await checkDeviceHistory(deviceId, sinceMinutes);
  await checkSubmissionsAndObservations(deviceId, sinceMinutes);

  section('Summary');
  log('Protocol validation complete!', 'green');
  log('\nNext steps:', 'cyan');
  log('1. Run simulator: python3 mqtt-test-device-simulator.py --mac ' + deviceMac, 'gray');
  log('2. Re-run this script to validate new data', 'gray');
  log('3. Check Supabase dashboard for real-time updates', 'gray');
}

async function monitorLive(deviceMac, intervalSeconds = 30) {
  log('Starting live monitoring mode...', 'cyan');
  log(`Checking every ${intervalSeconds} seconds. Press Ctrl+C to stop.\n`, 'gray');

  while (true) {
    await runProtocolValidation(deviceMac, 1); // Check last 1 minute
    await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const deviceMac = args.find(arg => arg.startsWith('--mac='))?.split('=')[1] || 'TEST-ESP32-001';
const sinceMinutes = parseInt(args.find(arg => arg.startsWith('--since='))?.split('=')[1] || '10');
const monitor = args.includes('--monitor');

if (monitor) {
  monitorLive(deviceMac, 30);
} else {
  runProtocolValidation(deviceMac, sinceMinutes).then(() => {
    console.log('\n');
  });
}
