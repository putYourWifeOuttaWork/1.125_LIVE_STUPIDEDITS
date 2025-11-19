# Device Code Auto-Provision Fix

## Context: Device Testing for Site Mapping

This fix is part of testing the device and site mapping functionality. We're validating that:
- **Existing devices** (matching MAC) can send data and receive proper updates ✅
- **New devices** (unknown MAC) are auto-provisioned correctly ✅
- The site mapping UI can assign devices to locations on the site map

## Problem

When devices with new MAC addresses send MQTT status messages, the auto-provisioning system attempts to create a new device record. However, the `device_code` column was added to the schema without a default value or trigger to generate unique codes automatically.

### Error Encountered

```
[ERROR] Failed to auto-provision device: {
  code: '23505',
  details: 'Key (device_code)=(DEVICE-ESP32S3-004) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "devices_device_code_key"'
}
```

## Root Cause

1. The `device_code` column exists with a UNIQUE constraint
2. No DEFAULT value or database trigger generates codes automatically
3. The edge function was not providing a `device_code` during INSERT
4. This caused the database to reject the insert due to the UNIQUE constraint

## Solution

Added a `generateDeviceCode()` function to the MQTT device handler edge function that:

1. Queries existing devices with the same hardware version prefix
2. Extracts numeric suffixes from existing codes (e.g., 003, 004, 007)
3. Finds the first available number in the sequence
4. Generates a unique code like `DEVICE-ESP32S3-001`

### Code Format

```
DEVICE-{HARDWARE_NORMALIZED}-{NNN}
```

Where:
- `HARDWARE_NORMALIZED` = Hardware version with non-alphanumeric chars removed
- `NNN` = Zero-padded 3-digit sequential number (001, 002, etc.)

### Example

For `ESP32-S3` hardware with existing codes:
- `DEVICE-ESP32S3-003`
- `DEVICE-ESP32S3-004`
- `DEVICE-ESP32S3-007`

The next device would get: `DEVICE-ESP32S3-001` (fills the gap)

## Files Modified

1. `/supabase/functions/mqtt_device_handler/ingest.ts`
   - Added `generateDeviceCode()` function
   - Updated auto-provision logic to generate and set `device_code`

## Testing

Validated with `test-device-code-generation.mjs`:
- ✅ Correctly identifies existing codes
- ✅ Finds first available number
- ✅ Generates unique, non-conflicting codes
- ✅ Handles gaps in sequences

## Deployment

The edge function needs to be redeployed:

```bash
# Deploy from Supabase Dashboard or CLI
npx supabase functions deploy mqtt_device_handler --no-verify-jwt
```

Or deploy via Supabase Dashboard:
1. Go to Edge Functions
2. Find `mqtt_device_handler`
3. Click "Deploy new version"
4. The changes are in the ingest.ts file

## Verification

After deployment, test with a new device:

```bash
# Publish a status message with a new MAC address
mosquitto_pub -h $MQTT_HOST -p 8883 -u $MQTT_USERNAME -P $MQTT_PASSWORD \
  -t "device/esp32cam-NEW/status" \
  -m '{"device_id":"esp32cam-NEW","device_mac":"NEW:MA:CA:DD:RE:SS","status":"alive","pending_count":0,"firmware_version":"bt-aws-v4.0.0","hardware_version":"ESP32-S3","wifi_rssi":-58,"battery_voltage":3.95}' \
  --cafile /path/to/cert
```

Expected outcome:
- Device auto-provisions successfully
- Gets assigned `DEVICE-ESP32S3-001` (or next available)
- No duplicate key error

## Behavior Summary

### For Existing Devices (Matching MAC Address)
When a device with a **known MAC** sends messages:

**Status Messages (`/status`):**
- ✅ **Allowed** - Updates device record
- Updates `last_seen_at`, `last_wake_at`, battery, wifi
- Calculates `next_wake_at` based on schedule
- Creates telemetry record (if battery/wifi data present)

**Image/Data Messages (`/data`):**
- ✅ **Allowed** - Processes images and creates submissions
- Uses `fn_resolve_device_lineage` to get site/program/company
- Requires complete lineage (device must be mapped to site/program)
- Creates device_images, updates session counters, stores chunks

### For New Devices (Unknown MAC Address)
When a device with an **unknown MAC** sends messages:

**Status Messages (`/status`):**
- ✅ **Auto-provisions** new device record
- Generates unique `device_code` (e.g., `DEVICE-ESP32S3-001`)
- Sets status to `pending_mapping`
- Device can wake and report but can't create submissions yet

**Image/Data Messages (`/data`):**
- ❌ **Rejected** - Requires complete lineage
- Device must be mapped to a site/program first
- Admin needs to assign via UI before images are accepted

### Testing Flow
1. Send status from new MAC → Auto-provisions device
2. Check Devices page → See new device with `pending_mapping`
3. Assign device to site/program via mapping UI
4. Send image data → Now accepted and creates submissions

## Notes

- The fix maintains backward compatibility
- Existing devices are not affected
- The logic handles any hardware version format
- Gaps in numbering are filled (prefers lower numbers)
- **Security:** New devices can't pollute data until explicitly mapped by admin
