# Device Edit Modal Fixes

## Issues Fixed

### 1. ✅ Edit Modal Now Queues MQTT Commands for Schedule Changes

**Problem:**
- When clicking "Edit" button and changing the wake schedule, it would just load forever
- Changes were not being saved to the database
- No MQTT command was sent to the device
- No calculation of next wake time

**Solution:**
Modified `useDevice.ts` hook's `updateDeviceMutation` to:
1. Detect when `wake_schedule_cron` is being changed
2. Use `DeviceService.updateDeviceSettings()` to queue MQTT command
3. Update database AND queue command in `device_commands` table
4. Provide clear user feedback about command queuing

**Files Changed:**
- `src/hooks/useDevice.ts` - Enhanced `updateDeviceMutation`
- `src/components/devices/DeviceEditModal.tsx` - Added next wake display

---

## How It Works Now

### Device Edit Modal Flow

```
User Changes Schedule in Edit Modal
        ↓
Click "Save Changes"
        ↓
useDevice.updateDeviceMutation called
        ↓
Check: Is wake_schedule_cron changing?
        ↓
YES → Use DeviceService.updateDeviceSettings()
        ├─ Update devices table
        └─ Insert into device_commands (status='pending')
        ↓
Toast: "Device updated successfully. Schedule change will apply at next wake."
        ↓
Modal closes, device list refreshes
        ↓
Device wakes up → MQTT service sends command
        ↓
Device updates its schedule
```

### Code Changes

**Before (useDevice.ts):**
```typescript
const updateDeviceMutation = useMutation({
  mutationFn: async (updates) => {
    // Just update database directly
    const { data, error } = await supabase
      .from('devices')
      .update(updates)
      .eq('device_id', deviceId);

    return data;
  }
});
```

**After (useDevice.ts):**
```typescript
const updateDeviceMutation = useMutation({
  mutationFn: async (updates) => {
    // Check if schedule is changing
    const isScheduleChange =
      updates.wake_schedule_cron !== device?.wake_schedule_cron;

    if (isScheduleChange) {
      // Use DeviceService to queue MQTT command
      const result = await DeviceService.updateDeviceSettings({
        deviceId,
        deviceName: updates.device_name,
        wakeScheduleCron: updates.wake_schedule_cron,
        notes: updates.notes,
      });
    } else {
      // No schedule change, just update database
      await supabase.from('devices').update(updates);
    }

    // Fetch and return updated device
    return updatedDevice;
  }
});
```

---

## New Features in Edit Modal

### 1. Next Wake Time Calculation

Shows calculated next wake time based on the cron expression:

```
┌─────────────────────────────────────┐
│ Next Wake Time                      │
│ 11/15/2025, 8:00:00 AM             │
│ 245 minutes from now                │
└─────────────────────────────────────┘
```

**Implementation:**
```typescript
const nextWakeTime = useMemo(() => {
  if (!formData.wake_schedule_cron) return null;
  return DeviceService.calculateNextWake(formData.wake_schedule_cron);
}, [formData.wake_schedule_cron]);
```

### 2. Schedule Change Warning

When schedule is different from current, shows warning:

```
⚠️ Schedule Change Detected
   A command will be sent to the device at its next wake
   to update the schedule. The new schedule will take
   effect on the wake cycle after that.
```

**Implementation:**
```typescript
const isScheduleChanged =
  formData.wake_schedule_cron !== device.wake_schedule_cron;

{isScheduleChanged && (
  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
    <Info size={16} />
    <p>Schedule Change Detected</p>
    <p>Command will be sent at next wake...</p>
  </div>
)}
```

---

## User Experience

### Before Fix
❌ Click Edit → Change schedule → Click Save → Loading forever → Nothing happens
❌ No feedback about what's happening
❌ No command sent to device
❌ Schedule doesn't update

### After Fix
✅ Click Edit → Change schedule → See next wake time calculation
✅ See warning that command will be queued
✅ Click Save → Immediate feedback: "Device updated successfully. Schedule change will apply at next wake."
✅ Database updated
✅ Command queued in `device_commands` table
✅ MQTT service sends command at next device wake
✅ Device receives and applies new schedule

