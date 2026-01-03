# Manual Wake Override Feature

**Date:** January 3, 2026
**Status:** ✅ Complete and Ready for Testing

## Overview

The Manual Wake Override feature allows administrators to schedule one-time test wakes for devices without disrupting their regular wake schedules. Perfect for testing and debugging!

## Problem Statement

During development and testing, you need to:
- Trigger immediate device wakes for testing (e.g., "wake in 1 minute")
- Verify device connectivity and image capture
- Test protocol flows without waiting for scheduled wakes
- Resume normal schedule after test completes

**Challenge:** Setting `next_wake_at` to a test time would disrupt the schedule calculation, causing the device to skip its next scheduled wake.

## Solution

A **one-time override system** that:
1. Allows setting a custom `next_wake_at` time
2. Marks it as a manual override with a flag
3. Device wakes at the custom time
4. Handler clears the flag automatically
5. Next wake is calculated from the regular schedule (not the manual wake time)
6. Normal schedule resumes seamlessly

## Database Changes

**Migration:** `20260103230000_add_manual_wake_override.sql`

### New Columns in `devices` Table

```sql
manual_wake_override BOOLEAN DEFAULT FALSE
  -- True when next_wake_at is a one-time manual override

manual_wake_requested_by UUID REFERENCES auth.users(id)
  -- User who requested the manual wake

manual_wake_requested_at TIMESTAMPTZ
  -- When the override was requested
```

### Index for Performance

```sql
CREATE INDEX idx_devices_manual_wake_override
  ON devices(manual_wake_override, next_wake_at)
  WHERE manual_wake_override = true;
```

## Backend Implementation

### MQTT Handler Changes (`ingest.ts`)

**Detection and Clearing:**
```typescript
// Check if this was a manual wake override
const wasManualWake = existingDevice.manual_wake_override === true;
if (wasManualWake) {
  console.log('[Ingest] Manual wake override detected - clearing flag and resuming schedule');
  updateData.manual_wake_override = false;
  updateData.manual_wake_requested_by = null;
  updateData.manual_wake_requested_at = null;
}

// Calculate next wake from schedule (not manual time)
// Device automatically resumes regular schedule
```

**Key Behavior:**
- Handler detects `manual_wake_override = true`
- Clears all manual wake fields automatically
- Calculates next wake from the regular schedule
- Device never knows it was a test wake

## UI Implementation

### ManualWakeModal Component

**Location:** `src/components/devices/ManualWakeModal.tsx`

**Features:**
- Quick action buttons (1min, 5min, 10min, 30min)
- Custom time input (any number of minutes)
- Real-time preview of wake time
- Info banner explaining one-time behavior
- Current schedule display

**Quick Actions:**
```typescript
<Button onClick={() => handleQuickWake(1)}>
  Wake in 1 min
</Button>
<Button onClick={() => handleQuickWake(5)}>
  Wake in 5 min
</Button>
```

**Custom Time:**
```typescript
<input
  type="number"
  min="1"
  max="1440"
  value={customMinutes}
  onChange={(e) => setCustomMinutes(parseInt(e.target.value))}
/>
<Button onClick={handleCustomWake}>
  Schedule Wake
</Button>
```

### DeviceDetailPage Integration

**Manual Wake Button:**
- Added next to "Next Wake" label
- Only visible to admins
- Opens ManualWakeModal on click
- Zap icon indicates "quick action"

**Manual Wake Indicator:**
- Shows "Manual wake scheduled" when override is active
- Orange badge with Zap icon
- Visible until device wakes

**UI Flow:**
```
User clicks "Manual Wake" button
  ↓
Modal opens with quick actions
  ↓
User selects "Wake in 1 min"
  ↓
Sets next_wake_at = now + 1 minute
Sets manual_wake_override = true
  ↓
UI shows "Manual wake scheduled"
  ↓
Device wakes at custom time
  ↓
Handler clears override flag
Calculates next wake from schedule
  ↓
UI updates to normal schedule
```

## Usage Examples

### Example 1: Quick Test (1 Minute)

**Scenario:** You want to test if a device is online and can capture images.

1. Navigate to device detail page
2. Click "Manual Wake" button
3. Click "Wake in 1 min"
4. Wait 1 minute
5. Device wakes, captures image, sends SLEEP
6. Next wake resumes normal schedule

**Database State:**
```sql
-- Before manual wake
SELECT next_wake_at, manual_wake_override
FROM devices WHERE device_id = '...';
-- next_wake_at: 2026-01-04 08:00:00
-- manual_wake_override: false

-- After clicking "Wake in 1 min"
-- next_wake_at: 2026-01-03 19:01:00 (1 minute from now)
-- manual_wake_override: true

-- After device wakes
-- next_wake_at: 2026-01-04 08:00:00 (back to schedule)
-- manual_wake_override: false
```

### Example 2: Custom Time (15 Minutes)

**Scenario:** You need to prepare test equipment and want device to wake in 15 minutes.

1. Click "Manual Wake"
2. Enter "15" in custom minutes field
3. Preview shows: "Wake will occur at: 1/3/2026, 7:15:00 PM"
4. Click "Schedule Wake"
5. Device wakes in 15 minutes
6. Normal schedule resumes after

### Example 3: Multiple Test Wakes

**Scenario:** You need to run 3 test captures in a row.

```
Test 1:
- Manual wake in 1 min
- Device wakes, captures, sleeps
- Next: 8:00 AM (schedule)

Test 2 (2 minutes later):
- Manual wake in 1 min
- Device wakes, captures, sleeps
- Next: 8:00 AM (schedule unchanged)

Test 3 (2 minutes later):
- Manual wake in 1 min
- Device wakes, captures, sleeps
- Next: 8:00 AM (schedule still intact)

Final result: Device had 3 test wakes, schedule unaffected
```

