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

## ⚡ How to Apply (REQUIRED)

**You must apply this SQL migration manually in Supabase:**

1. **Open Supabase SQL Editor:**

   https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

2. **Copy the SQL:**
   - Open the file: `fix-get-next-wake-times-cron.sql`
   - Select all and copy (Ctrl+A, Ctrl+C or Cmd+A, Cmd+C)

3. **Paste and Run:**
   - Paste into the SQL Editor
   - Click the green **"Run"** button

4. **Verify Success:**
   - You should see "Success. No rows returned"
   - Refresh your browser

## What This Fixes
After applying this migration:
- ✅ The "Next Wake Times" section will display properly
- ✅ It will show the next 3 wake times based on the device's cron schedule
- ✅ Times will be calculated in the correct site timezone
- ✅ The refresh button will work correctly

## Files
- `fix-get-next-wake-times-cron.sql` - **← APPLY THIS SQL FILE**
- `APPLY_NEXT_WAKE_FIX.md` - This instruction file
- `test-next-wake-times.mjs` - Optional test script

## After Applying
1. Refresh your browser
2. Navigate to a device detail page
3. The "Next Wake Times" section should now work without errors
4. You can run `node test-next-wake-times.mjs` to verify the function works
