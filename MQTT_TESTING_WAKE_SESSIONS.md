# MQTT Testing - Simulating Device Wake Sessions

This guide provides MQTT topics and payloads to manually test the snapshot generation system by simulating device wake sessions.

## Prerequisites

1. **MQTT Client** - Install mosquitto_pub or use MQTT Explorer
2. **HiveMQ Cloud Access**:
   - Host: `1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud`
   - Port: `8883` (TLS)
   - Username: `BrainlyTesting`
   - Password: `BrainlyTest@1234`

## Option 1: Using mosquitto_pub (CLI)

### Install mosquitto client
```bash
# macOS
brew install mosquitto

# Ubuntu/Debian
sudo apt-get install mosquitto-clients

# Windows
# Download from https://mosquitto.org/download/
```

### Test Connection
```bash
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 \
  -u BrainlyTesting \
  -P BrainlyTest@1234 \
  --capath /etc/ssl/certs \
  -t "test/connection" \
  -m "Hello from CLI"
```

## Option 2: Using MQTT Explorer (GUI)

1. Download: https://mqtt-explorer.com/
2. Create new connection:
   - Name: HiveMQ BrainlyTree
   - Protocol: mqtts://
   - Host: 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud
   - Port: 8883
   - Username: BrainlyTesting
   - Password: BrainlyTest@1234
   - Enable TLS: Yes

## Important: Device Auto-Provisioning

When a device first connects, it **auto-provisions** with only its MAC address. Position, zone, site assignment, and other fields are set later when an admin maps the device via the web UI.

**What device provides at first connection:**
- `device_mac` (MAC address, e.g., B8F862F9CFB8)
- `status` ("alive")
- `pendingImg` (count of images waiting to upload)

**What is NOT provided (set during manual mapping):**
- Position coordinates (x, y)
- Zone assignment
- Site assignment
- Company assignment

---

## Complete Wake Session Simulation
1) Device → Server: HELLO / alive

Topic: device/esp32cam-01/status
Message:

{
  "device_id": "esp32cam-01",
  "device_mac": "AC:67:B2:11:22:33",
  "status": "alive",
  "pending_count": 0,
  "firmware_version": "bt-aws-v4.0.0",
  "hardware_version": "ESP32-S3",
  "wifi_rssi": -58,
  "battery_voltage": 3.95
}

2) Server → Device: command to capture now (and tell it when to wake next)

Topic: device/esp32cam-01/cmd
Message:

{
  "device_id": "esp32cam-01",
  "command": "capture_image",
  "next_wake": "2025-11-15T10:30:00Z"
}

3) Device → Server: send metadata for the capture

Topic: device/esp32cam-01/data
Message:

{
  "device_id": "esp32cam-01",
  "capture_timestamp": "2025-11-14T19:00:00Z",
  "image_name": "image_001.jpg",
  "image_size": 123456,
  "max_chunk_size": 128,
  "total_chunks_count": 5,
  "location": "GH-01-West",
  "error": 0,
  "temperature": 8.9,
  "humidity": 82.0,
  "pressure": 1009.7,
  "gas_resistance": 15.3,
  "battery_voltage": 3.92,
  "wifi_rssi": -60
}

4) Device → Server: send chunks 1–5

Send FIVE separate messages (change chunk_id and payload_b64 each time).

Topic: device/esp32cam-01/data
Message (example for chunk 1):

{
  "device_id": "esp32cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 128,
  "payload_b64": "iVBORw0KGgoAAAANSUhEUg==" 
}


Repeat for chunk_id 2, 3, 4, 5. (Use any base64 test strings—you’re just exercising your server path.)

5) Server → Device: simulate a missing chunk (force a retry)

Pretend the server is missing chunk 3.

Topic: device/esp32cam-01/ack
Message:

{
  "device_id": "esp32cam-01",
  "image_name": "image_001.jpg",
  "missing_chunks": [3]
}

6) Device → Server: resend only the requested chunk(s)

Topic: device/esp32cam-01/data
Message (resend chunk 3):

{
  "device_id": "esp32cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 3,
  "max_chunk_size": 128,
  "payload_b64": "R0lGODlhAQABAIAAAAUEBA==" 
}

7) Server → Device: ACK_OK + next wake time

Topic: device/esp32cam-01/ack
Message:

{
  "device_id": "esp32cam-01",
  "image_name": "image_001.jpg",
  "ACK_OK": { "next_wake_time": "2025-11-15T10:30:00Z" }
}

What this should light up in your DB

devices: new row resolved by device_mac (or matched if you already seeded it), last_seen_at & next_wake_at updated.

device_wake_sessions: one in-progress→completed session with chunks_total=5, chunks_sent=6 (includes retry), chunks_missing=[3] then cleared, transmission_complete=true.

device_images: row for image_001.jpg with total_chunks=5, received_chunks=5, status='complete', and received_at populated.

device_ack_log: entries for both the missing_chunks reply and the final ACK_OK (with next_wake_time).

device_wake_payloads and device_telemetry: single capture’s environmental data tied to the same device/session.
### Step 1: Device HELLO (Alive Message)

