# Apply Connectivity Migration - INSTRUCTIONS

## The Bug is Fixed!

The `DATE_PART` bug in `add-connectivity-tracking.sql` has been corrected.
Lines 281-282 now use `EXTRACT(DAY FROM (...))` instead of `DATE_PART`.

## How to Apply

### Option 1: Supabase Dashboard (EASIEST)

1. **Go to Supabase Dashboard**
   - Navigate to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click "SQL Editor" in left sidebar
   - Click "New Query"

3. **Copy Migration**
   - Open file: `/tmp/cc-agent/51386994/project/add-connectivity-tracking.sql`
   - Select ALL (Cmd+A / Ctrl+A)
   - Copy (Cmd+C / Ctrl+C)

4. **Paste and Run**
   - Paste into SQL Editor
   - Click "Run" (or press Cmd+Enter / Ctrl+Enter)
   - Wait for "Success. No rows returned"

5. **Verify**
   ```sql
   -- Check functions were created
   SELECT proname FROM pg_proc
   WHERE proname IN (
     'get_previous_wake_times',
     'was_device_active_near',
     'calculate_device_wake_reliability',
     'generate_session_wake_snapshot'
   );
   ```

   Should return 4 rows.

### Option 2: psql Command Line

```bash
# If you have database URL
psql "$DATABASE_URL" < add-connectivity-tracking.sql
```

### Option 3: Statement by Statement (If errors occur)

If the full migration fails, apply functions individually:

1. Copy lines 1-48 (get_previous_wake_times)
2. Run in SQL Editor
3. Copy lines 50-119 (was_device_active_near)
4. Run in SQL Editor
5. Copy lines 121-197 (calculate_device_wake_reliability)
6. Run in SQL Editor
7. Copy lines 199-end (generate_session_wake_snapshot)
8. Run in SQL Editor

## What This Does

**Creates 3 New Functions:**
- `get_previous_wake_times()` - Parses cron schedule
- `was_device_active_near()` - Checks device activity
- `calculate_device_wake_reliability()` - Calculates connectivity score

**Updates 1 Existing Function:**
- `generate_session_wake_snapshot()` - Now includes connectivity data

## After Applying

**Test Manual Snapshot Generation:**
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Try to generate wake #3 for Iot Test Site 2
  const { data, error } = await supabase.rpc('generate_session_wake_snapshot', {
    p_session_id: '720e945e-b304-428b-b075-1fdad8d494cc',
    p_wake_number: 3,
    p_wake_round_start: '2025-11-21T14:00:00+00:00',
    p_wake_round_end: '2025-11-21T15:00:00+00:00'
  });

  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log('✅ Success! Snapshot ID:', data);
  }
})();
"
```

**Should see:** `✅ Success! Snapshot ID: <uuid>`

**Then regenerate all snapshots:**
```bash
node regenerate-snapshots-with-locf.mjs
```

**Should see:** All snapshots regenerated successfully with connectivity data!

## Troubleshooting

**Error: "function already exists"**
- This is OK! It means the function is already there
- Continue to next statement

**Error: "syntax error"**
- Check you copied the entire statement
- Make sure no line breaks were lost
- Try copying smaller chunks

**Error: "relation does not exist"**
- Make sure previous migrations are applied
- Check that tables exist: `devices`, `device_telemetry`, `device_images`

## Success Criteria

✅ No errors when applying migration
✅ 4 functions exist in database
✅ Manual snapshot generation succeeds
✅ Regeneration script completes successfully
✅ Browser shows WiFi icons above devices

---

**Ready? Start with Option 1 (Supabase Dashboard)!**
