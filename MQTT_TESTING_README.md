# 🧪 MQTT Protocol Testing Suite

**Complete testing infrastructure for ESP32-CAM MQTT protocol validation**

## 📦 What's Included

This testing suite provides comprehensive tools for testing the BrainlyTree ESP32-CAM MQTT protocol implementation:

### 1. Mock Device Simulator (`mqtt-test-device-simulator.py`)

A full-featured Python simulator that emulates ESP32-CAM device behavior:

- ✅ Complete protocol implementation (status, metadata, chunks, ACK handling)
- ✅ Three test modes: normal, missing_chunks, offline_recovery
- ✅ Configurable chunk sizes and image sizes
- ✅ Realistic sensor data generation (BME680)
- ✅ Automatic retry mechanism testing
- ✅ Multiple device simulation support

### 2. Protocol Validator (`validate-mqtt-protocol.mjs`)

Real-time validation and monitoring tool:

- ✅ Device status verification
- ✅ Telemetry data validation
- ✅ Image transmission tracking
- ✅ Wake session monitoring
- ✅ Device history inspection
- ✅ Submission/observation verification
- ✅ Live monitoring mode

### 3. Quick Start Script (`test-mqtt-protocol.sh`)

Automated test runner:

- ✅ Prerequisites checking
- ✅ MQTT service verification
- ✅ Automated test execution
- ✅ Results validation
- ✅ Summary reporting

### 4. Comprehensive Guide (`MQTT_PROTOCOL_TESTING_GUIDE.md`)

Complete testing documentation:

- ✅ Step-by-step testing procedures
- ✅ Expected outputs for each test
- ✅ Database validation queries
- ✅ Troubleshooting guide
- ✅ Performance benchmarks

---

## 🚀 Quick Start

### One-Command Testing

Run the complete test suite with a single command:

```bash
./test-mqtt-protocol.sh
```

This will:
1. Check all prerequisites
2. Verify MQTT service is running
3. Run all protocol tests
4. Validate results in database
5. Display summary report

### Manual Testing

**Step 1: Start MQTT Service**

```bash
cd mqtt-service
npm install
npm start
```

**Step 2: Run Tests**

```bash
# Run all tests
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test all

# Run specific test
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test normal
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test missing_chunks
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test offline_recovery
```

**Step 3: Validate Results**

```bash
# Quick validation
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001

# Validate specific time window
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=5

# Live monitoring
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --monitor
```

---

## 📋 Test Scenarios

### Test 1: Normal Operation

Tests complete image transmission without errors.

**Command:**
```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test normal
```

**Validates:**
- Device status messages
- Metadata transmission
- Chunked upload
- Image reassembly
- ACK reception
- Wake scheduling

---

### Test 2: Missing Chunks Retry

Tests the retry mechanism when chunks are lost.

**Command:**
```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test missing_chunks
```

**Validates:**
- Missing chunk detection
- Server retry requests
- Selective retransmission
- Successful recovery
- Complete reassembly

---

### Test 3: Offline Recovery

Tests recovery after device has been offline.

**Command:**
```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test offline_recovery
```

**Validates:**
- Pending count reporting
- Sequential image requests
- Multi-image transmission
- Queue processing
- Complete backlog sync

---

## 🔍 Validation Checklist

After running tests, verify these items:

### Device Status
- [ ] Device auto-provisioned or updated
- [ ] `is_active` = true
- [ ] `last_seen_at` updated recently
- [ ] Status transitions correctly

### Telemetry
- [ ] Temperature, humidity, pressure recorded
- [ ] Gas resistance captured
- [ ] Timestamps are correct
- [ ] Data linked to device

### Images
- [ ] Metadata record created
- [ ] All chunks received
- [ ] Status is "complete"
- [ ] Image uploaded to storage
- [ ] Image URL accessible

### Wake Sessions
- [ ] Session created on device wake
- [ ] Chunks tracked during transmission
- [ ] Session completed with duration
- [ ] Next wake scheduled
- [ ] Telemetry linked to session

### Device History
- [ ] Wake events logged
- [ ] Image capture events recorded
- [ ] Chunk transmission tracked
- [ ] Errors properly logged
- [ ] Events linked to session

### Submissions (if device mapped)
- [ ] Submission created automatically
- [ ] Linked to correct site/program
- [ ] Device generated flag set
- [ ] Observation created
- [ ] Image URL in observation

---

## 📊 Database Validation

### Quick Checks

```bash
# Check device exists
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('devices').select('*').eq('device_mac', 'TEST-ESP32-001').single().then(({data}) => console.log(data));
"

# Count recent images
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('device_images').select('*', { count: 'exact' }).eq('status', 'complete').then(({count}) => console.log('Complete images:', count));
"
```

### SQL Validation Queries

See `MQTT_PROTOCOL_TESTING_GUIDE.md` for comprehensive SQL queries.

---

## �� Troubleshooting

### Simulator Won't Connect

**Error:** `[MQTT] ❌ Connection timeout`

