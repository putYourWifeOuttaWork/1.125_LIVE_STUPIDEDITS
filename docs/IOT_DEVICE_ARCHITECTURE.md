# IoT Device Integration Architecture

**Last Updated:** 2025-11-07
**Version:** 1.0.0
**Status:** Planning Phase

---

## Table of Contents

1. [Overview](#overview)
2. [Device Hardware & Firmware](#device-hardware--firmware)
3. [Communication Protocol](#communication-protocol)
4. [MQTT Topic Structure](#mqtt-topic-structure)
5. [Message Formats & Payloads](#message-formats--payloads)
6. [Device Lifecycle & Wake Scheduling](#device-lifecycle--wake-scheduling)
7. [Offline Operation & Recovery](#offline-operation--recovery)
8. [Chunked Data Transmission](#chunked-data-transmission)
9. [Server-Side Architecture Requirements](#server-side-architecture-requirements)
10. [Integration with Existing Submission System](#integration-with-existing-submission-system)
11. [Database Schema Requirements](#database-schema-requirements)
12. [Alerting & Monitoring](#alerting--monitoring)

---

## Overview

The GRMTek Sporeless system will integrate ESP32-S3 based IoT camera devices that automatically capture petri dish images and environmental telemetry data. These devices operate autonomously on scheduled wake cycles, store data locally on SD cards when offline, and communicate with the server via MQTT over WiFi.

### Key Characteristics

- **Hardware**: ESP32-S3 with ESP32-CAM (OV2640 sensor) + BME680 environmental sensor
- **Communication**: MQTT over WiFi (TLS 8883) via HiveMQ Cloud
- **Power**: Sleepy node architecture with scheduled wake windows
- **Storage**: Local SD card for offline buffering
- **Reliability**: Chunked transmission with retry mechanism
- **Provisioning**: BLE-based WiFi credential setup

---

## Device Hardware & Firmware

### Hardware Components

**ESP32-S3 Module:**
- Main processor with WiFi capability
- Deep sleep support for power conservation
- RTC timer for wake scheduling

**ESP32-CAM (OV2640 Sensor):**
- 2MP camera module
- JPEG compression
- Configurable resolution

**BME680 Environmental Sensor (I2C):**
- Temperature (°C)
- Humidity (%)
- Pressure (hPa)
- Gas resistance (kΩ) - air quality indicator

**SD Card Module:**
- Stores images locally
- Maintains metadata.txt (historical log)
- Maintains pendingImage.txt (upload queue)

**GPIO Connections:**
- D4 - GPIO 5 (SDA) → BME680 SDA
- D5 - GPIO 6 (SCL) → BME680 SCL
- D1 - GPIO 2 (OUTPUT) → Control LED

### Firmware Architecture

**Deep Sleep Mode:**
- Device spends most time in deep sleep
- RTC timer wakes device at scheduled intervals
- Power consumption: ~10µA in sleep, ~160mA active

**Wake Cycle Flow:**
1. Wake from RTC timer
2. Connect to WiFi (3 attempts × 8s timeout)
3. Connect to MQTT broker
4. Send HELLO/alive message
5. Listen for server commands
6. Execute capture/send operations
7. Receive next wake schedule
8. Enter deep sleep

---

## Communication Protocol

### MQTT Configuration

**Broker:**
- Host: `1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud`
- Port: `8883` (TLS/SSL)
- Protocol: MQTT v3.1.1
- Username: `BrainlyTesting`
- Password: `BrainlyTest@1234`
- TLS: Required (SSL_CERT_NONE for testing)

**Quality of Service (QoS):**
- Device→Server messages: QoS 1 (at least once delivery)
- Server→Device commands: QoS 1
- Retained messages: No

### WiFi Retry Logic

```
Attempt 1: Wait 8s for connection
  ↓ Failed
Attempt 2: Wait 8s for connection
  ↓ Failed
Attempt 3: Wait 8s for connection
  ↓ Failed
Enter Offline Mode (≈24s total timeout)
```

---

## MQTT Topic Structure

### Device-to-Server Topics

**Status/Alive Messages:**
```
device/{device_id}/status
```
Device sends heartbeat and reports pending upload count.

**Data Payloads (Metadata & Chunks):**
```
device/{device_id}/data
```
Used for both metadata messages and image chunk payloads.

**Actual Implementation (from Python app):**
```
ESP32CAM/{device_mac}/data
```
Example: `ESP32CAM/B8F862F9CFB8/data`

### Server-to-Device Topics

**Commands:**
```
device/{device_id}/cmd
```
Server sends capture requests, wake schedules, configuration updates.

**Acknowledgments:**
```
device/{device_id}/ack
```
Server sends ACK_OK, MISSING_CHUNKS, or error responses.

---

## Message Formats & Payloads

### 1. Device Alive/Status Message

**Topic:** `device/{device_id}/status`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 5
}
```

**Fields:**
- `device_id` (string): Unique device identifier (MAC-based)
- `status` (string): Always "alive"
- `pendingImg` (integer): Count of unsent images stored on SD card

**Purpose:** Announces device is awake and ready. Server uses `pendingImg` to determine how many images to request.

---

### 2. Server Capture Command

**Topic:** `device/{device_id}/cmd`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "capture_image": true
}
```

**Purpose:** Instructs device to capture a new image and environmental data.

---

### 3. Server Send Image Command

**Topic:** `device/{device_id}/cmd`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "send_image": "image_001.jpg"
}
```

**Fields:**
- `send_image` (string): Filename of image to send (from device's SD card)

**Purpose:** Requests device to transmit a specific image (current or pending).

---

### 4. Image Metadata Message

**Topic:** `device/{device_id}/data`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "capture_timestamp": "2025-08-29T14:30:00Z",
  "image_name": "image_001.jpg",
  "image_size": 4153,
  "max_chunk_size": 128,
  "total_chunks_count": 15,
  "location": "Site_A_Barn_1",
  "error": 0,
  "temperature": 25.5,
  "humidity": 45.2,
  "pressure": 1010.5,
  "gas_resistance": 15.3
}
```

**Fields:**
- `device_id` (string): Device identifier
- `capture_timestamp` (ISO 8601 string): When image was captured (UTC)
- `image_name` (string): Unique image filename
- `image_size` (integer): Total size in bytes
- `max_chunk_size` (integer): Bytes per chunk
- `total_chunks_count` (integer): Number of chunks to expect
- `location` (string): Device physical location identifier
- `error` (integer): 0 = success, non-zero = error code
- `temperature` (float): °C from BME680
- `humidity` (float): % relative humidity
- `pressure` (float): hPa atmospheric pressure
- `gas_resistance` (float): kΩ gas sensor resistance

**Purpose:** Sent BEFORE chunks. Provides server with metadata to prepare for chunk reception.

---

### 5. Image Chunk Payload

**Topic:** `device/{device_id}/data`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 128,
  "payload": "<base64_encoded_bytes>"
}
```

**Fields:**
- `device_id` (string): Device identifier
- `image_name` (string): Image filename (matches metadata)
- `chunk_id` (integer): 0-indexed chunk number
- `max_chunk_size` (integer): Bytes in this chunk (may be less for last chunk)
- `payload` (string): Base64-encoded binary image data

**Purpose:** Transmits image data in manageable chunks. Device sends all chunks sequentially without waiting for individual ACKs.

---

### 6. Server ACK - All Chunks Received

**Topic:** `device/{device_id}/ack`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "ACK_OK": true,
  "next_wake_time": "2025-08-29T17:30:00Z"
}
```

**Fields:**
- `ACK_OK` (boolean): true indicates successful reception
- `next_wake_time` (ISO 8601 string): UTC time for device to wake next

**Purpose:** Confirms all chunks received and reassembled successfully. Device removes image from pendingImage.txt and updates metadata.txt.

---

### 7. Server NACK - Missing Chunks

**Topic:** `device/{device_id}/ack`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```

**Fields:**
- `missing_chunks` (array of integers): List of chunk_ids that were not received

**Purpose:** Requests retransmission of specific chunks. Device resends only the listed chunks.

---

### 8. Server Wake Schedule Command

**Topic:** `device/{device_id}/cmd`

**Payload:**
```json
{
  "device_id": "esp32-cam-01",
  "next_wake": "2025-08-29T20:00:00Z"
}
```

**Fields:**
- `next_wake` (ISO 8601 string): UTC time for next wake cycle

**Purpose:** Updates device wake schedule. Device calculates sleep duration and sets RTC timer.

---

## Device Lifecycle & Wake Scheduling

### Initial Provisioning (BLE)

**Step 1: BLE Commissioning**
- Mobile app connects to device via Bluetooth Low Energy (BLE)
- User provides WiFi credentials (SSID + password)
- User assigns device to site/location
- Device receives unique device_id
- Device stores credentials on SD card

**Step 2: Initial Registration**
- Device wakes and connects to WiFi using stored credentials
- Connects to MQTT broker
- Sends first alive message
- Server responds with initial wake schedule
- Device enters scheduled operation mode

### Normal Operation Cycle

```
┌─────────────────────────┐
│  Deep Sleep             │
│  (RTC Timer Set)        │
└───────────┬─────────────┘
            │ Wake Timer Expires
            ↓
┌─────────────────────────┐
│  Wake Up                │
│  - Initialize WiFi      │
│  - Connect (3 × 8s)     │
└───────────┬─────────────┘
            │ WiFi Connected
            ↓
┌─────────────────────────┐
│  MQTT Connect           │
│  - Establish session    │
│  - Subscribe to topics  │
└───────────┬─────────────┘
            │ MQTT Ready
            ↓
┌─────────────────────────┐
│  Send Alive Message     │
│  - Report device status │
│  - Report pending count │
└───────────┬─────────────┘
            │ Server Responds
            ↓
┌─────────────────────────┐
│  Listen for Commands    │
│  - capture_image        │
│  - send_image           │
└───────────┬─────────────┘
            │ Commands Received
            ↓
┌─────────────────────────┐
│  Execute Operations     │
│  - Capture image        │
│  - Read sensors         │
│  - Store to SD card     │
│  - Send metadata        │
│  - Send chunks          │
└───────────┬─────────────┘
            │ Transmission Complete
            ↓
┌─────────────────────────┐
│  Wait for ACK           │
│  - ACK_OK → success     │
│  - MISSING → retry      │
└───────────┬─────────────┘
            │ ACK_OK with next_wake
            ↓
┌─────────────────────────┐
│  Calculate Sleep Time   │
│  - Parse next_wake UTC  │
│  - Calculate seconds    │
│  - Set RTC timer        │
└───────────┬─────────────┘
            │
            ↓
┌─────────────────────────┐
│  Enter Deep Sleep       │
└─────────────────────────┘
```

### Wake Scheduling Strategy

**Server Responsibilities:**
- Distribute wake times across 100+ devices to avoid network congestion
- Typical schedule: 2 captures per device per day
- Example: Device A wakes at 08:00 and 16:00, Device B at 08:05 and 16:05, etc.
- Provide next_wake timestamp in ACK_OK message

**Device Responsibilities:**
- Maintain last known NTP time from WiFi sync
- Calculate sleep duration: `next_wake_UTC - current_time_UTC`
- Set RTC timer for calculated duration
- Handle clock drift (NTP resync on each wake)

---

## Offline Operation & Recovery

### SD Card Storage Architecture

**metadata.txt (Historical Log):**
```
image_001.jpg|2025-08-29T08:00:00Z|PendingToSend=false|temp=25.5|...
image_002.jpg|2025-08-29T16:00:00Z|PendingToSend=true|temp=24.3|...
image_003.jpg|2025-08-30T08:00:00Z|PendingToSend=true|temp=26.1|...
```
- Pipe-delimited format
- Permanent record of all captures
- `PendingToSend` flag indicates upload status

**pendingImage.txt (Upload Queue):**
```
image_002.jpg|2025-08-29T16:00:00Z
image_003.jpg|2025-08-30T08:00:00Z
```
- Contains only images awaiting upload
- Entries removed upon ACK_OK
- Device reports line count as `pendingImg`

### Offline Capture Scenario

**Situation:** WiFi unavailable for 5 days

**Day 1 (Offline):**
- Device wakes at 08:00
- WiFi retry fails (3 × 8s)
- Captures image + sensor data anyway
- Saves to SD card: `/images/image_001.jpg`
- Appends to metadata.txt (PendingToSend=true)
- Appends to pendingImage.txt
- Uses last NTP time + 24h for timestamp
- Calculates sleep duration from last next_wake + 24h
- Enters deep sleep

**Days 2-5 (Offline):**
- Same process repeats
- 5 total images stored locally
- pendingImage.txt has 5 entries

**Day 6 (WiFi Restored):**
1. Device wakes at scheduled time
2. WiFi connection succeeds
3. Reads pendingImage.txt → `pendingImg = 5`
4. Sends alive message:
   ```json
   {
     "device_id": "esp32-cam-01",
     "status": "alive",
     "pendingImg": 5
   }
   ```
5. Server issues 6 total capture_image commands:
   - 1 for current capture
   - 5 for pending backlog
6. **Sequential Sync Loop:**
   - Server: "send_image: image_001.jpg"
   - Device: Sends metadata + chunks for image_001.jpg
   - Server: Validates → ACK_OK
   - Device: Removes image_001.jpg from pendingImage.txt
   - Updates metadata.txt: PendingToSend=false
   - Server: "send_image: image_002.jpg"
   - ... repeat for all pending images
7. After all pending synced, device captures NEW image (Day 6)
8. Sends new image
9. Receives ACK_OK with next_wake
10. Updates RTC timer with fresh NTP time
11. Enters deep sleep

### Timestamp Handling When Offline

**Problem:** Device has no RTC battery; depends on NTP for accurate time.

**Solution:**
- On each online wake, device syncs NTP time
- Stores last_ntp_time and last_wake_time in memory
- When offline:
  ```
  estimated_current_time = last_ntp_time + (millis() - last_wake_time)
  ```
- For next wake calculation:
  ```
  sleep_duration = last_next_wake + 24h - estimated_current_time
  ```
- Server timestamps are preserved; client-side estimation only for wake scheduling

**Accuracy:**
- ESP32 crystal: ±0.5% drift
- 24-hour period: ±7 minutes potential drift
- NTP resync on reconnection corrects accumulated drift

---

## Chunked Data Transmission

### Why Chunking?

**Problem:** MQTT brokers have message size limits (typically 256KB-1MB). WiFi networks can be unstable, causing large message loss.

**Solution:** Split images into small chunks (128-256 bytes) and transmit with retry mechanism.

### Chunk Transmission Flow

**Phase 1: Metadata**
```
Device → Server:
{
  "total_chunks_count": 150,
  "image_size": 19200,
  "max_chunk_size": 128,
  ...metadata...
}
```
Server prepares to receive 150 chunks for this image_name.

**Phase 2: Chunk Stream**
```
Device → Server: chunk_id=0, payload=<base64>
Device → Server: chunk_id=1, payload=<base64>
Device → Server: chunk_id=2, payload=<base64>
...
Device → Server: chunk_id=149, payload=<base64>
```
Device sends all chunks without waiting for individual ACKs (fire-and-forget).

**Phase 3: Verification**
```
Server checks received chunks: [0, 1, 2, 3, 4, 6, 7, 8, ... 149]
Missing: [5]
```

**Phase 4: Retry**
```
Server → Device:
{
  "image_name": "image_001.jpg",
  "missing_chunks": [5]
}
```

**Phase 5: Resend**
```
Device → Server: chunk_id=5, payload=<base64>
```
Device resends ONLY chunk 5.

**Phase 6: Completion**
```
Server → Device:
{
  "image_name": "image_001.jpg",
  "ACK_OK": true,
  "next_wake_time": "..."
}
```

### Chunk Reassembly (Server-Side)

**Python Implementation (from provided code):**
```python
image_chunks = {
    'device_id|image_name': {
        'max_chunks': 150,
        'chunks': {
            0: b'\xff\xd8\xff\xe0...',
            1: b'...',
            2: b'...'
        },
        'received_count': 3
    }
}

# Reassemble when received_count == max_chunks
merged_bytes = b''.join(chunks[i] for i in sorted(chunks))
```

**Key Logic:**
1. First message with `total_chunks_count` creates image_chunks entry
2. Each chunk message adds to chunks dict
3. When len(chunks) == max_chunks, reassemble
4. Save file: `{timestamp}_{image_name}`
5. Clear image_chunks entry (free memory)

### Error Handling

**Timeout:**
- If chunks don't arrive within 60 seconds, server sends missing_chunks
- Device has 3 retry attempts per chunk
- After 3 failures, server logs error and alerts operator

**Malformed Chunks:**
- Server validates base64 decoding
- Invalid chunks not added to chunks dict
- Treated as missing in verification phase

**Duplicate Chunks:**
- Server overwrites chunk_id if duplicate received
- No harm; last received version used

---

## Server-Side Architecture Requirements

### MQTT Broker Integration

**Current Setup:**
- HiveMQ Cloud broker (managed service)
- No local broker needed (cloud-hosted)

**Server Application Requirements:**
1. **MQTT Client** (Python with paho-mqtt)
   - Subscribe to all `ESP32CAM/+/data` topics (wildcard)
   - Publish commands to `device/{id}/cmd`
   - Handle TLS connection (port 8883)
   - Reconnect logic with exponential backoff

2. **Device Registry**
   - Store device_id, MAC address, assigned site
   - Track last_seen timestamp
   - Store wake schedule
   - Battery health, firmware version

3. **Chunk Manager**
   - In-memory storage of partial images
   - Timeout handling (60s)
   - Missing chunk detection
   - Retry orchestration

4. **Image Storage Service**
   - Save completed images to Supabase Storage
   - Path: `device-observations/{site_id}/{device_id}/{timestamp}_{image_name}`
   - Create observation records in database
   - Associate with site and submission

5. **Command Scheduler**
   - Calculate wake times for all devices
   - Stagger requests to avoid overload
   - Issue capture_image commands
   - Issue send_image commands for pending sync

6. **Monitoring & Alerting**
   - Detect devices that miss expected wake
   - Alert threshold: next_wake + 1 hour
   - Battery health monitoring
   - Error code tracking

### Integration Points

**Supabase Edge Functions:**
- `handle_device_mqtt_message` - Processes incoming MQTT messages
- `create_device_submission` - Creates submission from device data
- `schedule_device_wake` - Calculates and publishes wake times
- `alert_device_offline` - Sends notifications when device misses wake

**Database Tables:**
- `devices` - Device registry
- `device_telemetry` - Environmental sensor data
- `device_images` - Image metadata and status
- `device_commands` - Command queue and history
- `device_alerts` - Alert log

---

## Integration with Existing Submission System

### Parallels with Field Operator Workflow

**Field Operator:**
1. Navigate to site
2. Create new submission (environmental data)
3. Open SubmissionEditPage
4. Capture petri dish images
5. Submit observations
6. Complete session

**IoT Device:**
1. Wake at scheduled time
2. Capture environmental data + image
3. Send data to server
4. Server creates submission automatically
5. Server creates observations from images
6. Device goes back to sleep

### Automated Submission Creation

**Trigger:** Device sends metadata message

**Server Actions:**
1. **Check for existing submission today:**
   ```sql
   SELECT * FROM submissions
   WHERE site_id = '{device_site_id}'
   AND DATE(created_at) = CURRENT_DATE
   AND created_by_device_id = '{device_id}'
   ```

2. **Create submission if none exists:**
   ```sql
   INSERT INTO submissions (
     site_id,
     program_id,
     temperature,
     humidity,
     created_at,
     created_by_device_id,
     is_device_generated
   ) VALUES (...)
   ```

3. **Create petri observation:**
   ```sql
   INSERT INTO petri_observations (
     submission_id,
     petri_code,
     image_url,
     outdoor_temperature,
     outdoor_humidity,
     created_at,
     is_device_generated
   ) VALUES (...)
   ```

4. **Apply site templates:**
   - Device assigned to site has observation templates
   - Server retrieves templates from `sites.petri_defaults`
   - Maps device image to appropriate petri_code
   - If split-enabled template, creates child records

### Key Differences from Manual Submissions

| Aspect | Field Operator | IoT Device |
|--------|---------------|------------|
| Session Management | Yes (submission_sessions table) | No (fire-and-forget) |
| User ID | auth.uid() | NULL (device_id instead) |
| Completion Workflow | Manual "Complete" button | Automatic on ACK_OK |
| Expiration | 11:59 PM same day | No expiration (already complete) |
| Progress Tracking | % complete by observation | N/A (single image per wake) |
| Image Source | User camera/upload | Device autonomous capture |
| Validation | User can edit before submit | Automatic validation rules |
| Split Image Processing | Yes, via Edge Functions | Yes, same pipeline |

### Database Fields to Add

**submissions table:**
- `created_by_device_id` (uuid) - References devices.device_id
- `is_device_generated` (boolean) - Flags automated submissions

**petri_observations table:**
- `is_device_generated` (boolean) - Flags automated observations
- `device_capture_metadata` (jsonb) - Stores full device metadata

**gasifier_observations table:**
- `is_device_generated` (boolean)
- `device_capture_metadata` (jsonb)

### RLS Policies for Device Data

```sql
-- Allow authenticated users to view device-generated submissions
CREATE POLICY "Users can view device submissions"
ON submissions FOR SELECT
TO authenticated
USING (
  is_device_generated = true
  AND site_id IN (
    SELECT site_id FROM sites
    WHERE program_id IN (
      SELECT program_id FROM program_access
      WHERE user_id = auth.uid()
    )
  )
);

-- Prevent users from editing device-generated data
CREATE POLICY "Users cannot edit device submissions"
ON submissions FOR UPDATE
TO authenticated
USING (
  is_device_generated = false
  OR auth.uid() IN (SELECT id FROM users WHERE is_company_admin = true)
);
```

---

## Database Schema Requirements

### New Tables

#### devices

```sql
CREATE TABLE devices (
  device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_mac TEXT UNIQUE NOT NULL,
  device_name TEXT,
  site_id UUID REFERENCES sites(site_id),
  program_id UUID REFERENCES pilot_programs(program_id),
  firmware_version TEXT,
  hardware_version TEXT,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  last_wake_at TIMESTAMPTZ,
  next_wake_at TIMESTAMPTZ,
  wake_schedule_cron TEXT, -- e.g., "0 8,16 * * *" for 8am & 4pm
  battery_voltage NUMERIC(5,2),
  battery_health_percent INTEGER,
  wifi_ssid TEXT,
  mqtt_client_id TEXT,
  provisioned_at TIMESTAMPTZ,
  provisioned_by_user_id UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_devices_site ON devices(site_id);
CREATE INDEX idx_devices_program ON devices(program_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at);
CREATE INDEX idx_devices_next_wake ON devices(next_wake_at);
```

#### device_telemetry

```sql
CREATE TABLE device_telemetry (
  telemetry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  temperature NUMERIC(5,2),
  humidity NUMERIC(5,2),
  pressure NUMERIC(6,2),
  gas_resistance NUMERIC(8,2),
  battery_voltage NUMERIC(5,2),
  wifi_rssi INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_telemetry_device ON device_telemetry(device_id);
CREATE INDEX idx_device_telemetry_captured ON device_telemetry(captured_at);
```

#### device_images

```sql
CREATE TABLE device_images (
  image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id),
  image_name TEXT NOT NULL,
  image_url TEXT,
  image_size INTEGER,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  total_chunks INTEGER,
  received_chunks INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'receiving', 'complete', 'failed'
  error_code INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  submission_id UUID REFERENCES submissions(submission_id),
  observation_id UUID, -- References petri_observations or gasifier_observations
  observation_type TEXT, -- 'petri' or 'gasifier'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_images_device ON device_images(device_id);
CREATE INDEX idx_device_images_status ON device_images(status);
CREATE INDEX idx_device_images_captured ON device_images(captured_at);
```

#### device_commands

```sql
CREATE TABLE device_commands (
  command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id),
  command_type TEXT NOT NULL, -- 'capture_image', 'send_image', 'set_wake_schedule', 'update_config'
  command_payload JSONB,
  issued_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'acknowledged', 'failed'
  retry_count INTEGER DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id),
  notes TEXT
);

CREATE INDEX idx_device_commands_device ON device_commands(device_id);
CREATE INDEX idx_device_commands_status ON device_commands(status);
```

#### device_alerts

```sql
CREATE TABLE device_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id),
  alert_type TEXT NOT NULL, -- 'missed_wake', 'low_battery', 'connection_failure', 'sensor_error'
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'error', 'critical'
  message TEXT NOT NULL,
  metadata JSONB,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id),
  resolution_notes TEXT,
  notification_sent BOOLEAN DEFAULT false
);

CREATE INDEX idx_device_alerts_device ON device_alerts(device_id);
CREATE INDEX idx_device_alerts_triggered ON device_alerts(triggered_at);
CREATE INDEX idx_device_alerts_resolved ON device_alerts(resolved_at);
```

### Modified Tables

**submissions:**
```sql
ALTER TABLE submissions
ADD COLUMN created_by_device_id UUID REFERENCES devices(device_id),
ADD COLUMN is_device_generated BOOLEAN DEFAULT false;

CREATE INDEX idx_submissions_device ON submissions(created_by_device_id);
```

**petri_observations:**
```sql
ALTER TABLE petri_observations
ADD COLUMN is_device_generated BOOLEAN DEFAULT false,
ADD COLUMN device_capture_metadata JSONB;
```

**gasifier_observations:**
```sql
ALTER TABLE gasifier_observations
ADD COLUMN is_device_generated BOOLEAN DEFAULT false,
ADD COLUMN device_capture_metadata JSONB;
```

---

## Alerting & Monitoring

### Alert Scenarios

**1. Missed Wake Window**
- Trigger: `devices.next_wake_at + INTERVAL '1 hour' < now() AND last_seen_at < next_wake_at`
- Severity: Warning
- Action: Email/SMS to site manager
- Message: "Device {device_name} missed scheduled wake at {next_wake_at}. Last seen: {last_seen_at}."

**2. Low Battery**
- Trigger: `battery_health_percent < 20`
- Severity: Warning (< 20%), Critical (< 10%)
- Action: Alert maintenance team
- Message: "Device {device_name} battery at {battery_health_percent}%. Requires maintenance."

**3. Connection Failure**
- Trigger: Device sends alive with error code > 0
- Severity: Error
- Action: Log and notify if persistent
- Message: "Device {device_name} reported error code {error_code}."

**4. Image Transmission Failure**
- Trigger: `device_images.retry_count >= 3 AND status = 'failed'`
- Severity: Error
- Action: Alert operator
- Message: "Failed to receive image {image_name} from device {device_name} after 3 retries."

**5. Prolonged Offline**
- Trigger: `last_seen_at < now() - INTERVAL '24 hours'`
- Severity: Critical
- Action: Escalate to field technician
- Message: "Device {device_name} offline for >24 hours. Last seen: {last_seen_at}."

### Monitoring Dashboard Requirements

**Device Status Overview:**
- Total devices registered
- Devices online (seen in last 2 hours)
- Devices offline (>2 hours since last_seen)
- Devices with active alerts

**Individual Device View:**
- Current status (online/offline)
- Last seen timestamp
- Next scheduled wake
- Battery health
- Recent telemetry (charts)
- Image transmission success rate
- Alert history

**Site-Level Aggregation:**
- Devices per site
- Average uptime per site
- Total images captured per site
- Environmental trends (temp, humidity)

---

## Security Considerations

### Device Authentication

**Current State:**
- MQTT username/password shared across all devices (not secure)
- No device-specific credentials

**Recommended:**
- Unique MQTT client_id per device
- Device-specific X.509 certificates
- Certificate-based TLS authentication
- Rotate credentials on provisioning

### Data Integrity

**Image Verification:**
- Calculate CRC/hash of complete image
- Include in metadata message
- Server validates after reassembly

**Replay Attack Prevention:**
- Include timestamp in all messages
- Server rejects messages with old timestamps

### Network Security

**WiFi:**
- WPA2/WPA3 encryption required
- No open networks

**MQTT:**
- TLS 1.2+ required
- Certificate validation enabled (no SSL_CERT_NONE in production)

---

## Implementation Roadmap

### Phase 1: Database Schema (Week 1)
- Create new tables (devices, device_telemetry, device_images, device_commands, device_alerts)
- Modify existing tables (submissions, petri_observations, gasifier_observations)
- Set up RLS policies
- Create indexes

### Phase 2: MQTT Integration (Week 2)
- Deploy Python MQTT client as persistent service
- Subscribe to device topics
- Implement chunk reassembly logic
- Store images in Supabase Storage

### Phase 3: Device Management UI (Week 3)
- Device registry page
- Device detail view
- Wake schedule management
- Command issuing interface

### Phase 4: Automated Submission Creation (Week 4)
- Edge function: handle_device_mqtt_message
- Submission creation logic
- Observation creation with template mapping
- Image split processing integration

### Phase 5: Monitoring & Alerting (Week 5)
- Device health dashboard
- Alert rules engine
- Email/SMS notifications
- Historical analytics

### Phase 6: Testing & Rollout (Week 6)
- Integration testing with real devices
- Offline scenario testing
- Performance testing (100+ devices)
- Gradual site-by-site rollout

---

**End of IoT Device Integration Architecture Document**

This document will be updated as implementation progresses and new requirements emerge.