**Topic:** `device/B8F862F9CFB8/status`

**Payload:**
```json
{
  "device_id": "B8F862F9CFB8",
  "status": "alive",
  "pendingImg": 0
}
```

**CLI Command:**
```bash
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 \
  -u BrainlyTesting \
  -P BrainlyTest@1234 \
  --capath /etc/ssl/certs \
  -t "device/B8F862F9CFB8/status" \
  -m '{"device_id":"B8F862F9CFB8","status":"alive","pendingImg":0}'
```

**What happens:**
1. MQTT service receives message
2. Checks if device exists in database
3. If not found, auto-provisions device with:
   - `device_mac` = B8F862F9CFB8
   - `device_code` = DEVICE-ESP32S3-XXX (auto-generated)
   - `provisioning_status` = 'pending_mapping'
   - `hardware_version` = 'ESP32-S3'
4. Device appears in DevicesPage with status "Pending Mapping"
5. Admin can then map device to site via UI

---

### Step 2: Send Telemetry Data

**Topic:** `device/B8F862F9CFB8/data`

**Payload:**
```json
{
  "device_id": "B8F862F9CFB8",
  "temperature": 24.5,
  "humidity": 55.2,
  "pressure": 1013.25,
  "gas_resistance": 18.7,
  "battery_voltage": 4.15,
  "wifi_rssi": -67,
  "capture_timestamp": "2025-11-19T14:00:00Z"
}
```

**CLI Command:**
```bash
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 \
  -u BrainlyTesting \
  -P BrainlyTest@1234 \
  --capath /etc/ssl/certs \
  -t "device/B8F862F9CFB8/data" \
  -m '{"device_id":"B8F862F9CFB8","temperature":24.5,"humidity":55.2,"pressure":1013.25,"gas_resistance":18.7,"battery_voltage":4.15,"wifi_rssi":-67,"capture_timestamp":"2025-11-19T14:00:00Z"}'
```

---

### Step 3: Send Image Metadata

**Topic:** `ESP32CAM/B8F862F9CFB8/data`

**Payload:**
```json
{
  "device_id": "B8F862F9CFB8",
  "capture_timestamp": "2025-11-19T14:00:05Z",
  "image_name": "image_test_001.jpg",
  "image_size": 8192,
  "max_chunk_size": 512,
  "total_chunks_count": 16,
  "location": "Test_Site",
  "error": 0,
  "temperature": 24.5,
  "humidity": 55.2,
  "pressure": 1013.25,
  "gas_resistance": 18.7
}
```

**CLI Command:**
```bash
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 \
  -u BrainlyTesting \
  -P BrainlyTest@1234 \
  --capath /etc/ssl/certs \
  -t "ESP32CAM/B8F862F9CFB8/data" \
  -m '{"device_id":"B8F862F9CFB8","capture_timestamp":"2025-11-19T14:00:05Z","image_name":"image_test_001.jpg","image_size":8192,"max_chunk_size":512,"total_chunks_count":16,"location":"Test_Site","error":0,"temperature":24.5,"humidity":55.2,"pressure":1013.25,"gas_resistance":18.7}'
```

---

### Step 4: Send Image Chunks (simplified - just send chunk 0)

**Topic:** `ESP32CAM/B8F862F9CFB8/data`

**Payload (base64 encoded dummy image data):**
```json
{
  "device_id": "B8F862F9CFB8",
  "image_name": "image_test_001.jpg",
  "chunk_number": 0,
  "total_chunks": 16,
  "chunk_data": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQ..."
}
```

**Note:** For testing snapshots, you don't need to send actual image data. The metadata is enough to trigger the session wake tracking.

---

## Testing Multiple Devices at Once

### Device 1 - DEVICE-002
```bash
# Alive message
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs \
  -t "device/DEVICE002/status" \
  -m '{"device_id":"DEVICE002","status":"alive","pendingImg":0}'

# Telemetry
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs \
  -t "device/DEVICE002/data" \
  -m '{"device_id":"DEVICE002","temperature":22.1,"humidity":60.5,"pressure":1015.0,"gas_resistance":20.3,"battery_voltage":4.2,"wifi_rssi":-55,"capture_timestamp":"2025-11-19T14:00:00Z"}'
```

### Device 2 - DEVICE-003
```bash
# Alive message
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs \
  -t "device/DEVICE003/status" \
  -m '{"device_id":"DEVICE003","status":"alive","pendingImg":0}'

# Telemetry
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs \
  -t "device/DEVICE003/data" \
  -m '{"device_id":"DEVICE003","temperature":23.8,"humidity":52.3,"pressure":1012.5,"gas_resistance":17.9,"battery_voltage":4.1,"wifi_rssi":-72,"capture_timestamp":"2025-11-19T14:00:00Z"}'
```

---

## SQL Helper - Get Your Device MACs

Run this query in Supabase to get the actual device MACs/codes from your database:

```sql
SELECT
  device_id,
  device_code,
  device_mac,
  device_name,
  site_id,
  is_active,
  last_seen_at
FROM devices
WHERE is_active = true
ORDER BY device_code;
```

