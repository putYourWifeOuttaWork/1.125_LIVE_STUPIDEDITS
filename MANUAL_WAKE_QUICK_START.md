# Manual Wake Feature - Quick Start Guide

## What is Manual Wake?

Manual Wake allows you to schedule a one-time device wake event without disrupting the device's regular schedule. After the manual wake completes, the device automatically resumes its normal wake schedule.

## When to Use Manual Wake

- **Testing**: Trigger a test wake to verify device connectivity
- **Urgent Data Collection**: Get immediate sensor readings or images
- **Troubleshooting**: Check device status without waiting for scheduled wake
- **Demonstrations**: Show device functionality during presentations

## How to Use

### Step 1: Open Device Detail Page
Navigate to Devices > [Select Device] > Device Detail Page

### Step 2: Click "Manual Wake" Button
Look for the lightning bolt icon or "Manual Wake" button

### Step 3: Choose Wake Time
You have several options:

**Quick Actions:**
- Wake in 1 minute
- Wake in 5 minutes
- Wake in 10 minutes
- Wake in 30 minutes

**Custom Time:**
- Enter any number of minutes (1-1440)
- See preview of exact wake time

### Step 4: Confirm
Click "Schedule Wake" button

## What Happens Next

### Immediate (0-5 seconds)
1. Device record updated with manual wake time
2. MQTT command queued for delivery
3. Success toast displayed

### Short Term (5-30 seconds)
1. MQTT service picks up command
2. Command sent to device via MQTT
3. Device receives wake schedule update

### At Wake Time
1. Device wakes at scheduled time
2. Sends HELLO message with sensor data
3. Manual wake flag automatically cleared
4. Next wake calculated from regular schedule

## User Interface

### Manual Wake Modal

```
┌──────────────────────────────────────────┐
│  Schedule Manual Wake               [X]  │
├──────────────────────────────────────────┤
│                                          │
│  ⚡ One-Time Wake Override               │
│  This will trigger a single wake at     │
│  your chosen time. Device will resume   │
│  regular schedule after.                │
│                                          │
│  Current Next Wake                       │
│  ┌────────────────────────────────────┐ │
│  │ Jan 4, 2026, 6:00:00 AM          │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Quick Actions                           │
│  ┌─────────────┐  ┌─────────────┐      │
│  │ 🕐 Wake 1m  │  │ 🕐 Wake 5m  │      │
│  └─────────────┘  └─────────────┘      │
│  ┌─────────────┐  ┌─────────────┐      │
│  │ 🕐 Wake 10m │  │ 🕐 Wake 30m │      │
│  └─────────────┘  └─────────────┘      │
│                                          │
│  Custom Wake Time                        │
│  ┌─────────────────────┐                │
│  │ 1           minutes │ [Schedule Wake]│
│  └─────────────────────┘                │
│  Wake at: Jan 3, 2026, 2:46:00 PM      │
│                                          │
│  ⚠️ Note: Device must be online         │
│                                          │
│              [Cancel]                    │
└──────────────────────────────────────────┘
```

## Technical Details

### Database Changes
The system tracks manual wakes in the `devices` table:
- `manual_wake_override`: Boolean flag (true during manual wake)
- `manual_wake_requested_by`: User ID who requested
- `manual_wake_requested_at`: Timestamp of request

### Command Queue
All manual wake requests create a `device_commands` record:
- **Type**: `set_wake_schedule`
- **Status**: `pending` → `sent` → `acknowledged`
- **Payload**: Contains next wake time and manual flag

### Automatic Cleanup
When device wakes:
1. Edge function detects `manual_wake_override = true`
2. Clears all manual wake flags
3. Calculates next wake from regular cron schedule
4. Device continues normal operation

## Testing

### Test the Feature
```bash
# Run the test script
node test-manual-wake-flow.mjs
```

