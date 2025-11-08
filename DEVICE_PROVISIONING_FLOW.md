# Device Auto-Provisioning Flow

## Overview

This document describes how IoT devices are automatically provisioned when they first connect to the system, and how they flow through the device management lifecycle.

## The Complete Flow

### 1. Device Comes Online (First Connection)

```
Real Device (ESP32-CAM) in the field
        ↓
    Powers on
        ↓
    Connects to WiFi
        ↓
    Publishes to MQTT: device/{MAC_ADDRESS}/status
        ↓
    Payload: { "device_id": "CF:B1:55:36:BC:95", "status": "alive", "pendingImg": 0 }
```

### 2. MQTT Edge Function Receives Status Message

The `mqtt_device_handler` edge function subscribes to `device/+/status` and processes incoming messages:

```typescript
// Line 93-96 in mqtt_device_handler/index.ts
let { data: device } = await supabase
  .from("devices")
  .select("*")
  .eq("device_mac", payload.device_id)  // Looks up by MAC address
  .maybeSingle();
```

### 3. Auto-Provisioning Happens

If the device is **not found** in the database:

```typescript
// NEW CODE - Lines 55-98
if (!device && !deviceError) {
  console.log(`[AUTO-PROVISION] Device ${payload.device_id} not found, attempting auto-provision...`);
  device = await autoProvisionDevice(payload.device_id);
}

async function autoProvisionDevice(deviceMac: string) {
  // Generate unique device code
  const deviceCode = await generateDeviceCode("ESP32-S3");
  // Example: "DEVICE-ESP32S3-001"

  // Insert new device
  const { data: newDevice } = await supabase
    .from("devices")
    .insert({
      device_mac: deviceMac,              // CF:B1:55:36:BC:95
      device_code: deviceCode,            // DEVICE-ESP32S3-001
      device_name: null,                  // Not yet named
      hardware_version: "ESP32-S3",
      provisioning_status: "pending_mapping",  // Key status!
      provisioned_at: new Date().toISOString(),
      is_active: false,                   // Not yet active
      site_id: null,                      // Not assigned to site
      program_id: null,                   // Not assigned to program
      notes: "Auto-provisioned via MQTT connection",
    })
    .select()
    .single();

  return newDevice;
}
```

### 4. Device Appears in Pending List

After auto-provisioning, the device is immediately queryable:

```typescript
// DevicesPage.tsx queries pending devices
const { data: pendingDevices } = await supabase
  .from('devices')
  .select('*')
  .eq('provisioning_status', 'pending_mapping');  // Our new device!
```

### 5. Admin Sees Device in UI

The device now appears in the **"Pending Devices"** section of the Devices page:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  1 Device Awaiting Mapping                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Device: CF:B1:55:36:BC:95                                  │
│  Code: DEVICE-ESP32S3-001                                   │
│  Status: pending_mapping                                    │
│  Last Seen: 2 minutes ago                                   │
│                                                              │
│                    [Map Device Button]                      │
└─────────────────────────────────────────────────────────────┘
```

### 6. Admin Assigns Device to Site

Two options for assignment:

#### Option A: Quick Map (Existing Flow)
```typescript
// Click "Map" button → DeviceSetupWizard opens
// 1. Select Program
// 2. Select Site
// 3. Name Device (optional)
// 4. Set Wake Schedule
// 5. Review & Complete
```

#### Option B: Register First, Assign Later (NEW Flow)
```typescript
// Device already registered via auto-provision
// Admin can:
// - Leave it unassigned
// - Assign it when site info is known
// - Reassign it multiple times
// - Track complete assignment history
```

### 7. Junction Table Records Created

When device is assigned to a site:

```sql
-- device_site_assignments table
INSERT INTO device_site_assignments (
  device_id,
  site_id,
  program_id,
  is_primary,        -- true
  is_active,         -- true
  assigned_at,       -- timestamp
  assigned_by_user_id
);

-- device_program_assignments table
INSERT INTO device_program_assignments (
  device_id,
  program_id,
  is_primary,        -- true
  is_active,         -- true
  assigned_at
);
```

### 8. Device Becomes Operational

```typescript
// Update device status
await supabase
  .from('devices')
  .update({
    site_id: selectedSiteId,           // Primary site reference
    program_id: selectedProgramId,     // Primary program reference
    provisioning_status: 'active',     // Now fully operational!
    mapped_at: new Date().toISOString(),
    mapped_by_user_id: userId
  })
  .eq('device_id', deviceId);
