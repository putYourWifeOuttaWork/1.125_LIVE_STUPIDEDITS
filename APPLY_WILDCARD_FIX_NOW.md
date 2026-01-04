# Fix Wake Schedule Wildcard (*) Support

## Problem
The `fn_calculate_next_wake_time()` function doesn't handle `*` (wildcard) in cron expressions.

When you select "Every hour" (cron: `0 * * * *`), it falls through to the 24-hour fallback, causing all wake times to be calculated as 24 hours apart regardless of the actual schedule.

## Root Cause
The function only handles:
- `*/N` patterns (like `*/6` for every 6 hours)
- Comma-separated hours (like `8,16,20`)
- Single hours (like `8`)

But `*` by itself (meaning "every unit") wasn't handled, so it defaulted to 24-hour intervals.

## Solution
Added explicit handling for wildcard `*` to treat it as an interval of 1 hour.

## How to Apply

**1. Open Supabase SQL Editor:**

   https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

**2. Copy and Paste:**
   - Open: `fix-next-wake-calculation-support-star.sql`
   - Copy all contents
   - Paste into SQL Editor

**3. Run:**
   - Click the green "Run" button

**4. Test (Optional):**
   ```bash
   node test-star-cron-pattern.mjs
   ```

## What This Fixes

After applying:

✅ **"Every hour" (0 * * * *)** → Calculates 1 hour intervals
✅ **"Every 6 hours" (0 */6 * * *)** → Calculates 6 hour intervals
✅ **"Every 12 hours" (0 */12 * * *)** → Calculates 12 hour intervals
✅ **"Daily at noon" (0 12 * * *)** → Calculates next noon
✅ **"Twice daily" (0 6,18 * * *)** → Calculates next 6am or 6pm
✅ **"Daily at midnight" (0 0 * * *)** → Calculates next midnight

## After Applying

1. Refresh your browser
2. Edit any device
3. Select any wake schedule preset
4. The "Next Wake Times" should now show correct intervals based on the selected schedule

## Files
- `fix-next-wake-calculation-support-star.sql` - **← APPLY THIS**
- `test-star-cron-pattern.mjs` - Test script
- `APPLY_WILDCARD_FIX_NOW.md` - This file
