#!/usr/bin/env node

/**
 * Test Script: Simulate Device Field Provisioning via MQTT
 *
 * This script simulates a real ESP32-CAM device powering on in the field
 * and publishing its first status message to MQTT, triggering auto-provisioning.
 */

import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzE0MzYsImV4cCI6MjA2NjcwNzQzNn0.0msVw5lkmycrU1p1qFiUTv7Q6AB-IIdpZejYbekW4sk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// MQTT Configuration (HiveMQ Cloud)
const MQTT_HOST = '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud';
const MQTT_PORT = 8883;
const MQTT_USERNAME = 'BrainlyTesting';
const MQTT_PASSWORD = 'BrainlyTest@1234';

// Generate a random MAC address for testing
function generateRandomMAC() {
  const hexDigits = '0123456789ABCDEF';
  let mac = '';
  for (let i = 0; i < 6; i++) {
    if (i > 0) mac += ':';
    mac += hexDigits[Math.floor(Math.random() * 16)];
    mac += hexDigits[Math.floor(Math.random() * 16)];
  }
  return mac;
}

// Check if device already exists
async function checkDeviceExists(mac) {
  // First check if device_code column exists
  const { data: testData, error: testError } = await supabase
    .from('devices')
    .select('device_id')
    .limit(1)
    .maybeSingle();

  let selectFields = 'device_id, device_mac, provisioning_status';

  // If we can query, check if device_code is available by trying to select it
  if (!testError) {
    try {
      const { data: codeTest } = await supabase
        .from('devices')
        .select('device_code')
        .limit(1)
        .maybeSingle();

      // If no error, device_code column exists
      selectFields = 'device_id, device_mac, device_code, provisioning_status';
    } catch (e) {
      // device_code column doesn't exist, use basic fields
      console.log('⚠️  Note: device_code column not found, using basic fields');
    }
  }

  const { data, error } = await supabase
    .from('devices')
    .select(selectFields)
    .eq('device_mac', mac)
    .maybeSingle();

  if (error) {
    console.error('❌ Error checking device:', error.message);
    return null;
  }

  return data;
}

// Query pending devices
async function getPendingDevices() {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('provisioning_status', 'pending_mapping')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error querying pending devices:', error.message);
    return [];
  }

  return data || [];
}

async function simulateDeviceProvisioning() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   MQTT Device Provisioning Test - Field Simulation           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Generate a random MAC address
  const deviceMAC = generateRandomMAC();
  console.log(`📡 Generated Test Device MAC: ${deviceMAC}\n`);

  // Check if device already exists
  console.log('🔍 Step 1: Checking if device exists in database...');
  const existingDevice = await checkDeviceExists(deviceMAC);

  if (existingDevice) {
    console.log(`⚠️  Device already exists!`);
    console.log(`   Device ID: ${existingDevice.device_id}`);
    console.log(`   Device Code: ${existingDevice.device_code}`);
    console.log(`   Status: ${existingDevice.provisioning_status}\n`);
    console.log('❌ Test aborted. Use a different MAC address or delete the existing device.\n');
    return;
  }

  console.log('✅ Device does not exist - ready for auto-provisioning\n');

  // Connect to MQTT
  console.log('🔌 Step 2: Connecting to MQTT broker...');
  console.log(`   Host: ${MQTT_HOST}`);
  console.log(`   Port: ${MQTT_PORT}`);

  const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocol: 'mqtts',
    rejectUnauthorized: false,
  });

  return new Promise((resolve, reject) => {
    let messagePublished = false;

    client.on('connect', () => {
      console.log('✅ Connected to MQTT broker\n');

      // Subscribe to command topic to see responses
      client.subscribe(`device/${deviceMAC}/cmd`, (err) => {
        if (err) {
          console.error('❌ Failed to subscribe to cmd topic:', err);
        } else {
          console.log(`📥 Subscribed to device/${deviceMAC}/cmd\n`);
        }
      });

      // Simulate device status message
      console.log('📤 Step 3: Publishing device status message...');
      const statusMessage = {
        device_id: deviceMAC,
        status: 'alive',
        pendingImg: 0
      };

      const topic = `device/${deviceMAC}/status`;
      console.log(`   Topic: ${topic}`);
      console.log(`   Payload:`, JSON.stringify(statusMessage, null, 2));

      client.publish(topic, JSON.stringify(statusMessage), { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ Failed to publish message:', err);
          client.end();
          reject(err);
        } else {
          console.log('✅ Status message published\n');
          messagePublished = true;

          // Wait for auto-provisioning to complete
          console.log('⏳ Step 4: Waiting for auto-provisioning (5 seconds)...\n');

          setTimeout(async () => {
            // Check if device was created
            console.log('🔍 Step 5: Verifying device was auto-provisioned...');
            const newDevice = await checkDeviceExists(deviceMAC);

            if (newDevice) {
              console.log('✅ SUCCESS! Device was auto-provisioned:\n');
              console.log('┌────────────────────────────────────────────────────────┐');
              console.log(`│ Device ID:          ${newDevice.device_id} │`);
              console.log(`│ Device MAC:         ${newDevice.device_mac}              │`);
              console.log(`│ Device Code:        ${newDevice.device_code || 'N/A'}              │`);
              console.log(`│ Status:             ${newDevice.provisioning_status}    │`);
              console.log('└────────────────────────────────────────────────────────┘\n');

              // Query all pending devices
              console.log('📋 Step 6: Querying all pending devices...');
              const pendingDevices = await getPendingDevices();

              console.log(`\n✅ Found ${pendingDevices.length} pending device(s):\n`);

              pendingDevices.forEach((device, index) => {
                console.log(`${index + 1}. ${device.device_mac} (${device.device_code || 'NO CODE'}) - ${device.provisioning_status}`);
                console.log(`   Created: ${new Date(device.created_at).toLocaleString()}`);
                console.log(`   Last Seen: ${device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'}\n`);
              });

              console.log('╔════════════════════════════════════════════════════════════════╗');
              console.log('║                    ✅ TEST SUCCESSFUL                          ║');
              console.log('╚════════════════════════════════════════════════════════════════╝\n');
              console.log('Next Steps:');
              console.log('1. Open your Devices page in the UI');
              console.log('2. You should see the new device in "Pending Devices" section');
              console.log('3. Click "Map Device" to assign it to a site\n');

            } else {
              console.log('❌ FAILED: Device was not auto-provisioned');
              console.log('   Check the MQTT edge function logs for errors\n');
            }

            client.end();
            resolve();
          }, 5000);
        }
      });
    });

    client.on('error', (error) => {
      console.error('❌ MQTT Connection error:', error);
      client.end();
      reject(error);
    });

    client.on('message', (topic, message) => {
      console.log(`\n📨 Received message on ${topic}:`);
      try {
        const payload = JSON.parse(message.toString());
        console.log(JSON.stringify(payload, null, 2));
      } catch (e) {
        console.log(message.toString());
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!messagePublished) {
        console.error('❌ Timeout: Failed to connect or publish message');
        client.end();
        reject(new Error('Timeout'));
      }
    }, 30000);
  });
}

// Run the test
simulateDeviceProvisioning()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
