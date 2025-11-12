# Device Submission Testing Guide

Complete guide for testing the new device-centric submission system with payloads, images, telemetry, and device management.

---

## Overview

The new device submission system replaces manual submission creation with **automated device-driven data collection**. Devices wake up on schedules, capture images, send telemetry, and create structured submission records automatically.

### Key Components

1. **Site Device Sessions** - Daily time windows when devices are expected to communicate
2. **Device Wake Payloads** - Individual wake events with telemetry data
3. **Device Images** - Photos captured by devices during wake events
4. **Automated Submissions** - Created when session locks at end of day

---

## Architecture Quick Reference

```
Site Device Sessions (Daily)
  └─> Device Wake Payloads (Per Wake)
       ├─> Telemetry Data (temp, humidity, battery, etc.)
       └─> Device Images (captured photos)
            └─> Submission Observations (created at session lock)
```

---

## Testing Workflow

### Phase 1: Set Up Test Environment

#### 1.1 Navigate to Device Pool
- **Location:** Main navigation → "Device Pool"
- **What you'll see:** List of all available devices in the pool
- **Key indicators:**
  - Device status badges (active, provisioning, maintenance)
  - Battery health indicators
  - Last seen timestamps

#### 1.2 Register a New Test Device (Optional)
If you need a fresh device for testing:

1. Click **"Register New Device"**
2. Fill in device details:
   - Device Code: `TEST-DEV-001`
   - Device Name: `Test Device 001`
   - Hardware Version: `v1.0`
   - Firmware Version: `v1.0.0`
   - Wake Schedule: `0 */4 * * *` (every 4 hours)
3. Save device
4. Note the `device_id` for later use

---

### Phase 2: Assign Device to Site

#### 2.1 Navigate to Program & Site
1. Go to **Programs** → Select your test program
2. Click on your test site
3. Look for **"Devices"** tab or **"Manage Devices"** button

#### 2.2 Assign Device
1. Click **"Assign Device"**
2. Select device from dropdown
3. Set position (optional): X=10, Y=20
4. Mark as **primary device** (optional)
5. Save assignment

**Expected Result:**
- Device appears in site's device list
- Status shows "Active"
- Assignment timestamp recorded

---

### Phase 3: Verify Session Creation

Site device sessions are auto-created daily at midnight for the current day.

#### 3.1 Check Existing Sessions
1. Navigate to **Lab** → **Site Sessions**
2. Select your test site
3. Look for today's session

**Session Details Should Show:**
- Session ID
- Session Date: Today's date
- Status: `pending` (before start time) or `in_progress` (during session)
- Start Time: Typically 00:00:00 in site's timezone
- End Time: Typically 23:59:59 in site's timezone

#### 3.2 Manual Session Creation (if needed)
Use the database function:
```sql
SELECT create_daily_sessions_for_site(
  '<site_id>',
  CURRENT_DATE
);
```

---

### Phase 4: Simulate Device Communication

#### 4.1 Using MQTT Test Script

The easiest way to test is using the Python simulator:

```bash
cd /tmp/cc-agent/51386994/project
python mqtt-test-device-simulator.py
```

**What the simulator does:**
1. Connects to MQTT broker
2. Sends device wake payload with:
   - Temperature
   - Humidity
   - Battery voltage
   - WiFi signal strength
   - Captured timestamp
3. Sends image data in chunks
4. Waits for ACK from backend

#### 4.2 Manual MQTT Testing

If you want to send payloads manually:

**Topic Structure:**
```
devices/<device_code>/wake
devices/<device_code>/image
```

**Wake Payload Format:**
```json
{
  "device_code": "TEST-DEV-001",
  "captured_at": "2025-11-12T14:30:00Z",
  "temperature": 22.5,
  "humidity": 65.0,
  "battery_voltage": 3.7,
  "wifi_rssi": -65,
  "telemetry": {
    "pressure": 1013.25,
    "gas_resistance": 50000
  }
}
```

---

### Phase 5: Monitor Device Session View

This is the **primary testing interface** for device submissions.

#### 5.1 Access Session Detail Page
1. Navigate to **Lab** → **Site Sessions**
2. Select your test site
3. Click on today's session

#### 5.2 What You Should See

**Session Header:**
- ⏰ **Countdown Timer** - Shows time remaining until session ends
- 📊 **Completion %** - Percentage of expected wakes completed
- 📡 **Total Wakes** - Actual wake count

