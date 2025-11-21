# Device Connectivity Indicator System - COMPLETE

## Overview

Added a visual connectivity/reliability indicator above each device on the site map showing wake performance based on trailing 3 expected wakes.

## Visual Design

**WiFi-style icon above each device** with color coding:
- 🟢 **Green (Excellent)**: 3/3 expected wakes (100% reliability)
- 🟡 **Yellow (Good)**: 2/3 expected wakes (66% reliability)
- 🔴 **Red (Poor/Offline)**: ≤1/3 expected wakes (≤33% reliability)
- ⚪ **Gray (Unknown)**: No wake schedule configured

**Icon Style:**
- WiFi bars showing number of successful wakes
- 3 bars for 3/3, 2 bars for 2/3, 1 bar for 1/3
- X symbol for offline devices
- Small colored dot indicator
- Opacity varies based on reliability

## Database Implementation

### New Functions

**1. `calculate_device_wake_reliability(device_id, site_id, reference_time, trailing_count)`**
```sql
-- Returns JSONB:
{
  "status": "excellent" | "good" | "poor" | "offline" | "unknown",
  "color": "#10B981" | "#F59E0B" | "#EF4444" | "#9CA3AF",
  "trailing_wakes_expected": 3,
  "trailing_wakes_actual": 2,
  "reliability_percent": 66.67,
  "last_expected_wakes": ["2025-11-21 10:00", "2025-11-21 07:00", ...]
}
```

**2. `get_previous_wake_times(cron_schedule, reference_time, count)`**
- Parses cron schedule (e.g., "0 */3 * * *")
- Calculates previous N expected wake times
- Supports patterns:
  - `0 */N * * *` - Every N hours
  - `0 H1,H2,H3 * * *` - Specific hours daily
  - Defaults to hourly for unknown patterns

**3. `was_device_active_near(device_id, site_id, expected_time, tolerance_minutes)`**
- Checks if device had ANY activity within ±30 minutes of expected wake
- Queries:
  - `devices.last_seen_at`
  - `device_telemetry.captured_at`
  - `device_images.captured_at`
- Returns true if any activity found

**4. Updated `generate_session_wake_snapshot()`**
- Now includes `connectivity` field for each device
- Calculated automatically during snapshot generation
- No changes needed to existing snapshot structure

### Data Flow

```
Wake Schedule (devices.wake_schedule_cron)
  ↓
Parse cron → Calculate 3 previous expected wake times
  ↓
Check each expected time: was device active? (±30 min tolerance)
  ↓
Count: actual_wakes / expected_wakes
  ↓
Determine status & color:
  - 3/3 = excellent (green)
  - 2/3 = good (yellow)
  - 1/3 or 0/3 = poor/offline (red)
  ↓
Store in snapshot: device.connectivity = {...}
```

## Frontend Implementation

### Components Created

**1. `DeviceConnectivityIndicator.tsx`**
- Reusable component for displaying connectivity
- Props: `connectivity`, `size`, `showTooltip`
- Renders WiFi/WifiOff icons from lucide-react
- Configurable sizes: small, medium, large

**2. Updated `SiteMapViewer.tsx`**
- Renders connectivity indicator above each device (18px above center)
- WiFi bars drawn as SVG arcs
- Number of bars = number of successful wakes
- Offline icon (X) for poor connectivity
- Integrated into tooltip with reliability percentage

### Type Definitions

**`DeviceConnectivity` type:**
```typescript
export type DeviceConnectivity = {
  status: 'excellent' | 'good' | 'poor' | 'offline' | 'unknown';
  color: string;
  trailing_wakes_expected: number;
  trailing_wakes_actual: number;
  reliability_percent: number | null;
  last_expected_wakes?: string[];
};
```

**Updated `DeviceSnapshotData`:**
```typescript
export type DeviceSnapshotData = {
  // ... existing fields
  connectivity?: DeviceConnectivity;
};
```

## Deployment Instructions

### Step 1: Apply Database Migration

**Via Supabase Dashboard (RECOMMENDED):**
1. Go to Supabase Dashboard → SQL Editor
2. Create new query
3. Copy contents of `/tmp/cc-agent/51386994/project/add-connectivity-tracking.sql`
4. Paste and **Run**

**Via psql:**
```bash
psql $DATABASE_URL < add-connectivity-tracking.sql
```

### Step 2: Regenerate Snapshots

Run the regeneration script to add connectivity data to existing snapshots:

```bash
node regenerate-snapshots-with-locf.mjs
```

This will update all 12 snapshots for "Iot Test Site 2" with connectivity metadata.

### Step 3: Deploy Frontend

Frontend is already built and ready! The changes are live after Step 1-2 complete.

