# Wake Times Feature - Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Apply Database Migration (Required)

1. Open the file `APPLY_WAKE_TIMES_MIGRATION.sql` in this directory
2. Copy the entire SQL content
3. Go to your Supabase Dashboard → SQL Editor
4. Paste and execute the SQL
5. Verify success: You should see "Success. No rows returned"

**Verification:**
```sql
-- Run this to verify the function was created
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'get_next_wake_times';
```

### Step 2: Test the Feature

1. Deploy your frontend build or run dev server
2. Navigate to **Devices** page
3. Click on any device that has a wake schedule configured
4. Click **Edit Device**
5. Scroll to the **Wake Schedule** section
6. You should now see **Next Wake Times** displayed with:
   - Next 3 wake times
   - Local timezone format
   - UTC format
   - A refresh button

### Step 3: Test Various Scenarios

#### Scenario 1: Device with Wake Schedule
1. Edit a device with wake_schedule_config configured
2. Verify 3 wake times appear
3. Click the refresh button - spinner should appear
4. Wake times should update

#### Scenario 2: Change Wake Schedule
1. Select a different cron preset (e.g., "Every 6 hours")
2. Wake times should automatically recalculate
3. Verify the new schedule shows correct intervals

#### Scenario 3: Different Timezones
1. Test with devices assigned to sites in different timezones
2. Verify local time matches the site's timezone
3. Verify UTC time is also displayed

## 📋 What Was Implemented

### Frontend Changes
- **New Utility:** `src/utils/timeFormatters.ts`
  - Formats timestamps in both UTC and local timezone

- **Enhanced Service:** `src/services/deviceService.ts`
  - Added `getNextWakeTimes()` method

- **Updated UI:** `src/components/devices/DeviceEditModal.tsx`
  - Replaced single wake time with next 3 wake times
  - Added dual timezone display
  - Added manual refresh button
  - Added loading and error states

### Backend Changes
- **New RPC Function:** `get_next_wake_times()`
  - Calculates next N wake times
  - Uses device's wake_schedule_config
  - Returns timezone-aware timestamps

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Wake times display when modal opens
- [ ] All 3 wake times shown
- [ ] Local time format is readable (e.g., "Jan 4, 3:30 PM EST")
- [ ] UTC time format is readable (e.g., "Jan 4, 8:30 PM UTC")
- [ ] Timezone label shows at bottom

### Refresh Button
- [ ] Button shows refresh icon
- [ ] Icon spins during loading
- [ ] Button is disabled during loading
- [ ] Wake times update after refresh

### Schedule Changes
- [ ] Changing cron preset updates wake times automatically
- [ ] Wake times recalculate correctly for new schedule
- [ ] No errors in console during recalculation

### Error Handling
- [ ] Device without wake schedule: No wake times section shown
- [ ] Invalid schedule: Appropriate error message
- [ ] Network error: Error message displayed

### Different Presets
Test with each preset:
- [ ] Every hour (0 * * * *)
- [ ] Every 6 hours (0 */6 * * *)
- [ ] Every 12 hours (0 */12 * * *)
- [ ] Daily at noon (0 12 * * *)
- [ ] Daily at midnight (0 0 * * *)
- [ ] Twice daily (0 6,18 * * *)

## 🐛 Troubleshooting

### Issue: "Function not found" error
**Solution:** Apply the SQL migration from `APPLY_WAKE_TIMES_MIGRATION.sql`

### Issue: Wake times not showing
**Checklist:**
1. Device has `wake_schedule_config` set
2. Config includes a `preset` field
3. Device is assigned to a site (for timezone)
4. Function was created successfully

### Issue: Wrong timezone
**Check:**
1. Site has correct `timezone` field set
2. Timezone format is valid (e.g., "America/New_York")
3. Falls back to UTC if no timezone set

### Issue: Refresh button not working
**Debug:**
1. Open browser console
2. Look for errors when clicking refresh
3. Check Network tab for failed RPC call
4. Verify `get_next_wake_times` function exists in database

## 📊 Expected Behavior

### Supported Wake Schedule Presets
| Preset | Interval | Wake Times Example |
|--------|----------|-------------------|
| every-30-min | 30 min | 3:00 PM, 3:30 PM, 4:00 PM |
| hourly | 1 hour | 3:00 PM, 4:00 PM, 5:00 PM |
| every-2-hours | 2 hours | 3:00 PM, 5:00 PM, 7:00 PM |
| every-4-hours | 4 hours | 3:00 PM, 7:00 PM, 11:00 PM |
| every-6-hours | 6 hours | 3:00 PM, 9:00 PM, 3:00 AM |
| every-12-hours | 12 hours | 3:00 PM, 3:00 AM, 3:00 PM |
| daily | 24 hours | 3:00 PM, 3:00 PM, 3:00 PM |

### Time Format Examples
- **Local Time:** Jan 4, 3:30 PM EST
- **UTC Time:** Jan 4, 8:30 PM UTC
- **Timezone:** America/New_York

## 🎯 Success Criteria

✅ All 3 wake times visible
✅ Both time formats present (local and UTC)
✅ Refresh button functional
✅ Loading states work correctly
✅ Different timezones handled properly
✅ All cron presets calculate correctly
✅ No console errors
✅ Build successful

## 📞 Need Help?

Common issues:
1. **SQL not applied** → Apply migration first
2. **No wake times** → Check device has wake_schedule_config
3. **Wrong times** → Verify site timezone is correct
4. **Errors** → Check browser console for details

## 🔍 Verify Installation

Run this SQL to check function is installed:
```sql
-- Should return one row
SELECT
  proname as function_name,
  pronargs as arg_count,
  prorettype::regtype as return_type
FROM pg_proc
WHERE proname = 'get_next_wake_times';
```

Run this to test the function directly:
```sql
-- Replace YOUR_DEVICE_ID with an actual device UUID
SELECT get_next_wake_times('YOUR_DEVICE_ID'::uuid, 3);
```

Expected result:
```json
{
  "wake_times": ["2024-01-04T20:30:00Z", "2024-01-04T23:30:00Z", "2024-01-05T02:30:00Z"],
  "timezone": "America/New_York"
}
```
