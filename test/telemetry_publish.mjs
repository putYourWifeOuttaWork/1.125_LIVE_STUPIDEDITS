/**
 * Phase 1 Telemetry Test Script
 *
 * Publishes telemetry-only messages to MQTT broker to test the Phase 1 implementation.
 * No image data - just sensor readings.
 *
 * Usage:
 *   node test/telemetry_publish.mjs [device_mac] [scenario]
 *
 * Scenarios:
 *   normal - Normal readings within thresholds
 *   high_temp - Temperature above warning threshold
 *   critical_rh - Humidity at critical level
 *   low_battery - Battery voltage low
 */

import mqtt from 'mqtt';
import dotenv from 'dotenv';

dotenv.config();

const MQTT_HOST = process.env.MQTT_HOST || '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud';
const MQTT_PORT = process.env.MQTT_PORT || '8883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'BrainlyTesting';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'BrainlyTest@1234';

const scenarios = {
  normal: {
    temperature: 22.5,
    humidity: 65,
    pressure: 1013.25,
    gas_resistance: 250,
    battery_voltage: 3.7,
    wifi_rssi: -55,
  },
  high_temp: {
    temperature: 38.5,  // Above warning (35) but below danger (40)
    humidity: 60,
    pressure: 1013.25,
    gas_resistance: 250,
    battery_voltage: 3.7,
    wifi_rssi: -55,
  },
  critical_rh: {
    temperature: 25,
    humidity: 87,  // Above critical threshold (85)
    pressure: 1013.25,
    gas_resistance: 250,
    battery_voltage: 3.7,
    wifi_rssi: -55,
  },
  low_battery: {
    temperature: 22.5,
    humidity: 65,
    pressure: 1013.25,
    gas_resistance: 250,
    battery_voltage: 3.1,  // Low battery
    wifi_rssi: -65,  // Weak signal
  },
};

async function publishTelemetry(deviceMac, scenario) {
  // WebSocket MQTT connection (wss://)
  const wsUrl = `wss://${MQTT_HOST}:443/mqtt`;

  console.log(`\n📡 Connecting to MQTT broker: ${wsUrl}`);

  const client = mqtt.connect(wsUrl, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocol: 'wss',
  });

  return new Promise((resolve, reject) => {
    client.on('connect', () => {
      console.log('✅ Connected to MQTT broker');

      const topic = `ESP32CAM/${deviceMac}/data`;
      const scenarioData = scenarios[scenario] || scenarios.normal;

      const payload = {
        device_id: deviceMac,
        captured_at: new Date().toISOString(),
        ...scenarioData,
      };

      console.log(`\n📤 Publishing telemetry to topic: ${topic}`);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      client.publish(topic, JSON.stringify(payload), (err) => {
        if (err) {
          console.error('❌ Publish error:', err);
          client.end();
          reject(err);
        } else {
          console.log('✅ Telemetry published successfully!');
          console.log('\n🔍 Verification steps:');
          console.log('1. Check Supabase: SELECT * FROM device_telemetry ORDER BY captured_at DESC LIMIT 5;');
          console.log(`2. Verify device_id resolved for MAC: ${deviceMac}`);
          console.log('3. Check company_id was set correctly');
          console.log('4. Open IngestFeed UI and select "Telemetry" filter');
          console.log('5. Verify the telemetry event appears in real-time');

          // Wait a bit for message to be processed
          setTimeout(() => {
            client.end();
            resolve();
          }, 2000);
        }
      });
    });

    client.on('error', (error) => {
      console.error('❌ MQTT connection error:', error);
      reject(error);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      client.end();
      reject(new Error('Connection timeout after 10 seconds'));
    }, 10000);
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const deviceMac = args[0] || 'AA:BB:CC:DD:EE:FF'; // Default test MAC
const scenario = args[1] || 'normal';

if (!scenarios[scenario]) {
  console.error(`❌ Invalid scenario: ${scenario}`);
  console.error(`Available scenarios: ${Object.keys(scenarios).join(', ')}`);
  process.exit(1);
}

console.log('🧪 Phase 1 Telemetry Test Script');
console.log('================================');
console.log(`Device MAC: ${deviceMac}`);
console.log(`Scenario: ${scenario}`);

publishTelemetry(deviceMac, scenario)
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
