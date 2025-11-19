# Device & Site Mapping Testing Status

## Big Picture: Device-to-Site Mapping Workflow

We're building and testing the complete flow where:
1. Physical ESP32 devices send MQTT messages to the system
2. New devices auto-provision and appear in the UI
3. Admins map devices to specific locations on site maps
4. Devices capture images and create data submissions
5. Site maps show live device positions and data

## Current Testing Phase

### ✅ Completed
- **Auto-Provision Fix**: Devices with new MAC addresses can now auto-provision without `device_code` conflicts
- **Existing Device Updates**: Devices with known MACs properly update telemetry and status
- **Database Schema**: Complete device tracking with `device_code`, position, mapping metadata

### 🔄 Currently Testing
- **MQTT Message Handling**: Validating status and data message processing
- **Device Discovery**: New devices appear in UI with `pending_mapping` status

### 📋 Next Steps
1. **Test Device Mapping UI**
   - Navigate to site map editor
   - Assign pending device to location on map
   - Verify device position saved correctly

2. **Test Image Submission Flow**
   - Send image metadata from mapped device
   - Verify image chunks received and assembled
   - Confirm submission created in UI

3. **Test Site Map Visualization**
   - View devices on map at their assigned positions
   - Check device status indicators
   - Verify real-time telemetry updates

## Test Devices

### Existing Devices (For Update Testing)
- `DEVICE-ESP32S3-003` - MAC: `A3:67:B2:11:22:33`
- `DEVICE-ESP32S3-004` - MAC: `A6:C7:B4:11:22:23`
- `DEVICE-ESP32S3-007` - MAC: `ZZ:C7:B4:99:99:99`

### New Device (For Auto-Provision Testing)
- **MAC**: `AD:CK:HD:11:22:33` (was causing the error)
- **Expected**: Will get code `DEVICE-ESP32S3-001`
- **Status**: Will start as `pending_mapping`

## Key Files

### Backend (MQTT Handler)
- `supabase/functions/mqtt_device_handler/ingest.ts` - Device message processing
- `supabase/functions/mqtt_device_handler/finalize.ts` - Image assembly
- `supabase/migrations/20251118200000_device_site_assignment_functions.sql` - Mapping logic

### Frontend (UI)
- `src/components/devices/DeviceMappingModal.tsx` - Device assignment UI
- `src/components/sites/SiteMapEditor.tsx` - Interactive site map
- `src/pages/DevicesPage.tsx` - Device management
- `src/pages/DeviceDetailPage.tsx` - Individual device view

## Testing Commands

### Send Status Message (MQTT)
```bash
mosquitto_pub -h $MQTT_HOST -p 8883 -u $MQTT_USERNAME -P $MQTT_PASSWORD \
  -t "device/esp32cam-01/status" \
  -m '{"device_id":"esp32cam-01","device_mac":"AD:CK:HD:11:22:33","status":"alive","pending_count":0,"firmware_version":"bt-aws-v4.0.0","hardware_version":"ESP32-S3","wifi_rssi":-58,"battery_voltage":3.95}' \
  --cafile /path/to/cert
```

### Check Device in Database
```javascript
// Check if device was created
const { data } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', 'AD:CK:HD:11:22:33')
  .single();
```

### Check Auto-Provisioned Devices
```javascript
// Get all pending devices
const { data } = await supabase
  .from('devices')
  .select('device_code, device_mac, device_name, provisioning_status')
  .eq('provisioning_status', 'pending_mapping')
  .order('created_at', { ascending: false });
```

## Success Criteria

### For This Fix
- ✅ New device MAC auto-provisions without errors
- ✅ Unique `device_code` generated correctly
- ✅ Device appears in UI with `pending_mapping` status
- ✅ Existing devices continue to work normally

### For Complete Mapping Flow (Next)
- [ ] Admin can open site map editor
- [ ] Pending devices appear in device pool
- [ ] Device can be dragged to position on map
- [ ] Position saves with x/y coordinates
- [ ] Device status updates from `pending_mapping` to `mapped`
- [ ] Device can then send images and create submissions

## Related Documentation
- `DEVICE_CODE_AUTO_PROVISION_FIX.md` - Details of the code generation fix
- `DEVICE_PROVISIONING_FLOW.md` - Complete provisioning workflow
- `docs/IOT_DEVICE_ARCHITECTURE.md` - Device architecture overview
