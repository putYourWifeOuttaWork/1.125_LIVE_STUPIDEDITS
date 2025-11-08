# IoT Device Testing Guide

**Comprehensive testing infrastructure for ESP32-CAM MQTT protocol validation**

This guide provides step-by-step instructions for testing your complete IoT device system, from the MQTT edge function through the database to the UI.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Test Scenarios](#test-scenarios)
4. [Error Testing](#error-testing)
5. [UI Validation](#ui-validation)
6. [Troubleshooting](#troubleshooting)
7. [Cleanup](#cleanup)

---

## Prerequisites

### Required Services

1. **MQTT Service Running**
   ```bash
   cd mqtt-service
   npm install
   npm start
   ```
   Service should be running on port 3000 and connected to HiveMQ Cloud.

2. **Supabase Edge Function Deployed**
   - `mqtt_device_handler` function must be deployed and running
   - Verify it's subscribed to MQTT topics

3. **Python Environment**
   ```bash
   python3 --version  # Should be 3.8+
   pip3 install paho-mqtt  # MQTT client library
   ```

4. **Node.js Environment**
   ```bash
   node --version  # Should be 18+
   npm install  # Install project dependencies
   ```

### Environment Variables

Ensure your `.env` file contains:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Quick Start

### 1. Setup Test Devices

Create mock test devices in the database:

```bash
node test-seed-devices.mjs
```

This creates 3 test devices:
- `TEST-ESP32-001` - For happy path testing
- `TEST-ESP32-002` - For retry mechanism testing
- `TEST-ESP32-003` - For offline recovery testing

**Expected Output:**
```
✅ Test device seed complete!
📊 Summary:
   • Created 3 test devices
   • Assigned to site: <site-id>
   • Assigned to program: <program-id>
```

### 2. Run Test Scenarios

Execute all test scenarios:

```bash
node test-device-scenarios.mjs
```

Or run a specific scenario:

```bash
# Happy path only
node test-device-scenarios.mjs --scenario=happy

# Retry mechanism only
node test-device-scenarios.mjs --scenario=retry

# Offline recovery only
node test-device-scenarios.mjs --scenario=offline
```

### 3. Validate Results

Check that data was correctly recorded:

```bash
node validate-test-results.mjs
```

For detailed inspection:

```bash
node validate-test-results.mjs --detailed
```

### 4. View in UI

Navigate to your application and verify data displays correctly:

1. Go to `/devices` page
2. Find test devices (TEST-ESP32-001, TEST-ESP32-002, TEST-ESP32-003)
3. Click on a device to view details
4. Check the "Wake Sessions" tab
5. Verify telemetry data displays
6. Check device history events

---

## Test Scenarios

### Scenario 1: Happy Path (No Errors)

**Purpose:** Validates complete successful image transmission without any errors or retries.

**Device:** TEST-ESP32-001

**Test Flow:**
1. Device sends "alive" status message
2. Server responds with "capture_image" command
3. Device sends metadata with environmental data
4. Device sends all image chunks sequentially (no missing chunks)
5. Server reassembles image and uploads to storage
6. Server sends ACK_OK with next_wake_time

**Expected Database Records:**

```sql
-- Wake Session
SELECT * FROM device_wake_sessions
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY wake_timestamp DESC LIMIT 1;
-- Should show: status = 'success', connection_success = true, image_captured = true

-- Device Image
SELECT * FROM device_images
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY captured_at DESC LIMIT 1;
-- Should show: status = 'complete', image_url is populated, received_chunks = total_chunks

-- Telemetry
SELECT * FROM device_telemetry
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY captured_at DESC LIMIT 1;
-- Should have temperature, humidity, pressure, gas_resistance values

-- History Events
SELECT event_category, event_type, severity, description
FROM device_history
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY event_timestamp DESC LIMIT 10;
-- Should show: device_wake_start, image_capture_initiated, telemetry_recorded,
--              chunks_received, image_upload_success

-- Submission (if device is mapped)
SELECT * FROM submissions
WHERE created_by_device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY created_at DESC LIMIT 1;
-- Should show: is_device_generated = true, linked to site and program
```

**UI Validation:**
- ✅ Device card shows "online" status badge
- ✅ Wake session displays with green "success" badge
- ✅ Telemetry card shows sensor readings
- ✅ Session duration is displayed (< 30 seconds is good)
- ✅ Image chunks progress shows 100%
- ✅ No error indicators

---

### Scenario 2: Missing Chunks Retry

**Purpose:** Validates the retry mechanism when image chunks are lost during transmission.

**Device:** TEST-ESP32-002

**Test Flow:**
1. Device sends "alive" status message
2. Server responds with "capture_image" command
3. Device sends metadata
4. Device sends chunks but **intentionally skips chunks 3, 7, and 12**
5. Server detects missing chunks after receiving others
6. Server publishes "missing_chunks" request with array [3, 7, 12]
7. Device retransmits only the missing chunks
8. Server validates all chunks received
9. Server reassembles and uploads image
10. Server sends ACK_OK

**Expected Database Records:**

```sql
-- Wake Session
SELECT chunks_sent, chunks_total, chunks_missing, status
FROM device_wake_sessions
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-002')
ORDER BY wake_timestamp DESC LIMIT 1;
-- Should show: chunks_missing = [3, 7, 12], status = 'success' (eventually)

-- History Events
SELECT event_type, severity, event_data
FROM device_history
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-002')
  AND event_type = 'missing_chunks_requested'
ORDER BY event_timestamp DESC LIMIT 1;
-- Should show: severity = 'warning', event_data contains missing_chunks array
```

**UI Validation:**
- ✅ Session shows "success" status despite retry
- ⚠️ Warning indicator for missing chunks (optional)
- ✅ Final chunk count matches total chunks
- ✅ Session duration slightly longer due to retry
- ✅ Image successfully uploaded

---

### Scenario 3: Offline Recovery

**Purpose:** Validates recovery and sync after device has been offline and accumulated pending images.

**Device:** TEST-ESP32-003

**Test Flow:**
1. Device sends "alive" status with `pendingImg: 3` (simulates 3 offline captures)
2. Server responds with "capture_image" command for current capture
3. Device sends metadata and chunks for current image
4. Server acknowledges
5. Server issues another "capture_image" command for pending image #1
6. Device sends pending image #1
7. Repeat for pending images #2 and #3
8. All 4 images total (1 current + 3 pending) are transmitted

**Expected Database Records:**

```sql
-- Wake Session
SELECT pending_images_count, was_offline_capture
FROM device_wake_sessions
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-003')
ORDER BY wake_timestamp DESC LIMIT 1;
-- Should show: pending_images_count = 3, was_offline_capture = true

-- Device Images (should be 4 total)
SELECT COUNT(*), status
FROM device_images
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-003')
  AND captured_at > NOW() - INTERVAL '10 minutes'
GROUP BY status;
-- Should show: 4 images with status = 'complete'

-- History Events
SELECT event_type, description
FROM device_history
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-003')
  AND event_category = 'OfflineCapture'
ORDER BY event_timestamp DESC;
-- Should show events indicating offline captures were synced
```

**UI Validation:**
- ✅ Session shows pending_images_count indicator
- ✅ "This was an offline capture" alert box displays
- ✅ Multiple images associated with single wake session
- ✅ All 4 submissions created
- ✅ Offline duration displayed (if available)

---

## Error Testing

### Error 1: WiFi Connection Failure (Code 1)

**Simulate:**
Modify the Python simulator to send error code 1 in the metadata.

**Expected Behavior:**
- Device history event created with `event_category = 'ErrorEvent'`
- Event severity is `'error'`
- Wake session status is `'failed'`
- `error_codes` array contains `'1'` or `'WiFi connection failed'`

**Database Validation:**
```sql
SELECT dh.*, dec.error_message, dec.recommended_action
FROM device_history dh
LEFT JOIN device_error_codes dec ON dec.error_code = (dh.event_data->>'error_code')::integer
WHERE dh.device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
  AND dh.event_category = 'ErrorEvent'
ORDER BY dh.event_timestamp DESC LIMIT 1;
```

**UI Validation:**
- ❌ Session shows red "failed" badge
- ❌ Error code displayed in expanded session view
- ❌ Error description from device_error_codes table shown
- ⚠️ Device card shows warning indicator

---

### Error 2: Camera Capture Failure (Code 4)

**Simulate:**
Device sends metadata with `error: 4` field set.

**Expected Behavior:**
- Device image record created with `error_code = 4`
- Wake session status is `'partial'` (metadata received but no image)
- Device history shows image capture error

**Database Validation:**
```sql
SELECT status, error_code, metadata
FROM device_images
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-002')
  AND error_code = 4
ORDER BY captured_at DESC LIMIT 1;
```

**UI Validation:**
- ⚠️ Session shows "partial" status
- ❌ Image capture failure indicated
- ℹ️ Metadata was received and logged
- ❌ No image URL available

---

### Error 3: Missed Wake Window (Code 10)

**Simulate:**
Manually update device `next_wake_at` to 2+ hours in the past, then have device wake late.

**Setup:**
```sql
UPDATE devices
SET next_wake_at = NOW() - INTERVAL '2 hours'
WHERE device_mac = 'TEST-ESP32-001';
```

**Expected Behavior:**
- Device history event with error code 10 (single missed wake)
- Event severity is `'warning'`
- If multiple wakes missed, error code 11 with severity `'error'`

**Database Validation:**
```sql
SELECT event_type, severity, description, event_data
FROM device_history
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
  AND event_type LIKE '%missed%wake%'
ORDER BY event_timestamp DESC LIMIT 1;
```

**UI Validation:**
- ⚠️ Warning indicator on device card
- ⚠️ History timeline shows missed wake event
- ℹ️ Time difference displayed
- 🔋 Battery status checked (low battery may cause missed wakes)

---

## UI Validation Checklist

After running tests, verify the following in the web application:

### Devices Page (`/devices`)

- [ ] Test devices appear in the device registry
- [ ] Device cards show correct status badges (online/offline)
- [ ] Battery indicators display correctly
- [ ] Last seen timestamps are recent
- [ ] Search functionality works for test device MACs

### Device Detail Page (`/devices/:deviceId`)

- [ ] Device information displays correctly
- [ ] Battery voltage and health percentage shown
- [ ] Site and program assignments visible
- [ ] Tabs load without errors

### Wake Sessions Tab

- [ ] Sessions list displays
- [ ] Stats cards show correct counts (Total, Successful, Success Rate, With Errors)
- [ ] Session status badges render correctly (success=green, failed=red, partial=yellow)
- [ ] Session expansion shows detailed information
- [ ] Telemetry data displays in cards with proper units
  - Temperature (°F)
  - Humidity (%)
  - Pressure (hPa)
  - Gas Resistance (kΩ)
- [ ] Chunk transmission progress displays (e.g., "45/50 chunks")
- [ ] Session duration shows in seconds
- [ ] Error codes display if present
- [ ] Offline capture indicator shows when applicable
- [ ] Export to CSV works
- [ ] Filters work (status, date range, with errors, success only)
- [ ] Refresh button updates data

### Device History Tab (if implemented)

- [ ] Event timeline displays chronologically
- [ ] Event categories show with icons
- [ ] Severity badges render correctly (info=blue, warning=yellow, error=red, critical=red)
- [ ] Event descriptions are readable
- [ ] Expandable events show full details
- [ ] Filter by category works
- [ ] Filter by severity works
- [ ] Search events works

---

## Troubleshooting

### Test Devices Not Created

**Problem:** `test-seed-devices.mjs` fails or no devices created

**Solutions:**
1. Check Supabase credentials in `.env`
2. Verify service role key has correct permissions
3. Check database schema is up to date (run latest migrations)
4. Look for constraint violations in error message
5. Ensure at least one site/program exists for assignment

---

### Simulator Doesn't Connect

**Problem:** Python simulator shows `[MQTT] ❌ Connection timeout`

**Solutions:**
1. Verify MQTT service is running: `curl http://localhost:3000/health`
2. Check HiveMQ credentials in simulator match service
3. Verify port 8883 is not blocked by firewall
4. Check MQTT service logs for connection errors
5. Try restarting MQTT service

---

### No Data in Database

**Problem:** Tests run but no records appear in database

**Solutions:**
1. Check MQTT service logs - are messages being received?
2. Verify Supabase edge function is deployed and running
3. Check edge function logs in Supabase dashboard
4. Ensure RLS policies allow service role key to insert
5. Run: `node verify-schema-complete.mjs` to validate schema
6. Check device auto-provisioning worked (device should exist in database)

---

### Images Stuck in "receiving"

**Problem:** Device images show `status = 'receiving'` and never complete

**Solutions:**
1. Check if all chunks were sent (review simulator output)
2. Verify MQTT service received all chunks (check logs)
3. Look for chunk reassembly errors in edge function logs
4. Check device_history for missing_chunks_requested events
5. Verify storage bucket permissions (petri-images bucket)
6. Check for memory issues in edge function

---

### No Submissions Created

**Problem:** Images complete but no submissions or observations created

**Solutions:**
1. Verify device is mapped to a site:
   ```sql
   SELECT site_id, program_id FROM devices WHERE device_mac = 'TEST-ESP32-001';
   ```
2. If site_id is null, device is not mapped:
   ```sql
   UPDATE devices
   SET site_id = '<valid-site-id>',
       program_id = '<valid-program-id>',
       provisioning_status = 'active'
   WHERE device_mac = 'TEST-ESP32-001';
   ```
3. Re-run test scenario after mapping
4. Check edge function logic for submission creation

---

### UI Doesn't Show Data

**Problem:** Database has records but UI doesn't display them

**Solutions:**
1. Check browser console for errors
2. Verify RLS policies allow authenticated user to read records
3. Check that test devices are assigned to a program the user has access to
4. Try logging in as company admin
5. Clear browser cache and reload
6. Check React Query cache isn't stale (refresh page)
7. Verify device detail page route matches device_id format

---

## Cleanup

### Remove All Test Data

After testing, clean up test devices and data:

```bash
node test-cleanup-devices.mjs
```

This will prompt for confirmation and then delete:
- Test devices (TEST-ESP32-%)
- Wake sessions
- Device images
- Device telemetry
- Device history
- Device commands
- Device assignments
- Related submissions and observations

**Skip confirmation prompt:**
```bash
node test-cleanup-devices.mjs --confirm
```

---

## Performance Benchmarks

### Target Metrics

| Metric | Good | Acceptable | Poor |
|--------|------|------------|------|
| Image transmission (50KB) | < 10s | < 20s | > 20s |
| Chunk rate | > 5/sec | > 3/sec | < 3/sec |
| Wake session duration | < 30s | < 60s | > 60s |
| Missing chunk retry | < 5s | < 10s | > 10s |
| Database write latency | < 500ms | < 1s | > 1s |

### Monitoring Performance

Check average session duration:

```sql
SELECT
  AVG(session_duration_ms) / 1000.0 as avg_duration_seconds,
  MIN(session_duration_ms) / 1000.0 as min_duration_seconds,
  MAX(session_duration_ms) / 1000.0 as max_duration_seconds
FROM device_wake_sessions
WHERE status = 'success'
  AND device_id IN (SELECT device_id FROM devices WHERE device_mac LIKE 'TEST-ESP32-%')
  AND wake_timestamp > NOW() - INTERVAL '1 day';
```

---

## Test Checklist Summary

Use this checklist when running tests:

- [ ] Prerequisites verified (MQTT service, edge function, Python, Node.js)
- [ ] Environment variables configured
- [ ] Test devices seeded successfully
- [ ] Happy path test passed
- [ ] Retry mechanism test passed
- [ ] Offline recovery test passed
- [ ] WiFi error test completed
- [ ] Camera error test completed
- [ ] Missed wake test completed
- [ ] Database validation shows expected records
- [ ] UI displays devices correctly
- [ ] Wake sessions visible in UI
- [ ] Telemetry data displays properly
- [ ] Device history shows events
- [ ] Error indicators appear correctly
- [ ] Submissions created for mapped devices
- [ ] Performance meets benchmarks
- [ ] Test data cleaned up

---

## Success Criteria

Your IoT device system is working correctly when:

✅ All test scenarios pass consistently
✅ Database validation shows complete data flow
✅ Images successfully upload to storage
✅ Wake sessions track lifecycle correctly
✅ Device history provides complete audit trail
✅ Submissions auto-create when device is mapped
✅ UI displays all data correctly with proper formatting
✅ Error scenarios are handled gracefully
✅ Performance meets target benchmarks
✅ No stuck transmissions or orphaned records

---

## Next Steps

After successful testing:

1. **Document any issues** found during testing
2. **Test with real hardware** (flash firmware to ESP32-CAM)
3. **Monitor production devices** as they're deployed
4. **Set up alerts** for critical errors (missed wakes, failed sessions)
5. **Create operational procedures** for device management
6. **Train team** on using device monitoring UI

---

**Happy Testing! 🎉**

Your comprehensive IoT device testing infrastructure is ready to validate the complete system from MQTT messages to UI display.
