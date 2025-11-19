# Restart Local MQTT Service with Fix

## What Was Fixed

Fixed the `generateDeviceCode()` function in **both**:
1. ✅ `/supabase/functions/mqtt_device_handler/ingest.ts` (Edge Function)
2. ✅ `/mqtt-service/index.js` (Local MQTT Service)

Both now properly find the first available device code number instead of just counting existing devices.

## Restart Local MQTT Service

The local MQTT service needs to be restarted to pick up the fix:

```bash
# Navigate to mqtt-service directory
cd mqtt-service

# Start the service
npm start
```

This will:
- Connect to HiveMQ Cloud MQTT broker
- Listen for device messages on `device/+/status` and `device/+/data`
- Auto-provision new devices with unique codes
- Forward messages to edge function

## Verify It's Running

In another terminal:

```bash
# Check health
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "mqtt": {
    "connected": true,
    "host": "1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud",
    "port": 8883
  },
  "supabase": {
    "url": "https://jycxolmevsvrxmeinxff.supabase.co",
    "configured": true
  }
}
```

## Test Auto-Provision with Fixed Code

Now test with your device MAC again:

```bash
# Publish status message
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 \
  -u BrainlyTesting \
  -P 'BrainlyTest@1234' \
  -t "device/esp32cam-07/status" \
  -m '{"device_id":"esp32cam-07","device_mac":"AD:CK:HD:11:22:33","status":"alive","pending_count":0,"firmware_version":"bt-aws-v4.0.0","hardware_version":"ESP32-S3","wifi_rssi":-58,"battery_voltage":3.99}' \
  --cafile /path/to/cert
```

## Expected Logs (Fixed)

You should now see:

```
[MQTT] 📨 Message on device/esp32cam-07/status: {"device_id":"esp32cam-07"...}
[STATUS] Device esp32cam-07 (MAC: AD:CK:HD:11:22:33) is alive, pending images: 0
[AUTO-PROVISION] Device AD:CK:HD:11:22:33 not found, attempting auto-provision...
[AUTO-PROVISION] Attempting to provision new device: AD:CK:HD:11:22:33
[SUCCESS] Auto-provisioned device AD:CK:HD:11:22:33 with code DEVICE-ESP32S3-001 and ID {...}
```

**No more duplicate key error!** ✅

## Verify in Database

```bash
node - <<'EOF'
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data } = await supabase
    .from('devices')
    .select('device_code, device_mac, device_name, provisioning_status')
    .eq('device_mac', 'AD:CK:HD:11:22:33')
    .single();

  console.log('New device:', data);
}

check();
EOF
```

Expected output:
```
New device: {
  device_code: 'DEVICE-ESP32S3-001',
  device_mac: 'AD:CK:HD:11:22:33',
  device_name: null,
  provisioning_status: 'pending_mapping'
}
```

## Stop the Service

When done testing:
```bash
# Press Ctrl+C in the terminal running the service
```

## Production Deployment

For production, deploy the service to Railway or Render as described in `mqtt-service/QUICK_START.md`. The fixed code will be deployed automatically.
