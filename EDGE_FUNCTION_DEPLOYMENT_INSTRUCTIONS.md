# Edge Function Deployment Instructions

## ✅ Single-File Edge Function Ready for Deployment

The consolidated edge function with all firmware protocol fixes is located at:

**File:** `supabase/functions/mqtt_device_handler_bundled/index.ts`

---

## 🚀 Deployment Steps

### Option 1: Supabase Dashboard (Recommended)

1. **Navigate to Edge Functions**
   - Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/functions

2. **Create or Update Function**
   - Click "Deploy new function" (or select existing `mqtt_device_handler`)
   - Name: `mqtt_device_handler`

3. **Copy/Paste Code**
   - Open the file: `supabase/functions/mqtt_device_handler_bundled/index.ts`
   - Copy the ENTIRE contents (1,500+ lines)
   - Paste into the Supabase dashboard editor

4. **Deploy**
   - Click "Deploy" button
   - Wait for deployment to complete

---

## 🔧 What's Included in This Version

### Critical Firmware Protocol Fixes (v3.6.0)

✅ **Field Name Normalization**
- `timestamp` → `capture_timestamp`
- `max_chunks_size` → `max_chunk_size`
- `total_chunk_count` → `total_chunks_count`

✅ **Nested Sensor Data Extraction**
- Extracts `sensor_data: { temperature, humidity, pressure, gas_resistance }`
- Converts to flat structure for backend

✅ **Base64 Chunk Decoding**
- Decodes base64-encoded chunk payloads from firmware
- Validates JPEG header on first chunk (FF D8 FF)
- Logs warnings for invalid headers

✅ **Temperature Conversion**
- Celsius (firmware) → Fahrenheit (database)
- Formula: °F = (°C × 1.8) + 32
- Applied to all temperature fields

✅ **Pending Image List Processing**
- Processes `pending_list` array from device
- Creates/updates `device_images` records via RPC

---

## 📝 Key Features

1. **HTTP Webhook Mode** - No persistent MQTT connection needed
2. **Postgres-Backed Chunk Storage** - Uses `edge_chunk_buffer` table
3. **Idempotent Operations** - Safe to replay messages
4. **MQTT Message Logging** - Full audit trail via `log_mqtt_message` RPC
5. **Device Auto-Provisioning** - Creates new devices on first HELLO
6. **Session Tracking** - Links to `site_device_sessions`
7. **Wake Payload Protocol State** - Tracks device protocol flow

---

## 🧪 Testing After Deployment

### 1. Health Check
```bash
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/mqtt_device_handler
```

**Expected Response:**
```json
{
  "success": true,
  "message": "MQTT Device Handler V3 (HTTP Webhook Mode) - BUNDLED WITH FIRMWARE PROTOCOL FIXES",
  "version": "3.6.0-bundled-protocol-fixes",
  "features": [
    "Firmware field normalization (timestamp → capture_timestamp)",
    "Nested sensor_data extraction to flat structure",
    "Base64 chunk payload decoding",
    "Celsius to Fahrenheit temperature conversion",
    "JPEG header validation",
    "Pending image list processing",
    "Database-backed chunk recovery"
  ]
}
```

### 2. Test with Real Device
- Send HELLO message from ESP32-CAM
- Monitor logs in Supabase dashboard: Functions → mqtt_device_handler → Logs
- Check database: `device_wake_payloads`, `device_images`, `edge_chunk_buffer`

### 3. Look for Success Indicators
```
[Ingest] Normalized firmware metadata
[Ingest] Decoding base64 chunk
[Ingest] ✅ Valid JPEG header detected in first chunk
[Finalize] Image completion success
```

### 4. Check for Errors
```
⚠️ Warning: First chunk may not have valid JPEG header
[Ingest] Invalid payload format
[Storage] Upload error
```

---

## 🔍 Monitoring Logs

Look for these log messages to verify protocol fixes are working:

### Metadata Normalization
```
[Ingest] Normalized firmware metadata: {
  timestamp_field: 'timestamp',
  sensor_data_nested: true,
  temp: 23.5,
  humidity: 65.2,
  chunks_field: 'total_chunk_count (singular)'
}
```

### Base64 Decoding
```
[Ingest] Decoding base64 chunk: 0 length: 1372
[Ingest] Decoded chunk size: 1024 bytes
[Ingest] ✅ Valid JPEG header detected in first chunk
```

### Temperature Conversion
```
[Ingest] Temperature: 23.5°C → 74.3°F
```

---

## 📊 Database Tables Used

- `devices` - Device registration and status
- `device_wake_payloads` - Protocol state tracking
- `device_images` - Image metadata and completion status
- `edge_chunk_buffer` - Temporary chunk storage (30-min TTL)
- `device_telemetry` - Historical sensor readings
- `site_device_sessions` - Session linking

---

## 🚨 Troubleshooting

### Issue: Function timeout
**Solution:** Check `edge_chunk_buffer` for stuck chunks
```sql
SELECT COUNT(*) FROM edge_chunk_buffer WHERE expires_at < NOW();
```

### Issue: Missing chunks not detected
**Solution:** Verify metadata has correct `total_chunks_count`
```sql
SELECT image_name, total_chunks, received_chunks
FROM device_images
WHERE status = 'receiving';
```

### Issue: Temperature values wrong
**Solution:** Verify conversion is applied
```sql
SELECT temperature, captured_at
FROM device_telemetry
ORDER BY captured_at DESC
LIMIT 10;
```
Should show values in Fahrenheit (32-212°F range)

---

## 🔄 Rollback Plan

If issues occur after deployment:

1. **Dashboard Rollback:**
   - Go to Functions → mqtt_device_handler → Deployments
   - Select previous version
   - Click "Redeploy"

2. **Git Rollback:**
   ```bash
   git log supabase/functions/mqtt_device_handler_bundled/index.ts
   git checkout <previous-commit> supabase/functions/mqtt_device_handler_bundled/index.ts
   ```
   Then redeploy via dashboard

---

## 📞 Support Resources

- **Firmware Repository:** https://github.com/entropybeater/ESP32S3_Cam_seed_studio_VX
- **Protocol Documentation:** `mqtt-service/FIRMWARE_PROTOCOL_MAPPING.md`
- **Database Schema:** `test/most_up_to_date_schema.sql`
- **Function Logs:** Supabase Dashboard → Functions → mqtt_device_handler → Logs

---

## ✨ Next Steps After Deployment

1. **Restart MQTT Service** (if using local mqtt-service)
   ```bash
   cd mqtt-service
   pm2 restart mqtt-service
   ```

2. **Test with Real Device**
   - Power on ESP32-CAM device
   - Monitor Supabase logs for HELLO message
   - Verify image transfer completes

3. **Monitor Database**
   - Check `device_wake_payloads` for protocol_state progression
   - Verify `device_images` records are created
   - Confirm temperature values are in Fahrenheit

4. **Review Edge Function Logs**
   - Look for normalization messages
   - Verify base64 decoding logs
   - Check JPEG header validation results

---

## Version History

- **v3.6.0** - Added firmware protocol fixes (Feb 2026)
  - Field normalization
  - Sensor data extraction
  - Base64 decoding
  - Temperature conversion

- **v3.5.0** - Pending list processing
- **v3.4.0** - Pending image resume
- **v3.3.0** - HTTP webhook mode
