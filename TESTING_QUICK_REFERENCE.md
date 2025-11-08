# IoT Device Testing - Quick Reference

## 🚀 Quick Start (One Command)

```bash
./run-all-tests.sh
```

This runs everything:
1. Seeds test devices
2. Executes all test scenarios
3. Validates database records
4. Provides summary report

---

## 📝 Individual Commands

### Setup
```bash
# Create test devices
node test-seed-devices.mjs

# Clean up test data
node test-cleanup-devices.mjs
node test-cleanup-devices.mjs --confirm  # Skip prompt
```

### Run Tests
```bash
# All scenarios
node test-device-scenarios.mjs

# Specific scenario
node test-device-scenarios.mjs --scenario=happy
node test-device-scenarios.mjs --scenario=retry
node test-device-scenarios.mjs --scenario=offline
```

### Validation
```bash
# Validate all devices
node validate-test-results.mjs

# Validate specific device
node validate-test-results.mjs --device=TEST-ESP32-001

# Detailed output
node validate-test-results.mjs --detailed

# Export to JSON
node validate-test-results.mjs --export
```

### Manual Simulator
```bash
# Normal mode
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test normal

# Missing chunks
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-002 --test missing_chunks

# Offline recovery
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-003 --test offline_recovery
```

---

## 🎯 Test Devices

| Device MAC | Purpose | Test Scenario |
|------------|---------|---------------|
| TEST-ESP32-001 | Happy path | Successful transmission without errors |
| TEST-ESP32-002 | Retry mechanism | Missing chunks and retransmission |
| TEST-ESP32-003 | Offline recovery | Pending queue synchronization |

---

## 📊 Database Quick Checks

### View Recent Sessions
```sql
SELECT
  d.device_mac,
  s.wake_timestamp,
  s.status,
  s.chunks_sent || '/' || s.chunks_total as chunks,
  s.session_duration_ms / 1000.0 as duration_sec
FROM device_wake_sessions s
JOIN devices d ON d.device_id = s.device_id
WHERE d.device_mac LIKE 'TEST-ESP32-%'
ORDER BY s.wake_timestamp DESC
LIMIT 10;
```

### View Recent Images
```sql
SELECT
  d.device_mac,
  i.image_name,
  i.status,
  i.received_chunks || '/' || i.total_chunks as chunks,
  i.error_code
FROM device_images i
JOIN devices d ON d.device_id = i.device_id
WHERE d.device_mac LIKE 'TEST-ESP32-%'
ORDER BY i.captured_at DESC
LIMIT 10;
```

### View Device History
```sql
SELECT
  d.device_mac,
  h.event_timestamp,
  h.event_category,
  h.event_type,
  h.severity,
  h.description
FROM device_history h
JOIN devices d ON d.device_id = h.device_id
WHERE d.device_mac LIKE 'TEST-ESP32-%'
ORDER BY h.event_timestamp DESC
LIMIT 20;
```

### Check Telemetry
```sql
SELECT
  d.device_mac,
  t.captured_at,
  t.temperature,
  t.humidity,
  t.pressure,
  t.gas_resistance
FROM device_telemetry t
JOIN devices d ON d.device_id = t.device_id
WHERE d.device_mac LIKE 'TEST-ESP32-%'
ORDER BY t.captured_at DESC
LIMIT 10;
```

---

## 🔍 UI Navigation

### View Test Devices
1. Navigate to: `http://localhost:5173/devices`
2. Search for: `TEST-ESP32`
3. Click on any test device card

### View Device Sessions
1. Go to device detail page
2. Click "Wake Sessions" tab (or default view)
3. Expand sessions to see details

### View Device History
1. Go to device detail page
2. Click "History" tab
3. Filter by category or severity

### View Telemetry
1. Open any wake session (click to expand)
2. Scroll to "Telemetry Data" section
3. View sensor readings in cards

---

## ❌ Error Codes Reference

| Code | Category | Severity | Description |
|------|----------|----------|-------------|
| 0 | Success | info | No error |
| 1 | WiFiConnection | error | WiFi connection failed |
| 2 | MQTTConnection | error | MQTT broker connection failed |
| 3 | SensorFailure | error | BME680 sensor read failure |
| 4 | ImageCapture | error | Camera capture failed |
| 5 | ChunkTransmission | warning | Image chunk transmission failed |
| 6 | SDCard | critical | SD card read/write error |
| 7 | BatteryLow | warning | Battery below warning threshold |
| 8 | BatteryCritical | critical | Battery critically low |
| 9 | Timeout | error | Operation timeout |
| 10 | MissedWake | warning | Device missed scheduled wake |
| 11 | MissedMultipleWakes | error | Multiple consecutive wakes missed |

---

## 🔧 Common Issues

### Simulator Won't Connect
```bash
# Check MQTT service
curl http://localhost:3000/health

# Restart MQTT service
cd mqtt-service
npm start
```

### No Data in Database
```bash
# Check edge function logs in Supabase dashboard
# Verify service is running
# Check RLS policies allow inserts
```

### Tests Pass But UI Doesn't Show Data
```bash
# Check browser console for errors
# Verify user has access to test program
# Try logging in as company admin
# Clear browser cache and reload
```

---

## ✅ Success Checklist

After running tests, verify:

- [ ] All test scenarios passed
- [ ] Database has records in all tables
- [ ] Images uploaded to storage
- [ ] Wake sessions show success status
- [ ] Telemetry data displays in UI
- [ ] Device history shows events
- [ ] Error scenarios logged correctly
- [ ] Submissions created (if mapped)
- [ ] Performance is acceptable (< 30s per session)
- [ ] No orphaned or stuck records

---

## 🧹 Cleanup

```bash
# Remove all test devices and data
node test-cleanup-devices.mjs --confirm

# Verify cleanup
node validate-test-results.mjs
# Should show: "No test devices found"
```

---

## 📚 Full Documentation

For complete details, see:
- `IOT_DEVICE_TESTING_GUIDE.md` - Comprehensive testing guide
- `MQTT_PROTOCOL_TESTING_GUIDE.md` - MQTT protocol details
- `docs/IOT_DEVICE_ARCHITECTURE.md` - System architecture

---

## 🆘 Need Help?

1. Check troubleshooting section in `IOT_DEVICE_TESTING_GUIDE.md`
2. Review MQTT service logs
3. Check Supabase dashboard for errors
4. Verify database schema is current
5. Test with single device first before running all scenarios

---

**Quick Test in 3 Steps:**

```bash
# 1. Seed
node test-seed-devices.mjs

# 2. Test
node test-device-scenarios.mjs

# 3. Validate
node validate-test-results.mjs --detailed
```

**View in UI:** http://localhost:5173/devices

**Clean Up:** `node test-cleanup-devices.mjs --confirm`

---

**All tests passing?** 🎉 Your IoT device system is ready for production!
