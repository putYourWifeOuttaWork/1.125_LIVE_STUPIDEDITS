# Quick Start: Device Provisioning & MQTT Commands

## TL;DR - What Was Built

Complete device provisioning automation with MQTT command queue:
- ✅ Devices auto-provision on first connection
- ✅ Super admins map devices to sites via UI
- ✅ Database automatically populates all fields (site, program, company, wake schedule)
- ✅ Welcome command sent automatically to newly-mapped devices
- ✅ Full command queue for ongoing device management
- ✅ 100% MQTT protocol compliant per BrainlyTree PDF

## 3-Step Deployment

### Step 1: Apply Database Migration (5 minutes)
```bash
# Open Supabase Dashboard → SQL Editor
# Copy/paste contents of this file:
supabase/migrations/20251115000000_device_provisioning_automation.sql
# Click Run

# Verify:
SELECT fn_calculate_next_wake('0 8,16 * * *', now());
# Should return next 8am or 4pm timestamp
```

### Step 2: Restart MQTT Service (1 minute)
```bash
cd mqtt-service
pkill -f "node index.js"  # Stop existing
npm start                  # Start with new code

# Verify:
curl http://localhost:3000/health
# Should show: "commandQueue": {"running": true}
```

### Step 3: Test (Optional, 2 minutes)
```bash
# Fix any existing devices:
node backfill-device-lineage.mjs

# Or test manually:
# 1. Create virtual device in UI
# 2. Map to a site
# 3. Check logs for welcome command
# 4. Verify device is active
```

## What Each Component Does

### Database Functions (Auto-Runs on Device Mapping)
```
Super Admin Maps Device
       ↓
Database Trigger Fires
       ↓
fn_initialize_device_after_mapping()
  - Looks up site → program → company
  - Populates device.site_id
  - Populates device.program_id
  - Populates device.company_id
  - Calculates device.next_wake_at
  - Sets device.provisioning_status = 'active'
  - Sets device.is_active = true
       ↓
Device Ready for Operations
```

### Command Queue (Auto-Runs Every 5 Seconds)
```
Command Inserted to device_commands
       ↓
CommandQueueProcessor Polls Table
       ↓
Publishes to MQTT: device/{MAC}/cmd
       ↓
Device Receives and Executes
       ↓
Device Sends ACK: device/{MAC}/ack
       ↓
Status Updated: 'acknowledged'
```

### Welcome Command (Auto-Runs on Activation)
```
Device Status Changes to 'active'
       ↓
Realtime Listener Detects Change
       ↓
Fetches Site Wake Schedule
       ↓
Calculates Next Wake Time
       ↓
Queues Welcome Command
       ↓
CommandQueueProcessor Sends It
       ↓
Device Updates Internal Schedule
```

## Testing the System

### Test 1: Auto-Provisioning (New Device)
```sql
-- Simulate new device connecting via MQTT
-- (In production, this happens automatically when device sends status message)

-- 1. Check device was auto-provisioned
SELECT device_code, provisioning_status, is_active
FROM devices
WHERE device_mac = 'YOUR_DEVICE_MAC'
ORDER BY provisioned_at DESC
LIMIT 1;

-- Expected:
-- provisioning_status: 'pending_mapping'
-- is_active: false
```

### Test 2: Device Mapping (Admin Action)
```sql
-- 1. Map device to site (via UI or SQL)
INSERT INTO device_site_assignments (device_id, site_id, program_id, is_active)
VALUES (
  'your-device-id',
  'your-site-id',
  'your-program-id',
  true
);

-- 2. Check device was initialized (should happen instantly)
SELECT
  device_code,
  provisioning_status,  -- Should be 'active'
  site_id,              -- Should be populated
  program_id,           -- Should be populated
  company_id,           -- Should be populated
  next_wake_at,         -- Should have timestamp
  is_active             -- Should be true
FROM devices
WHERE device_id = 'your-device-id';
```

### Test 3: Welcome Command (Automatic)
```sql
-- Check welcome command was queued
SELECT
  command_type,         -- Should be 'set_wake_schedule'
  status,              -- Should be 'sent' or 'acknowledged'
  command_payload,     -- Should have next_wake_time
  issued_at,
  delivered_at
FROM device_commands
WHERE device_id = 'your-device-id'
ORDER BY issued_at DESC
LIMIT 1;
```

### Test 4: Manual Command
```sql
-- Queue a capture command
INSERT INTO device_commands (device_id, command_type, command_payload, status)
VALUES (
  'your-device-id',
  'capture_image',
  '{"capture_image": true}'::jsonb,
  'pending'
);

-- Wait 5 seconds, then check status
SELECT command_type, status, delivered_at
FROM device_commands
ORDER BY issued_at DESC
LIMIT 1;

-- Expected: status = 'sent', delivered_at populated
```