This script:
1. Finds a test device
2. Schedules manual wake
3. Queues MQTT command
4. Verifies command delivery
5. Simulates wake and cleanup

### Expected Behavior
- Device wakes at specified time
- Regular schedule resumes after wake
- No manual intervention needed
- Audit trail preserved

## Monitoring

### Check Command Status
```sql
-- View recent manual wake commands
SELECT
  dc.command_id,
  dc.status,
  dc.issued_at,
  dc.delivered_at,
  d.device_name,
  u.email as requested_by
FROM device_commands dc
JOIN devices d ON dc.device_id = d.device_id
LEFT JOIN auth.users u ON dc.created_by_user_id = u.id
WHERE dc.command_type = 'set_wake_schedule'
  AND dc.command_payload->>'manual_wake' = 'true'
ORDER BY dc.issued_at DESC
LIMIT 10;
```

### Check Active Overrides
```sql
-- Find devices with active manual wake overrides
SELECT
  device_name,
  device_mac,
  next_wake_at,
  manual_wake_requested_at,
  (next_wake_at - NOW()) as time_until_wake
FROM devices
WHERE manual_wake_override = true
ORDER BY next_wake_at;
```

## Troubleshooting

### Command Not Delivered
**Symptoms**: Command stays in 'pending' status

**Causes**:
- MQTT service not running
- Device offline
- Network issues

**Solutions**:
1. Check MQTT service: `pm2 status mqtt-service`
2. Verify device connectivity
3. Command will retry automatically

### Device Didn't Wake
**Symptoms**: Device didn't wake at scheduled time

**Causes**:
- Device in deep sleep
- WiFi connection lost
- Battery depleted

**Solutions**:
1. Wait for next scheduled wake
2. Check device battery level
3. Verify WiFi connectivity
4. Check device logs

### Override Not Cleared
**Symptoms**: `manual_wake_override` still true after wake

**Causes**:
- Edge function not processing HELLO
- Device sent HELLO to wrong topic
- Database update failed

**Solutions**:
1. Check edge function logs
2. Verify MQTT topic structure
3. Manually clear flag if needed:
   ```sql
   UPDATE devices
   SET manual_wake_override = false,
       manual_wake_requested_by = null,
       manual_wake_requested_at = null
   WHERE device_id = 'YOUR_DEVICE_ID';
   ```

## Best Practices

1. **Use Sparingly**: Manual wakes consume battery - use only when needed
2. **Check Device Status**: Ensure device is online before scheduling
3. **Reasonable Timeframes**: Allow at least 1 minute for delivery
4. **Monitor Results**: Check if device actually woke
5. **Document Testing**: Keep record of manual wake tests

## FAQ

**Q: Will manual wake disrupt my regular schedule?**
A: No. The device automatically resumes its regular schedule after the manual wake.

**Q: Can I cancel a manual wake?**
A: Yes, just schedule a new manual wake or wait for the current one to complete.

**Q: How long does it take for the command to reach the device?**
A: Typically 5-30 seconds, depending on network conditions.

**Q: What if the device is offline?**
A: The command will be delivered when the device comes back online (within 24 hours).

**Q: Can I schedule multiple manual wakes?**
A: Yes, but each new manual wake replaces the previous one.

**Q: Does this work with all device types?**
A: Yes, it works with all physical ESP32-CAM devices.

## Support

For issues or questions:
1. Check device detail page for status
2. Review command queue in database
3. Check MQTT service logs
4. Contact system administrator

## Related Documentation

- [MANUAL_WAKE_SYSTEM_COMPLETE.md](./MANUAL_WAKE_SYSTEM_COMPLETE.md) - Complete technical documentation
- [MQTT_PROTOCOL_COMPLETE_FIX.md](./MQTT_PROTOCOL_COMPLETE_FIX.md) - MQTT protocol details
- [DEVICE_COMMANDS_GUIDE.md](./DEVICE_COMMANDS_GUIDE.md) - Command system overview
