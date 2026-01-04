# Wake Times Feature Implementation

## Overview

This feature enhances the Device Edit Modal to display the next 3 wake times for a device, showing both UTC and local timezone formats. Users can also manually refresh the wake times to get the latest predictions.

## Implementation Status

✅ **COMPLETED**
- Time formatting utilities
- Database RPC function (SQL ready to apply)
- DeviceService integration
- UI components with loading/error states
- Manual refresh functionality
- TypeScript compilation successful
- Build successful

## Components Modified

### 1. Time Formatting Utilities
**File:** `src/utils/timeFormatters.ts`

New utility functions for formatting wake times:
- `formatWakeTime()` - Formats a single wake time into UTC and local timezone
- `formatWakeTimes()` - Formats an array of wake times

### 2. Database RPC Function
**File:** SQL migration script generated at `/tmp/next_wake_times_migration.sql`

**Function:** `get_next_wake_times(p_device_id uuid, p_count integer DEFAULT 3)`

**⚠️ REQUIRES MANUAL APPLICATION** - This SQL needs to be applied to the database via Supabase dashboard.

The function:
- Calculates next N wake times based on device's wake_schedule_config
- Returns timestamps with timezone information
- Supports all cron preset patterns:
  - every-30-min
  - hourly
  - every-2-hours
  - every-4-hours
  - every-6-hours
  - every-12-hours
  - daily

**To Apply:**
1. Open Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and execute the SQL from `/tmp/next_wake_times_migration.sql`

### 3. DeviceService Enhancement
**File:** `src/services/deviceService.ts`

New method: `getNextWakeTimes()`
- Calls the database RPC function
- Returns formatted wake times with timezone info
- Includes error handling

### 4. DeviceEditModal UI Updates
**File:** `src/components/devices/DeviceEditModal.tsx`

Enhanced with:
- **Next 3 wake times display** instead of just 1
- **Dual timezone format** (both local and UTC for each wake time)
- **Manual refresh button** with loading spinner
- **Loading state** - "Loading wake times..."
- **Error handling** - Shows errors if calculation fails
- **Timezone display** - Shows which timezone is being used

## UI Features

### Wake Times Display
```
┌─────────────────────────────────────────┐
│ ⏰ Next Wake Times         🔄 Refresh   │
├─────────────────────────────────────────┤
│ Wake 1                                  │
│ Jan 4, 3:30 PM EST                     │
│ Jan 4, 8:30 PM UTC                     │
│                                         │
│ Wake 2                                  │
│ Jan 4, 6:30 PM EST                     │
│ Jan 4, 11:30 PM UTC                    │
│                                         │
│ Wake 3                                  │
│ Jan 4, 9:30 PM EST                     │
│ Jan 5, 2:30 AM UTC                     │
│                                         │
│ Timezone: America/New_York             │
└─────────────────────────────────────────┘
```

## Technical Details

### Wake Time Calculation
The database function uses the device's `wake_schedule_config` JSON field which contains a `preset` key with values like:
- `every-30-min` → 30 minute intervals
- `hourly` → 60 minute intervals
- `every-2-hours` → 120 minute intervals
- etc.

### Timezone Handling
- Fetches timezone from the device's assigned site
- Falls back to UTC if no timezone configured
- Displays times in both local site timezone and UTC
- Uses `date-fns-tz` for accurate timezone conversions

### Loading States
- Initial load when modal opens (if wake schedule exists)
- Manual refresh via button click
- Spinner animation on refresh button during loading
- Button disabled during loading to prevent duplicate requests

### Error Handling
- Device not found errors
- Missing wake schedule configuration
- Invalid cron expressions
- Network/API errors
- All errors displayed to user in red text

## Testing Checklist

### Database Testing
- [ ] Apply SQL migration via Supabase dashboard
- [ ] Test function with various device IDs
- [ ] Verify timezone calculations
- [ ] Test all cron preset patterns

### Frontend Testing
1. Open Device Edit Modal for a device with wake schedule configured
2. Verify next 3 wake times appear
3. Verify both UTC and local times are shown
4. Click refresh button and verify loading state
5. Test with devices in different timezones
6. Test with invalid/missing wake schedules
7. Test error states

## Next Steps (Manual Action Required)

1. **Apply Database Migration**
   - Open `/tmp/next_wake_times_migration.sql`
   - Copy the SQL
   - Apply via Supabase Dashboard SQL Editor
   - Verify function is created: `SELECT * FROM pg_proc WHERE proname = 'get_next_wake_times';`

2. **Test in Production**
   - Edit a device with a wake schedule
   - Verify wake times display correctly
   - Test refresh functionality
   - Test with multiple timezones

3. **Monitor**
   - Watch for any errors in browser console
   - Check Supabase logs for RPC function errors
   - Verify performance (should be fast, < 100ms)

## Files Changed

1. `src/utils/timeFormatters.ts` - NEW
2. `src/services/deviceService.ts` - MODIFIED (added getNextWakeTimes method)
3. `src/components/devices/DeviceEditModal.tsx` - MODIFIED (enhanced UI)
4. `/tmp/next_wake_times_migration.sql` - NEW (needs manual application)

## Build Status

✅ TypeScript compilation: **PASSED**
✅ Vite build: **SUCCESS**
✅ No errors or warnings in implementation

## Migration SQL Location

The SQL migration is ready at:
- `/tmp/cc-agent/51386994/project/apply-wake-times-function.mjs` (contains the SQL)
- `/tmp/next_wake_times_migration.sql` (standalone SQL file)

Copy the SQL from either location and apply it via Supabase Dashboard.
