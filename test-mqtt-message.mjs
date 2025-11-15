#!/usr/bin/env node
/**
 * Test MQTT Message Simulator
 * Sends a test message to verify the MQTT service forwards to edge function
 */

import mqtt from 'mqtt';

const MQTT_HOST = '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud';
const MQTT_PORT = 8883;
const MQTT_USERNAME = 'BrainlyTesting';
const MQTT_PASSWORD = 'BrainlyTest@1234';

console.log('🧪 Connecting to HiveMQ to send test message...');

const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  protocol: 'mqtts',
  rejectUnauthorized: true,
});

client.on('connect', () => {
  console.log('✅ Connected to HiveMQ');

  const testMessage = {
    device_id: 'ESP32CAM-TEST-001',
    device_mac: 'A3:67:B2:11:22:33',
    firmware_version: '1.0.0',
    hardware_version: 'ESP32-S3',
    battery_voltage: 3.8,
    pending_count: 0,
    timestamp: new Date().toISOString(),
  };

  const topic = 'device/ESP32CAM-TEST-001/status';

  console.log(`📤 Publishing test message to topic: ${topic}`);
  console.log('📦 Payload:', JSON.stringify(testMessage, null, 2));

  client.publish(topic, JSON.stringify(testMessage), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish:', err);
    } else {
      console.log('✅ Message published successfully!');
      console.log('\n📊 Check mqtt-service logs for processing...');
      console.log('   Tail logs: tail -f mqtt-service/mqtt-service.log');
    }

    setTimeout(() => {
      client.end();
      process.exit(0);
    }, 2000);
  });
});

client.on('error', (error) => {
  console.error('❌ Connection error:', error);
  process.exit(1);
});