---

## Database Flow

### What Happens in Database

1. **Update devices table:**
```sql
UPDATE devices
SET wake_schedule_cron = '0 8,16 * * *',
    device_name = 'Updated Name',
    notes = 'Updated notes',
    updated_at = NOW()
WHERE device_id = '{device_id}';
```

2. **Insert command:**
```sql
INSERT INTO device_commands (
  device_id,
  command_type,
  command_payload,
  status,
  created_by_user_id,
  notes
) VALUES (
  '{device_id}',
  'set_wake_schedule',
  '{"wake_schedule_cron": "0 8,16 * * *"}',
  'pending',
  '{user_id}',
  'Wake schedule updated via UI'
);
```

3. **At device wake:**
```sql
-- MQTT service queries pending commands
SELECT * FROM device_commands
WHERE device_id = '{device_id}'
AND status = 'pending';

-- Sends command via MQTT
-- Then updates status
UPDATE device_commands
SET status = 'sent',
    delivered_at = NOW()
WHERE command_id = '{command_id}';
```

---

## Testing

### Test Schedule Change via Edit Modal

1. **Go to device detail page**
2. **Click "Edit" button**
3. **Change wake schedule** (use preset or custom)
4. **Observe:**
   - Next wake time updates in real-time
   - Yellow warning appears about command queuing
5. **Click "Save Changes"**
6. **Verify:**
   - Toast shows: "Device updated successfully. Schedule change will apply at next wake."
   - Modal closes
   - Device list refreshes

7. **Check database:**
```sql
-- Verify device updated
SELECT device_name, wake_schedule_cron, updated_at
FROM devices
WHERE device_id = '{device_id}';

-- Verify command queued
SELECT command_type, command_payload, status, issued_at
FROM device_commands
WHERE device_id = '{device_id}'
AND command_type = 'set_wake_schedule'
ORDER BY issued_at DESC LIMIT 1;
```

8. **Wait for device wake**
9. **Check MQTT logs:**
```
[STATUS] Device test5 is alive
[CMD] Found 1 pending commands for test5
[CMD] Sent set_wake_schedule to test5 on device/test5/cmd
```

10. **Verify command status changed:**
```sql
SELECT status, delivered_at
FROM device_commands
WHERE command_id = '{command_id}';
-- Status should be 'sent' with delivered_at timestamp
```

---

## Integration with Settings Modal

Both modals now work correctly:

### Edit Modal
- Quick edits to device info
- Simple schedule changes with presets
- Shows next wake time
- Queues MQTT commands for schedule changes

### Settings Modal
- More comprehensive settings interface
- Better visual design with icons
- Same MQTT command queuing logic
- Recommended schedule options with descriptions

**Both use the same underlying service:**
- `DeviceService.updateDeviceSettings()`
- Same command queuing mechanism
- Same MQTT delivery system

---

## Error Handling

### Validation
```typescript
// Cron expression validation
if (!validateCronExpression(formData.wake_schedule_cron)) {
  errors.wake_schedule_cron = 'Invalid cron expression...';
  return;
}
```

### Error States
- **Database error:** Toast with error message
- **Command queue error:** "Settings updated but command failed: {error}"
- **Invalid cron:** Form validation error displayed inline

### User Feedback
- ✅ Success: "Device updated successfully. Schedule change will apply at next wake."
- ❌ Error: "Failed to update device: {specific error message}"
- ⏳ Loading: Button shows spinner during save

---

## Summary

✅ Edit modal now properly saves schedule changes
✅ MQTT commands are queued for schedule updates
✅ Next wake time is calculated and displayed
✅ Clear warning shown when schedule changes
✅ User feedback is immediate and clear
✅ Database and command queue both updated correctly
✅ MQTT service sends commands at device wake
✅ Full end-to-end flow working

The edit modal now has full feature parity with the settings modal for schedule changes!