---

## Simulating a Complete Wake Round

Use this bash script to simulate all devices waking up at once:

```bash
#!/bin/bash

# HiveMQ Config
HOST="1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud"
PORT=8883
USER="BrainlyTesting"
PASS="BrainlyTest@1234"
CAPATH="/etc/ssl/certs"

# Replace these with your actual device codes from the database
DEVICES=("DEVICE-002" "DEVICE-003" "DEVICE-004" "DEVICE-005")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "🚀 Simulating wake round at $TIMESTAMP"

for DEVICE in "${DEVICES[@]}"; do
  echo "📡 Waking device: $DEVICE"

  # Send alive message
  mosquitto_pub -h "$HOST" -p "$PORT" -u "$USER" -P "$PASS" --capath "$CAPATH" \
    -t "device/$DEVICE/status" \
    -m "{\"device_id\":\"$DEVICE\",\"status\":\"alive\",\"pendingImg\":0}"

  # Random telemetry values
  TEMP=$(awk -v min=20 -v max=28 'BEGIN{srand(); print min+rand()*(max-min)}')
  HUMIDITY=$(awk -v min=40 -v max=70 'BEGIN{srand(); print min+rand()*(max-min)}')
  PRESSURE=$(awk -v min=1008 -v max=1018 'BEGIN{srand(); print min+rand()*(max-min)}')

  # Send telemetry
  mosquitto_pub -h "$HOST" -p "$PORT" -u "$USER" -P "$PASS" --capath "$CAPATH" \
    -t "device/$DEVICE/data" \
    -m "{\"device_id\":\"$DEVICE\",\"temperature\":$TEMP,\"humidity\":$HUMIDITY,\"pressure\":$PRESSURE,\"gas_resistance\":18.5,\"battery_voltage\":4.15,\"wifi_rssi\":-65,\"capture_timestamp\":\"$TIMESTAMP\"}"

  echo "✅ $DEVICE telemetry sent"
  sleep 1
done

echo "🎉 Wake round complete!"
```

Save as `simulate-wake-round.sh`, make executable with `chmod +x simulate-wake-round.sh`, then run `./simulate-wake-round.sh`

---

## Verifying Snapshot Generation

After publishing messages, check that snapshots were generated:

```sql
-- Check latest snapshots
SELECT
  snapshot_id,
  site_id,
  wake_number,
  wake_round_start,
  wake_round_end,
  active_devices_count,
  new_images_this_round,
  avg_temperature,
  avg_mgi,
  created_at
FROM session_wake_snapshots
ORDER BY created_at DESC
LIMIT 10;

-- Check device telemetry was recorded
SELECT
  telemetry_id,
  device_id,
  temperature,
  humidity,
  pressure,
  captured_at
FROM device_telemetry
ORDER BY captured_at DESC
LIMIT 20;
```

---

## Quick Test Commands (Copy-Paste Ready)

### Test Device B8F862F9CFB8

```bash
# 1. Send alive
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs -t "device/B8F862F9CFB8/status" -m '{"device_id":"B8F862F9CFB8","status":"alive","pendingImg":0}'

# 2. Send telemetry
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs -t "device/B8F862F9CFB8/data" -m '{"device_id":"B8F862F9CFB8","temperature":24.5,"humidity":55.2,"pressure":1013.25,"gas_resistance":18.7,"battery_voltage":4.15,"wifi_rssi":-67,"capture_timestamp":"2025-11-19T14:00:00Z"}'
```

### Test DEVICE-002

```bash
# 1. Send alive
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs -t "device/DEVICE-002/status" -m '{"device_id":"DEVICE-002","status":"alive","pendingImg":0}'

# 2. Send telemetry
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud -p 8883 -u BrainlyTesting -P BrainlyTest@1234 --capath /etc/ssl/certs -t "device/DEVICE-002/data" -m '{"device_id":"DEVICE-002","temperature":23.1,"humidity":58.2,"pressure":1014.5,"gas_resistance":19.2,"battery_voltage":4.2,"wifi_rssi":-62,"capture_timestamp":"2025-11-19T14:00:00Z"}'
```

---

## Troubleshooting

### Connection Refused
- Verify credentials are correct
- Check firewall isn't blocking port 8883
- Try from a different network

### No Data in Database
- Check MQTT service is running: `curl http://your-mqtt-service/health`
- Verify device exists in database with correct MAC/code
- Check RLS policies allow inserts
- Look at MQTT service logs for errors

### Snapshots Not Generated
- Verify devices are assigned to a site
- Check site has an active session: `SELECT * FROM site_device_sessions WHERE site_id = 'your-site-id' AND status = 'active'`
- Manually trigger: `SELECT generate_hourly_snapshots()`
- Check pg_cron is running: `SELECT * FROM cron.job`

---

## Next Steps

Once you've verified MQTT messages are working:

1. Set up automated device simulators
2. Configure pg_cron for hourly snapshots
3. Build UI to view snapshot timeline
4. Implement real-time device status on HomePage map
5. Add MGI color-coding to device markers
