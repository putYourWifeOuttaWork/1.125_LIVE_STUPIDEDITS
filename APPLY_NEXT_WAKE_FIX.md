# Fix Next Wake Times Function

## Problem
The `get_next_wake_times()` function is querying `wake_schedule_config` (JSONB) which doesn't exist in the schema. The actual column is `wake_schedule_cron` (TEXT).

This causes the error:
```
column d.wake_schedule_config does not exist
```

## Solution
The function has been rewritten to:
- Use `wake_schedule_cron` (TEXT) instead of `wake_schedule_config` (JSONB)
- Leverage the existing `fn_calculate_next_wake_time()` function for proper cron parsing
- Calculate next wake times based on `last_wake_at`

## How to Apply

### Option 1: Supabase SQL Editor (Recommended)
1. Go to your Supabase Dashboard
2. Navigate to: **SQL Editor → New Query**
3. Copy the entire contents of `fix-get-next-wake-times-cron.sql`
4. Paste into the SQL Editor
5. Click **Run**

### Option 2: Direct Link
Visit: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

Then follow steps 3-5 above.

## What This Fixes
After applying this migration:
- ✅ The "Next Wake Times" section will display properly
- ✅ It will show the next 3 wake times based on the device's cron schedule
- ✅ Times will be calculated in the correct site timezone
- ✅ The refresh button will work correctly

## Files Created
- `fix-get-next-wake-times-cron.sql` - The migration SQL to apply
- `APPLY_NEXT_WAKE_FIX.md` - This instruction file

## After Applying
Refresh your browser to see the fix take effect. The error should be gone and the Next Wake Times section should show upcoming wake times.