**Solutions:**
1. Check MQTT service: `curl http://localhost:3000/health`
2. Verify HiveMQ credentials in simulator
3. Check network/firewall allows port 8883
4. Review MQTT service logs

### No Data in Database

**Error:** `❌ No telemetry data in last 10 minutes`

**Solutions:**
1. Verify MQTT service logs show message processing
2. Check `.env` has correct Supabase credentials
3. Run schema validation: `node verify-schema-complete.mjs`
4. Check Supabase RLS policies
5. Review service role permissions

### Images Stuck in "receiving"

**Error:** `⏳ Progress: 45%` for >5 minutes

**Solutions:**
1. Check if all chunks were sent (simulator logs)
2. Verify MQTT service received all chunks
3. Look for missing chunk requests in device_history
4. Check MQTT service memory/errors
5. Review chunk reassembly logic

### Tests Pass but No Submissions

**Warning:** `This is expected if device is not mapped to a site yet`

**Solution:**
Map the device to a site:
```sql
UPDATE devices
SET site_id = '<valid-site-id>',
    program_id = '<valid-program-id>',
    provisioning_status = 'mapped'
WHERE device_mac = 'TEST-ESP32-001';
```

---

## 📈 Performance Expectations

### Target Metrics

| Metric | Target | Acceptable |
|--------|--------|-----------|
| Image transmission (50KB) | < 10s | < 15s |
| Chunk rate | > 5/sec | > 3/sec |
| Wake session duration | < 30s | < 45s |
| Missing chunk retry | < 5s | < 10s |
| Database write latency | < 500ms | < 1s |

### Monitoring Performance

```bash
# Monitor session durations
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('device_wake_sessions')
  .select('session_duration_ms')
  .eq('status', 'success')
  .then(({data}) => {
    const avg = data.reduce((sum, s) => sum + s.session_duration_ms, 0) / data.length / 1000;
    console.log('Average session duration:', avg.toFixed(2), 'seconds');
  });
"
```

---

## 🧰 Advanced Usage

### Custom Device MAC

```bash
python3 mqtt-test-device-simulator.py --mac BARN-CAM-001 --test all
```

### Custom Test Image

```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test normal --image path/to/test-image.jpg
```

### Multiple Concurrent Devices

```bash
# Terminal 1
python3 mqtt-test-device-simulator.py --mac DEVICE-001 --test normal &

# Terminal 2
python3 mqtt-test-device-simulator.py --mac DEVICE-002 --test normal &

# Terminal 3
python3 mqtt-test-device-simulator.py --mac DEVICE-003 --test normal &
```

### Stress Testing

```bash
# Run 10 devices in sequence with random delays
for i in {1..10}; do
  python3 mqtt-test-device-simulator.py --mac "STRESS-TEST-$(printf %03d $i)" --test normal
  sleep $((RANDOM % 5 + 1))
done
```

---

## 📚 Documentation

- **Complete Testing Guide**: `MQTT_PROTOCOL_TESTING_GUIDE.md`
- **Architecture Document**: `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf`
- **MQTT Service README**: `mqtt-service/README.md`
- **Deployment Guide**: `MQTT_DEPLOYMENT_GUIDE.md`
- **Device Flow Diagram**: `DEVICE_FLOW_DIAGRAM.md`

---

## 🎯 Next Steps

After successful testing:

1. **Review Results**
   - Check all validations passed
   - Verify data in Supabase dashboard
   - Review device history events

2. **Test Edge Cases**
   - Very large images (>100KB)
   - Network interruptions
   - Rapid wake cycles
   - Extended offline periods

3. **Real Device Testing**
   - Flash firmware to ESP32-CAM
   - Configure WiFi credentials
   - Test auto-provisioning
   - Validate field deployment

4. **Production Deployment**
   - Deploy MQTT service to production
   - Set up monitoring and alerts
   - Configure backup strategies
   - Create operational procedures

---

## ✅ Success Criteria

Your MQTT protocol implementation is ready for production when:

- ✅ All three test scenarios pass consistently
- ✅ Database validation shows complete data flow
- ✅ Images successfully upload to storage
- ✅ Wake sessions track lifecycle correctly
- ✅ Device history provides audit trail
- ✅ Submissions auto-create when device mapped
- ✅ Performance meets target benchmarks
- ✅ No stuck transmissions after multiple tests
- ✅ Error handling works correctly
- ✅ Real device successfully connects and transmits

---

## 🤝 Support

For issues or questions:

1. Review `MQTT_PROTOCOL_TESTING_GUIDE.md` troubleshooting section
2. Check MQTT service logs for errors
3. Verify database schema with `verify-schema-complete.mjs`
4. Review Supabase dashboard logs
5. Test with single device first before concurrent tests

---

**Happy Testing! 🎉**

The protocol is fully implemented and ready for comprehensive validation. Start with `./test-mqtt-protocol.sh` and follow the validation steps to ensure everything works correctly.