**Session Statistics:**
- ✅ Completed Wakes
- ❌ Failed Wakes
- ⚠️ Extra Wakes (overage)
- 🎯 Expected Wakes

**Session Details Card:**
- Session Date
- Start/End Times (in site timezone)
- Program Name
- Site Name
- Config Changed Flag (if devices added mid-day)

**Devices in This Session:**
Each device shows:
- Device Code & Name
- Battery voltage & health %
- WiFi SSID & signal strength
- Last seen timestamp
- Expected vs Actual wake counts
- **Expandable Wake History** (see below)

#### 5.3 View Device Wake Details

Click **"View Wake Details"** on any device card to expand:

**Wake Payloads Table:**
| Wake # | Time | Status | Temp | Humidity | Battery | Image |
|--------|------|--------|------|----------|---------|-------|
| 1 | 08:00:05 | Complete | 22.5°C | 65% | 3.7V | 📷 View |
| 2 | 12:00:12 | Complete | 24.1°C | 58% | 3.6V | 📷 View |
| 3 | 16:00:08 | Failed | - | - | - | ❌ |

**Each Wake Shows:**
- Wake window index (1, 2, 3, etc.)
- Actual capture time with seconds precision
- Completion status (pending/complete/failed)
- Full telemetry snapshot
- Image thumbnail or link
- Retry information (if image was resent)

---

### Phase 6: Verify Image Handling

#### 6.1 Image Upload Flow
1. Device captures image
2. Chunks sent via MQTT
3. Backend reassembles chunks
4. Stores in Supabase Storage bucket: `device-images`
5. Links image to wake payload
6. Image status tracked: `pending` → `receiving` → `complete`

#### 6.2 Check Images in Session View
- Click **📷 View** next to any wake payload
- Image opens in lightbox/modal
- Shows full resolution image
- Displays capture metadata

#### 6.3 Image Storage Verification
**Supabase Dashboard:**
1. Go to Storage
2. Open `device-images` bucket
3. Look for path: `<company_id>/<site_id>/<device_id>/<date>/<image_id>.jpg`

---

### Phase 7: Test Retry & Timeout Handling

#### 7.1 Simulate Image Timeout
1. Send wake payload with image
2. Don't send all image chunks
3. Wait for timeout (default: 5 minutes)

**Expected Behavior:**
- Wake payload marked as `failed`
- Image status: `failed`
- Retry command added to queue
- Device receives retry request on next wake

#### 7.2 Verify Retry System
1. Check device command queue:
```sql
SELECT * FROM device_commands
WHERE device_id = '<test_device_id>'
AND command_type = 'retry_image'
ORDER BY created_at DESC;
```

2. Send retry payload with same `wake_window_index`
3. Verify original wake payload updated:
   - `resent_received_at` timestamp set
   - Status changed to `complete`

---

### Phase 8: Session Locking & Submission Creation

#### 8.1 Lock Session Manually (for testing)
```sql
UPDATE site_device_sessions
SET status = 'locked',
    locked_at = NOW()
WHERE session_id = '<test_session_id>';
```

#### 8.2 Trigger Submission Creation
```sql
SELECT fn_create_submission_from_device_session('<test_session_id>');
```

**This function:**
1. Creates main submission record
2. Creates petri observations from wake payloads
3. Links device images to observations
4. Sets submission metadata
5. Marks session as processed

#### 8.3 Verify Submission Created
1. Navigate to **Submissions** page
2. Look for new submission with:
   - Source: `device_session`
   - Device Session ID reference
   - Petri observations matching wake count
   - Images linked correctly

---

### Phase 9: Legacy vs New System Comparison

#### 9.1 Legacy Manual Submission
- User navigates to "New Submission"
- Manually fills forms
- Uploads images one by one
- Saves/completes manually

#### 9.2 New Device Submission
- Fully automated
- No user interaction needed
- Data flows: Device → MQTT → Backend → Database
- Submission created on session lock
- User can view/monitor in real-time

---

## Key Testing Scenarios

### Scenario 1: Happy Path (Full Day Success)
1. ✅ Session auto-created at midnight
2. ✅ Device wakes at scheduled times (4x per day)
3. ✅ Each wake sends telemetry + image
4. ✅ All images received successfully
5. ✅ Session locked at end of day
6. ✅ Submission auto-created with all observations

