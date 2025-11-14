# Device Provisioning and Visibility

## Device Types

The system supports two types of devices:

### 1. Physical Devices (`device_type = 'physical'`)
Real IoT devices (ESP32-CAM, ESP32-S3, etc.) that connect via MQTT.

**Characteristics:**
- Connect via MQTT with status messages
- Can be provisioned, mapped, and assigned to sites
- Visible to users based on company access
- Manageable by company admins

**Example MQTT Message:**
```json
{
  "device_id": "esp32cam-01",
  "device_mac": "AC:67:B2:11:22:33",
  "status": "alive",
  "pending_count": 0,
  "firmware_version": "bt-aws-v4.0.0",
  "hardware_version": "ESP32-S3",
  "wifi_rssi": -58,
  "battery_voltage": 3.95
}
```

### 2. Virtual Devices (`device_type = 'virtual'`)
System placeholder devices used for internal operations.

**Characteristics:**
- Not physical hardware
- Used for system-generated submissions
- Hidden from regular users
- Cannot be edited or managed
- Example: `SYSTEM:AUTO:GENERATED` device

## Device Provisioning Flow

### Stage 1: Initial Connection
When a new device first connects via MQTT:
1. Device sends status message to `device/{device_id}/status`
2. MQTT handler creates device record with:
   - `provisioning_status = 'pending_mapping'`
   - `device_type = 'physical'`
   - `is_active = false`
   - `company_id = NULL` (not yet assigned)

### Stage 2: Unmapped Device Pool (Super Admin Only)
Device appears in the **unmapped devices section** on Devices page:
- Yellow alert banner at top of Devices page
- Shows: MAC address, reported site ID, reported location
- Super admins can click "Map" button to assign device
- Regular users cannot see unmapped devices

### Stage 3: Device Mapping
Super admin maps the device using Setup Wizard:
1. Select company (if not already assigned)
2. Select program
3. Select site
4. Set wake schedule
5. Optionally set device name and notes

After mapping:
- `provisioning_status` changes to `'active'`
- `is_active` becomes `true`
- `site_id` is set
- `program_id` is set
- `company_id` is set
- Device moves from unmapped section to main device list

### Stage 4: Active Device
Device is now fully operational:
- Visible to company users
- Appears in main device list
- Can capture images and create submissions
- Can be managed by company admins
- Included in automatic session creation

## Device Unassignment

If a device is unassigned from a site:
1. Admin clicks "Unassign" on device detail page
2. `site_id` becomes `NULL`
3. `provisioning_status` changes to `'pending_mapping'`
4. Device returns to unmapped devices section
5. Only super admins can see and reassign it

## Visibility Rules

### Physical Devices
**Super Admins:**
- Can see ALL physical devices
- Can see unmapped devices
- Can manage any device

**Company Admins:**
- Can see devices where `company_id` matches their company
- Cannot see unmapped devices
- Can manage their company's devices

**Regular Users:**
- Can see devices where `company_id` matches their company
- Cannot see unmapped devices
- Cannot manage devices (read-only)

### Virtual Devices
**All Users:**
- Virtual devices are hidden from device lists
- Only visible in backend operations
- Cannot be edited or managed

## Frontend Implementation

### Device Queries
All device queries filter out virtual devices:
```typescript
.or('device_type.is.null,device_type.neq.virtual')
```

This ensures:
- Physical devices (including those with `NULL` device_type) are shown
- Virtual devices are excluded

### Unmapped Device Display
DevicesPage shows unmapped devices in a yellow alert banner:
- Only visible to super admins
- Shows count of pending devices
- Displays device cards with "Map" button
- Filtered out of main device list

## Database Columns

### Critical Columns for Device Flow
- `device_type`: `'physical'` or `'virtual'`
- `provisioning_status`: `'pending_mapping'`, `'active'`, `'inactive'`, `'decommissioned'`, `'system'`
- `site_id`: `NULL` = unmapped, UUID = mapped to site
- `program_id`: Program assignment
- `company_id`: `NULL` = device pool, UUID = assigned to company
- `is_active`: `false` = not operational, `true` = operational

## Automatic Session Creation

The `auto_create_daily_sessions()` function:
- Runs daily at 12:05 AM UTC
- Creates sessions ONLY for sites with active mapped devices
- Checks:
  ```sql
  WHERE d.site_id = v_site.site_id
    AND d.provisioning_status = 'active'
    AND d.is_active = true
  ```
- Skips sites without active devices

## Summary

✅ **Physical devices** go through complete provisioning flow
✅ **Unmapped devices** only visible to super admins
✅ **Virtual devices** hidden from all users
✅ **Sessions** only created for sites with active devices
✅ **RLS policies** enforce company isolation
✅ **Device pool** managed by super admins only