## Quick Diagnostics

### Check Service Health
```bash
curl http://localhost:3000/health | jq
```

### Check Pending Commands
```sql
SELECT COUNT(*) FROM device_commands WHERE status = 'pending';
```

### Check Active Devices
```sql
SELECT COUNT(*) FROM devices WHERE is_active = true;
```

### Check Recent Commands
```sql
SELECT
  d.device_name,
  c.command_type,
  c.status,
  c.issued_at
FROM device_commands c
JOIN devices d ON d.device_id = c.device_id
WHERE c.issued_at > now() - interval '1 hour'
ORDER BY c.issued_at DESC;
```

### Check Failed Commands
```sql
SELECT
  d.device_name,
  c.command_type,
  c.retry_count,
  c.issued_at
FROM device_commands c
JOIN devices d ON d.device_id = c.device_id
WHERE c.status = 'failed'
ORDER BY c.issued_at DESC;
```

## Common Issues

### Issue: "Function does not exist"
**Solution:** Migration not applied. Run migration SQL in Supabase Dashboard.

### Issue: "CommandQueue not running"
**Solution:** Restart mqtt-service: `cd mqtt-service && npm start`

### Issue: Welcome command not sent
**Solution:** Check Realtime listener in logs. Device must change to 'active' status.

### Issue: Commands stuck in 'pending'
**Solution:** Check mqtt-service is running and connected to MQTT broker.

### Issue: Commands stuck in 'sent'
**Solution:** Device may be offline or not sending ACK. Check device connectivity.

## Files to Reference

### Must Read
- `DEVICE_PROVISIONING_COMPLETE_SUMMARY.md` - Full implementation details
- `APPLY_PROVISIONING_MIGRATION.md` - Detailed migration guide

### Reference
- `mqtt-service/COMMAND_QUEUE_IMPLEMENTATION.md` - Command queue details
- `MQTT_COMMAND_QUEUE_COMPLETE.md` - System overview

### Code
- `supabase/migrations/20251115000000_device_provisioning_automation.sql` - Database functions
- `mqtt-service/commandQueueProcessor.js` - Command queue logic
- `mqtt-service/index.js` - Service integration
- `backfill-device-lineage.mjs` - Backfill script

## Command Types Reference

### capture_image
```javascript
{
  device_id: "AA:BB:CC:DD:EE:FF",
  capture_image: true
}
```

### set_wake_schedule
```javascript
{
  device_id: "AA:BB:CC:DD:EE:FF",
  next_wake: "2025-11-15T16:00:00Z"
}
```

### send_image
```javascript
{
  device_id: "AA:BB:CC:DD:EE:FF",
  send_image: "image_name_123"
}
```

### update_config
```javascript
{
  device_id: "AA:BB:CC:DD:EE:FF",
  config_param: "value"
}
```

### reboot
```javascript
{
  device_id: "AA:BB:CC:DD:EE:FF",
  reboot: true
}
```

### update_firmware
```javascript
{
  device_id: "AA:BB:CC:DD:EE:FF",
  firmware_url: "https://..."
}
```

## MQTT Topics

**Service Subscribes To:**
- `device/+/status` - Device heartbeats
- `device/+/ack` - Command acknowledgments
- `ESP32CAM/+/data` - Image data

**Service Publishes To:**
- `device/{MAC}/cmd` - Commands to devices
- `device/{MAC}/ack` - ACK and missing chunk requests

## Need Help?

1. Check logs: `tail -f /var/log/mqtt-service.log` or `pm2 logs mqtt-service`
2. Check health: `curl http://localhost:3000/health`
3. Review full docs in `DEVICE_PROVISIONING_COMPLETE_SUMMARY.md`
4. Check database functions exist: `SELECT proname FROM pg_proc WHERE proname LIKE 'fn_%'`
5. Verify MQTT connection: Check "mqtt.connected" in health endpoint

## Success Indicators

✅ Migration applied: `SELECT fn_calculate_next_wake('0 8 * * *', now())` returns timestamp
✅ Service running: `curl localhost:3000/health` returns `"status": "healthy"`
✅ Queue active: Health shows `"commandQueue": {"running": true}`
✅ Devices mapping: Device status changes from 'pending_mapping' to 'active' when mapped
✅ Commands flowing: Check `device_commands` table for commands with status 'sent' or 'acknowledged'

**Status:** Ready to deploy! Apply migration and restart service to activate.