### Scenario 2: Mid-Day Device Assignment
1. ✅ Session already in progress
2. ✅ New device assigned to site at 2:00 PM
3. ✅ `config_changed_flag` set on session
4. ✅ Device starts communicating immediately
5. ✅ Expected wake count adjusted for partial day

### Scenario 3: Image Retry & Recovery
1. ⚠️ Device sends wake payload
2. ❌ Image chunks timeout (incomplete)
3. ⚠️ Retry command queued
4. ✅ Device receives retry request
5. ✅ Resends image successfully
6. ✅ Wake payload updated with `resent_received_at`

### Scenario 4: Overage Wakes
1. ✅ Device wakes more than expected (e.g., 5 times instead of 4)
2. ⚠️ Extra wake marked with `overage_flag = true`
3. ✅ All wakes still recorded and processed
4. ⚠️ Session statistics show "Extra Wakes" count

### Scenario 5: Battery Drain Detection
1. ✅ Monitor battery_voltage over multiple wakes
2. ⚠️ Voltage drops below threshold (< 3.3V)
3. ⚠️ Alert created in `device_alerts` table
4. ⚠️ Device shows low battery indicator in UI

---

## Database Queries for Testing

### Check Active Sessions
```sql
SELECT
  s.session_id,
  s.session_date,
  s.status,
  s.session_start_time,
  s.session_end_time,
  COUNT(dwp.payload_id) as wake_count
FROM site_device_sessions s
LEFT JOIN device_wake_payloads dwp ON dwp.site_device_session_id = s.session_id
WHERE s.site_id = '<site_id>'
  AND s.session_date = CURRENT_DATE
GROUP BY s.session_id;
```

### Check Device Wake History
```sql
SELECT
  dwp.wake_window_index,
  dwp.captured_at,
  dwp.payload_status,
  dwp.temperature,
  dwp.humidity,
  dwp.battery_voltage,
  di.image_url,
  di.status as image_status
FROM device_wake_payloads dwp
LEFT JOIN device_images di ON di.image_id = dwp.image_id
WHERE dwp.device_id = '<device_id>'
  AND dwp.site_device_session_id = '<session_id>'
ORDER BY dwp.captured_at;
```

### Check Failed Images
```sql
SELECT
  di.image_id,
  di.captured_at,
  di.status,
  di.retry_count,
  di.timeout_reason,
  d.device_code
FROM device_images di
JOIN devices d ON d.device_id = di.device_id
WHERE di.status = 'failed'
  AND di.captured_at::date = CURRENT_DATE;
```

---

## Troubleshooting

### Problem: No sessions created
**Solution:**
- Check `auto_session_scheduler` cron job is running
- Verify site has devices assigned
- Run manual session creation function

### Problem: Device wakes not appearing
**Solution:**
- Verify MQTT service is running
- Check device_code matches exactly
- Review edge function logs
- Confirm session is in `pending` or `in_progress` status

### Problem: Images stuck in "receiving"
**Solution:**
- Check for timeout (> 5 minutes)
- Review chunk buffer table
- Verify storage bucket permissions
- Check device image size limits

### Problem: Countdown timer not showing
**Solution:**
- Refresh page to start timer interval
- Verify session has `session_end_time` set
- Check browser console for errors

---

## Next Steps After Testing

Once testing is successful:

1. ✅ **Monitor Production Sessions Daily**
   - Check completion rates
   - Review failed wake attempts
   - Monitor battery health trends

2. 📊 **Review Analytics**
   - Device uptime percentages
   - Image success rates
   - Session completion metrics

3. 🔧 **Device Maintenance**
   - Schedule battery replacements
   - Update firmware as needed
   - Adjust wake schedules if needed

4. 📈 **Scale Up**
   - Add more devices to sites
   - Replicate successful configurations
   - Train field teams on monitoring

---

## Support & Resources

- **Device Session View:** `/programs/:programId/sites/:siteId/sessions/:sessionId`
- **Device Pool:** `/devices/pool`
- **Lab View:** `/lab/site-sessions`
- **MQTT Service:** `mqtt-service/` directory
- **Migration Files:** `supabase/migrations/202511*`

For issues or questions, check:
- `DEVICE_SUBMISSION_ARCHITECTURE.md`
- `IOT_DEVICE_ARCHITECTURE.md`
- Edge function logs in Supabase dashboard