## Type System Updates

### Device Type (`src/lib/types.ts`)

```typescript
export type Device = {
  // ... existing fields
  manual_wake_override: boolean;
  manual_wake_requested_by: string | null;
  manual_wake_requested_at: string | null;
  // ... rest of fields
};
```

## Monitoring & Debugging

### Check Manual Wake Status

```sql
SELECT
  device_name,
  next_wake_at,
  manual_wake_override,
  manual_wake_requested_by,
  manual_wake_requested_at
FROM devices
WHERE manual_wake_override = true;
```

### Find Recent Manual Wakes

```sql
-- Devices that recently had manual wakes (cleared in last hour)
SELECT
  d.device_name,
  d.last_wake_at,
  d.next_wake_at,
  h.event_timestamp,
  h.description
FROM devices d
JOIN device_history h ON h.device_id = d.device_id
WHERE h.description LIKE '%Manual wake override detected%'
  AND h.event_timestamp > NOW() - INTERVAL '1 hour'
ORDER BY h.event_timestamp DESC;
```

### Verify Schedule Resumed Correctly

```sql
-- After a manual wake, next_wake_at should match the schedule
SELECT
  d.device_name,
  d.wake_schedule_cron,
  d.last_wake_at,
  d.next_wake_at,
  -- Calculate what next wake SHOULD be based on schedule
  -- (requires fn_calculate_next_wake_time function)
FROM devices d
WHERE d.last_wake_at > NOW() - INTERVAL '1 hour'
  AND d.wake_schedule_cron IS NOT NULL;
```

## Edge Cases Handled

### 1. Manual Wake While Device is Offline
**Behavior:** next_wake_at is set, but device won't wake until it comes online. When it does wake, the manual flag is cleared and schedule resumes.

### 2. Multiple Manual Wakes Before First Completes
**Behavior:** Each override overwrites the previous. Only the most recent next_wake_at is used. Flag is cleared on next wake regardless.

### 3. Manual Wake with No Schedule
**Behavior:** Device wakes at manual time. Since there's no schedule, next_wake_at is calculated using site schedule (inheritance) or defaults to NULL.

### 4. Admin Sets Manual Wake, Then Device is Unmapped
**Behavior:** Device still wakes at manual time, gets `sleep_only` protocol state, sleeps properly.

## Testing Checklist

- [ ] **Quick Wake (1 min)**
  - Click "Wake in 1 min"
  - Verify next_wake_at updates
  - Verify manual_wake_override = true
  - Wait for device to wake
  - Verify flag cleared
  - Verify schedule resumed

- [ ] **Custom Wake (Custom time)**
  - Enter custom minutes
  - Verify preview updates correctly
  - Schedule wake
  - Verify UI shows "Manual wake scheduled"
  - Verify wake occurs at correct time

- [ ] **Multiple Manual Wakes**
  - Schedule manual wake
  - Wait for completion
  - Schedule another immediately
  - Verify both complete successfully
  - Verify schedule intact

- [ ] **Manual Wake + Image Capture**
  - Schedule manual wake
  - Wait for device wake
  - Verify image captured successfully
  - Verify observation created
  - Verify device returns to sleep

- [ ] **Schedule Inheritance**
  - Device with no schedule
  - Site has schedule
  - Manual wake
  - Verify next wake uses site schedule

## Files Modified/Created

### Database
- `supabase/migrations/20260103230000_add_manual_wake_override.sql` (NEW)

### Backend
- `supabase/functions/mqtt_device_handler/ingest.ts` (MODIFIED)
  - Added manual wake detection and clearing
  - Preserved schedule calculation logic

### Frontend
- `src/components/devices/ManualWakeModal.tsx` (NEW)
  - Full-featured modal for scheduling manual wakes
  - Quick actions + custom time input
  - Real-time previews and validation

- `src/pages/DeviceDetailPage.tsx` (MODIFIED)
  - Added "Manual Wake" button
  - Added manual wake indicator
  - Integrated ManualWakeModal

- `src/lib/types.ts` (MODIFIED)
  - Added manual_wake_override fields to Device type

## Benefits

1. **Easy Testing:** Wake device in 1 minute for quick tests
2. **Schedule Preservation:** Regular schedule never disrupted
3. **Audit Trail:** Track who requested manual wakes
4. **Automatic Cleanup:** No manual intervention needed
5. **Clear UI:** Always know when manual wake is pending
6. **Flexible:** Any time from 1 minute to 24 hours
7. **Safe:** Admin-only feature, can't break schedules

## Future Enhancements

1. **Batch Manual Wakes:**
   - Select multiple devices
   - Schedule all to wake at same time
   - Useful for site-wide testing

2. **Recurring Test Wakes:**
   - Schedule test wake every N minutes for M iterations
   - Automatically clear after test series completes
   - Useful for prolonged testing

3. **Manual Wake History:**
   - View all manual wakes for a device
   - See who requested them and when
   - Analyze test patterns

4. **Conditional Manual Wakes:**
   - Only wake if battery > X%
   - Only wake if last image failed
   - Smart test scheduling

## Conclusion

The Manual Wake Override feature provides a powerful testing tool that's safe, intuitive, and non-disruptive. Administrators can easily trigger test wakes without worrying about breaking device schedules.

---

**Implementation Complete:** January 3, 2026
**Build Status:** ✅ Passing
**Ready for Testing:** Yes

## Quick Start

1. Go to any device detail page
2. Look for "Manual Wake" button next to "Next Wake"
3. Click it and choose "Wake in 1 min"
4. Watch the device wake and capture an image
5. Verify it returns to normal schedule after

That's it! Perfect for testing your new wake session state machine.