```bash
# Already done - project built successfully
npm run build
```

### Step 4: Verify

1. Refresh browser
2. Navigate to Lab → Site Sessions → "Iot Test Site 2"
3. Look at Timeline Playback
4. **Expected**: WiFi icon above each device showing:
   - Color based on reliability
   - Number of bars = successful wakes
   - Tooltip shows "Reliability: X/3 wakes (XX%)"

## Example Scenarios

### Scenario 1: All Devices Online (Green)
```
Device Schedule: "0 */1 * * *" (hourly)
Last 3 Expected: 10:00, 11:00, 12:00
Actual Activity: 10:05, 11:02, 12:01
Result: 3/3 wakes = GREEN (excellent)
Icon: WiFi with 3 bars
```

### Scenario 2: Intermittent Device (Yellow)
```
Device Schedule: "0 */3 * * *" (every 3 hours)
Last 3 Expected: 06:00, 09:00, 12:00
Actual Activity: 06:05, 12:02 (missed 09:00)
Result: 2/3 wakes = YELLOW (good)
Icon: WiFi with 2 bars
```

### Scenario 3: Offline Device (Red)
```
Device Schedule: "0 8,14,20 * * *" (3x daily)
Last 3 Expected: 08:00, 14:00, 20:00
Actual Activity: None
Result: 0/3 wakes = RED (offline)
Icon: X symbol (WifiOff)
```

### Scenario 4: No Schedule (Gray)
```
Device Schedule: null or ""
Result: Unknown status = GRAY
Icon: WiFi with 1 bar, very faded
```

## Technical Details

### Cron Parsing

Currently supports:
- `0 */N * * *` - Every N hours (e.g., `0 */3 * * *` = every 3 hours)
- `0 H1,H2,H3 * * *` - Specific hours (e.g., `0 8,14,20 * * *` = 8am, 2pm, 8pm)
- Defaults to hourly for unknown patterns

### Activity Detection Window

**±30 minutes tolerance** around expected wake time:
- Expected: 12:00 PM
- Window: 11:30 AM - 12:30 PM
- Any activity in this window = "successful wake"

### Performance

- Calculated during snapshot generation (no real-time overhead)
- Uses indexed columns (`captured_at`, `device_id`, `site_id`)
- Efficient: only queries last 3 expected wakes per device

## Testing

### Test Cases

1. **Device with perfect connectivity**
   - Create device with hourly schedule
   - Generate telemetry every hour
   - Verify: Green icon, 3/3 wakes

2. **Device with one missed wake**
   - Schedule: every 3 hours
   - Skip one expected wake
   - Verify: Yellow icon, 2/3 wakes

3. **Offline device**
   - Schedule configured
   - No recent activity
   - Verify: Red icon with X, 0/3 wakes

4. **Device without schedule**
   - `wake_schedule_cron = null`
   - Verify: Gray icon, "unknown" status

### Mock Test Data

Use devices from "Iot Test Site 2":
- `DEVICE-ESP32S3-001`: `wake_schedule_cron = "0 8,20 * * *"`
- `DEVICE-ESP32S3-003`: `wake_schedule_cron = "0 8,14,20 * * *"`
- `DEVICE-ESP32S3-004`: `wake_schedule_cron = "0 */3 * * *"`

## Files Modified/Created

### Database
- ✅ `add-connectivity-tracking.sql` - Migration with 4 new functions

### Frontend
- ✅ `src/components/devices/DeviceConnectivityIndicator.tsx` - New component
- ✅ `src/components/lab/SiteMapViewer.tsx` - Updated with connectivity rendering
- ✅ `src/lib/types.ts` - Added `DeviceConnectivity` type

### Documentation
- ✅ `CONNECTIVITY_INDICATOR_COMPLETE.md` - This file

## Future Enhancements

1. **Configurable Tolerance**: Allow ±15, ±30, ±60 minute windows
2. **Historical Trends**: Show reliability over 24 hours, 7 days, 30 days
3. **Alert Integration**: Trigger alerts when reliability drops below threshold
4. **Predictive**: Forecast next expected wake and warn if approaching miss
5. **Advanced Cron**: Support more complex cron patterns
6. **Battery Correlation**: Show if low battery correlates with missed wakes

---

## Summary

✅ **Database**: 4 new functions for wake reliability calculation
✅ **Frontend**: WiFi-style connectivity indicator above each device
✅ **Color Coding**: Green (3/3), Yellow (2/3), Red (≤1/3)
✅ **Tooltip**: Shows "Reliability: X/3 wakes (XX%)"
✅ **Automatic**: Calculated during snapshot generation
✅ **Built**: Project successfully compiled

**Next Step**: Apply database migration and regenerate snapshots!
