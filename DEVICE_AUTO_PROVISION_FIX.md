# Device Auto-Provision Fix

## Problem

Device auto-provisioning was failing with error:
```
null value in column "x_position" of relation "devices" violates not-null constraint
```

## Root Cause

The `devices` table had NOT NULL constraints on columns that should only be set during **manual mapping**, not during **auto-provisioning**.

### Device Provisioning Flow (from BrainlyTree ESP32-CAM docs)

**Step 1: Auto-Provision (MQTT "alive" message)**
- Device sends: `{"device_id": "B8F862F9CFB8", "status": "alive", "pendingImg": 0}`
- System creates device with ONLY:
  - `device_mac` (from message)
  - `hardware_version` = 'ESP32-S3'
  - `device_code` = auto-generated (e.g., DEVICE-ESP32S3-004)
  - `provisioning_status` = 'pending_mapping'

**Step 2: Manual Mapping (Admin UI)**
- Admin assigns device to site via DevicesPage
- System sets:
  - `site_id`, `program_id`, `company_id`
  - `x_position`, `y_position` (coordinates on site map)
  - `zone_id`, `zone_label` (environmental zone)
  - `provisioning_status` = 'mapped' or 'active'

## Solution

**Apply `fix-device-auto-provision-columns.sql` in Supabase SQL Editor**

This migration removes NOT NULL constraints from columns that are set during mapping:

```sql
ALTER TABLE devices ALTER COLUMN x_position DROP NOT NULL;
ALTER TABLE devices ALTER COLUMN y_position DROP NOT NULL;
ALTER TABLE devices ALTER COLUMN zone_id DROP NOT NULL;
ALTER TABLE devices ALTER COLUMN zone_label DROP NOT NULL;
ALTER TABLE devices ALTER COLUMN company_id DROP NOT NULL;
```

## Testing After Fix

### 1. Test MQTT Auto-Provision

Send MQTT message (use MQTT Explorer or mosquitto_pub):

**Topic:** `device/B8F862F9CFB8/status`

**Payload:**
```json
{
  "device_id": "B8F862F9CFB8",
  "status": "alive",
  "pendingImg": 0
}
```

**Expected Result:**
- Device auto-provisions successfully
- No error in MQTT service logs
- Device appears in DevicesPage with status "Pending Mapping"
- Device has NULL values for x_position, y_position, zone_id, zone_label

### 2. Verify Device Appears in UI

Navigate to DevicesPage:
- Look for device with code `DEVICE-ESP32S3-XXX`
- Status should show "Pending Mapping"
- MAC address should be `B8F862F9CFB8`

### 3. Test Manual Mapping

In DevicesPage:
1. Click "Map Device" button
2. Assign to a site
3. Place device on site map (sets x, y coordinates)
4. Save

**Expected Result:**
- Device now has site_id, program_id, company_id
- Device has x_position, y_position set
- provisioning_status changes to 'mapped' or 'active'

## Files Modified

1. **`fix-device-auto-provision-columns.sql`** - Migration to fix NOT NULL constraints
2. **`MQTT_TESTING_WAKE_SESSIONS.md`** - Updated with auto-provision flow explanation
3. **Build passes** - No TypeScript or compilation errors

## Reference

See **BrainlyTree_ESP32CAM_AWS_V4.pdf** Section 5 (Communication Protocol):
- Device Status/Alive message format
- What devices send vs what admins configure

## Next Steps

1. Apply the SQL migration in Supabase
2. Retry the MQTT test message
3. Verify device auto-provisions successfully
4. Test full wake session simulation from updated MQTT guide
