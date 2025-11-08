import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzE0MzYsImV4cCI6MjA2NjcwNzQzNn0.0msVw5lkmycrU1p1qFiUTv7Q6AB-IIdpZejYbekW4sk';

const supabase = createClient(supabaseUrl, supabaseKey);

const DEVICE_MAC = 'AA:BB:CC:DD:EE:15';
const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/mqtt_device_handler`;

console.log('\n=== TESTING MQTT DEVICE HANDLER ===\n');

// Simulate an MQTT message from the ESP32-CAM device
const mqttMessage = {
  device_mac: DEVICE_MAC,
  message_type: 'telemetry',
  timestamp: new Date().toISOString(),
  data: {
    temperature: 22.5,
    humidity: 65,
    battery_voltage: 3.7,
    battery_percent: 85,
    wifi_rssi: -45,
    free_heap: 150000,
    image_captured: true
  }
};

console.log('Sending test message to MQTT handler...');
console.log('Device MAC:', DEVICE_MAC);
console.log('Message:', JSON.stringify(mqttMessage, null, 2));
console.log('\nCalling edge function...\n');

try {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify(mqttMessage)
  });

  const responseText = await response.text();
  
  console.log('Response Status:', response.status);
  console.log('Response:', responseText);

  if (response.ok) {
    console.log('\n✓ Message processed successfully!');
    
    // Check if telemetry was recorded
    console.log('\nChecking device_telemetry table...');
    const { data: telemetry, error: telError } = await supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_mac', DEVICE_MAC)
      .order('recorded_at', { ascending: false })
      .limit(1);
    
    if (telError) {
      console.log('Error querying telemetry:', telError.message);
    } else if (telemetry && telemetry.length > 0) {
      console.log('\n✓ Telemetry recorded:');
      console.log('  Temperature:', telemetry[0].temperature, '°C');
      console.log('  Humidity:', telemetry[0].humidity, '%');
      console.log('  Battery:', telemetry[0].battery_voltage, 'V');
      console.log('  Recorded at:', telemetry[0].recorded_at);
    } else {
      console.log('⚠️  No telemetry records found yet');
    }
    
    // Check if device last_seen was updated
    console.log('\nChecking device last_seen update...');
    const { data: device, error: devError } = await supabase
      .from('devices')
      .select('device_mac, last_seen_at')
      .eq('device_mac', DEVICE_MAC)
      .single();
    
    if (devError) {
      console.log('Error querying device:', devError.message);
    } else {
      console.log('\n✓ Device last_seen updated:', device.last_seen_at);
    }
  } else {
    console.log('\n❌ Error processing message');
  }
} catch (error) {
  console.log('\n❌ Error calling edge function:', error.message);
}

console.log('\n=== TEST COMPLETE ===\n');