```

### 9. Device Captures Images

Now the device can capture and upload images:

```
Device wakes up (based on wake_schedule_cron)
        ↓
Captures image
        ↓
Publishes to MQTT: ESP32CAM/{MAC}/data
        ↓
Edge function receives image chunks
        ↓
Uploads to Supabase Storage
        ↓
Creates submission and observation
        ↓
Links to site_id and program_id
```

## Key Benefits of This Architecture

### 1. **Zero Configuration Field Deployment**
- Devices can be deployed without pre-registration
- No manual MAC address entry needed in advance
- Field technicians just power on the device
- Device auto-registers when it connects

### 2. **Complete Assignment History**
```sql
-- Query all assignments for a device
SELECT * FROM device_site_assignments
WHERE device_id = '...'
ORDER BY assigned_at DESC;

-- Shows:
-- - When device was assigned
-- - Who assigned it
-- - When it was unassigned
-- - Reason for reassignment
-- - Complete audit trail
```

### 3. **Many-to-Many Relationships**
- Device can be assigned to multiple sites over time
- Sites can be reused across multiple programs
- Full historical context preserved
- Deep analytics possible

### 4. **Flexible Workflows**

**Workflow 1: Register in Field, Assign Later**
```
Device powers on → Auto-provisions → Shows in pending list
                                    ↓
                            Admin assigns when ready
```

**Workflow 2: Pre-Register, Deploy, Auto-Match**
```
Admin manually registers device → Device powers on → Auto-matches by MAC
                                                    ↓
                                            Updates last_seen_at
```

**Workflow 3: Immediate Assignment**
```
Device powers on → Auto-provisions → Admin immediately assigns → Operational
```

## Database Migration Status

**IMPORTANT**: Before this flow works, you must apply the migration:

```bash
# The migration file exists at:
supabase/migrations/20251108120000_add_junction_tables_and_codes.sql

# Apply it via Supabase Dashboard or CLI:
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy the migration file contents
# 3. Run the SQL
# OR
# Use Supabase CLI: supabase db push
```

## Testing the Flow

Run the test script to simulate a new device:

```bash
node test-new-device-provisioning.mjs
```

This will:
1. Generate a random MAC address
2. Simulate auto-provisioning
3. Update device status
4. Query pending devices
5. Show what appears in the UI

## Code References

### MQTT Handler Updates
- File: `supabase/functions/mqtt_device_handler/index.ts`
- Function: `autoProvisionDevice()` (lines 55-98)
- Function: `generateDeviceCode()` (lines 46-53)
- Updated: `handleStatusMessage()` (lines 100-145)

### Frontend Components
- `DeviceRegistrationModal.tsx` - Manual registration with device code
- `DeviceSetupWizard.tsx` - Assignment wizard
- `DeviceReassignModal.tsx` - Reassignment interface
- `DevicesPage.tsx` - Shows pending devices
- `DeviceCard.tsx` - Displays device code

### Backend Services
- `DeviceService.ts`:
  - `generateDeviceCode()` - Auto-generates codes
  - `validateDeviceCode()` - Checks uniqueness
  - `assignDeviceToSite()` - Creates junction records
  - `getDeviceAssignments()` - Retrieves history

## Security Considerations

1. **Auto-provisioning is enabled**: Any device connecting to MQTT will be registered
2. **Devices start inactive**: They need admin approval to become operational
3. **RLS policies protect data**: Only authorized users can see/modify devices
4. **Assignment tracking**: Complete audit trail of who assigned what when
5. **Multi-tenant ready**: Company isolation prepared for future implementation

## Future Enhancements

- [ ] Add device whitelisting (only allow known MAC ranges)
- [ ] Email notifications when new devices auto-provision
- [ ] Bulk device registration UI
- [ ] QR code scanning for device registration
- [ ] Device firmware update management
- [ ] Multi-site assignment UI
- [ ] Assignment history timeline component
- [ ] Site code generation automation
- [ ] Device health monitoring dashboard
