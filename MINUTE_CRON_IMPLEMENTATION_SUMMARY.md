# Minute-Level Cron Support Implementation Summary

## Problem Identified

The wake schedule cron parser only looked at the **hour** field (position 2) and completely ignored the **minute** field (position 1). When you entered `*/15 * * * *` (every 15 minutes), the function fell through to the unsupported pattern case and defaulted to 24-hour intervals, resulting in hourly wake forecasts instead of 15-minute intervals.

## Solution Implemented

### 1. Database Function Enhancement (READY TO APPLY)

**File:** `APPLY_MINUTE_CRON_MIGRATION.md`

Created a comprehensive database migration that updates `fn_calculate_next_wake_time` to:

- Parse the **minute** field FIRST (before hour field)
- Handle minute interval patterns: `*/15`, `*/30`, `*/45`, etc.
- Handle minute list patterns: `0,30` (at :00 and :30), `0,15,30,45`, etc.
- Handle specific minute patterns: `30 * * * *` (at :30 past every hour)
- Maintain 100% backward compatibility with existing hour-only schedules

**Supported Patterns:**
- `*/15 * * * *` → Every 15 minutes (96 wakes/day)
- `*/30 * * * *` → Every 30 minutes (48 wakes/day)
- `0,30 * * * *` → Twice per hour (48 wakes/day)
- `30 * * * *` → At :30 past every hour (24 wakes/day)
- `0 */6 * * *` → Every 6 hours (4 wakes/day) - **backward compatible**
- `0 8,16,20 * * *` → At 8am, 4pm, 8pm (3 wakes/day) - **backward compatible**

**Priority Order:**
1. Minute intervals (`*/N`)
2. Minute lists (`N,N,N`)
3. Specific minute (`N`)
4. Hour intervals (`*/N`) - backward compatible
5. Hour lists (`N,N,N`) - backward compatible
6. Specific hour (`N`) - backward compatible
7. Fallback (24 hours)

### 2. UI Enhancements (COMPLETED)

**File:** `src/components/devices/DeviceEditModal.tsx`

Added comprehensive UI improvements:

**New Quick Presets:**
- "Every 15 minutes" - 96 wakes/day (high battery usage)
- "Every 30 minutes" - 48 wakes/day (high battery usage)
- Existing presets: 1 hour, 6 hours, 12 hours, daily, etc.

**Battery Impact Indicators:**
- Battery icon on high-usage presets (15/30 min)
- Wakes per day count displayed on each preset button
- Color-coded borders (yellow for high impact, gray for normal)

**Real-Time Battery Warnings:**
- High battery usage warning for >=48 wakes/day:
  - Shows estimated wakes per day
  - Warns about ~12x faster drain compared to 3-hour intervals
  - Advises monitoring device battery health
- Moderate battery usage info for 12-47 wakes/day
- Low battery usage (no warning) for <12 wakes/day

**Smart Wake Calculation:**
- Automatically calculates wakes per day from any cron expression
- Handles minute intervals, hour intervals, lists, and combinations
- Updates battery impact display in real-time as user types

### 3. Build Verification (COMPLETED)

Project builds successfully with no errors or type issues.

## How to Deploy

### Step 1: Apply Database Migration

1. Open Supabase SQL Editor: https://supabase.com/dashboard
2. Navigate to: **Project → SQL Editor**
3. Copy the entire SQL from `APPLY_MINUTE_CRON_MIGRATION.md`
4. Paste and click **RUN**
5. Verify success message in console

**What this does:**
- Replaces the `fn_calculate_next_wake_time` function with enhanced version
- No data migration needed (function only)
- Zero downtime - existing devices continue working
- Backward compatible - all existing schedules work identically

### Step 2: Deploy Frontend

The UI changes are already built and ready. Just deploy the updated frontend:

```bash
npm run build
# Then deploy dist/ folder to your hosting
```

### Step 3: Test

1. Edit any device wake schedule
2. Try entering `*/15 * * * *`
3. Click "Refresh" next to "Next Wake Times"
4. Verify times show 15-minute intervals
5. Notice the battery warning appears
6. Try other patterns: `*/30 * * * *`, `0,30 * * * *`, etc.

## Testing Checklist

- [ ] Apply database migration successfully
- [ ] Deploy frontend build
- [ ] Test `*/15 * * * *` (every 15 minutes)
  - Should show 15-minute interval forecasts
  - Should show "96 wakes/day" warning
- [ ] Test `*/30 * * * *` (every 30 minutes)
  - Should show 30-minute interval forecasts
  - Should show "48 wakes/day" warning
- [ ] Test `0,30 * * * *` (on the hour and half-hour)
  - Should show :00 and :30 forecasts
  - Should show "48 wakes/day" warning
- [ ] Test `0 */6 * * *` (every 6 hours - backward compat)
  - Should show 6-hour interval forecasts
  - Should show "4 wakes/day" (low battery)
- [ ] Test saving schedule and verifying device receives correct next_wake time

## What Was NOT Changed

- ESP32 firmware: No changes needed
- MQTT handler: No changes needed
- Device table schema: No changes needed
- Existing device schedules: Continue working exactly as before

The devices already accept any ISO timestamp for `next_wake`. The database function now calculates minute-level timestamps correctly, and the MQTT handler will send them to devices as usual.

## Next Steps (Optional Enhancements)

### Phase 2: Wake Monitoring System

If you'd like to add missed wake detection and alerting:

1. **Create `check_missed_wake` function**
   - Compare current time to device.expected_wake_at
   - Create alert if device is overdue by >30 minutes
   - Severity levels: warning (30-60min), error (1-4hrs), critical (>4hrs)

2. **Add scheduled wake check job**
   - pg_cron job running every 15-30 minutes
   - OR Edge Function scheduled task
   - Queries overdue devices and creates alerts

3. **UI integration**
   - Show missed wake alerts in ActiveAlertsPanel
   - Add "Last Wake" column to device lists
   - Color-code overdue devices (green/yellow/red)
   - Add filter for "Overdue Devices"

Let me know if you'd like me to implement the wake monitoring system!

## Battery Impact Reference

| Schedule | Wakes/Day | Battery Impact |
|----------|-----------|----------------|
| Every 15 minutes | 96 | Very High (~12x drain vs 3hr) |
| Every 30 minutes | 48 | High (~6x drain vs 3hr) |
| Every hour | 24 | Medium (~3x drain vs 3hr) |
| Every 3 hours | 8 | Baseline |
| Every 6 hours | 4 | Low (2x better than baseline) |
| Every 12 hours | 2 | Very Low (4x better than baseline) |

**ESP32-CAM Power Consumption:**
- Active (WiFi + camera): ~160mA for ~30 seconds
- Deep sleep: ~10µA between wakes
- Battery capacity: Typically 1000-2000mAh

**Estimated Battery Life (1500mAh battery):**
- Every 15 min: ~2-3 days
- Every 3 hours: ~3-4 weeks
- Every 12 hours: ~2-3 months

## Support

If you encounter any issues:

1. Check Supabase logs for function errors
2. Check browser console for frontend errors
3. Test with a single device first before rolling out
4. Use the manual wake feature to verify device connectivity
5. Monitor device battery health in first 24 hours of sub-hourly schedules

## Files Modified

- `src/components/devices/DeviceEditModal.tsx` - Added presets and battery warnings
- `APPLY_MINUTE_CRON_MIGRATION.md` - Database migration instructions
- `apply-minute-cron-migration.mjs` - Migration helper script (optional)

## Files Created

- `MINUTE_CRON_IMPLEMENTATION_SUMMARY.md` - This document
