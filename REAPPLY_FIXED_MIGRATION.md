# ⚠️ REAPPLY MIGRATION - EPOCH FIX NEEDED

## What Happened

The EXTRACT function needs to work with EPOCH (seconds) not DAY when dealing with intervals.

**Lines 281-282 updated to:**
```sql
'program_day', (EXTRACT(EPOCH FROM (p_wake_round_end - pp.start_date)) / 86400)::integer,
'total_days', (EXTRACT(EPOCH FROM (pp.end_date - pp.start_date)) / 86400)::integer
```

This converts the interval to seconds (EPOCH), then divides by 86400 (seconds per day) to get days.

---

## Quick Fix

### Option 1: Reapply Entire Migration (EASIEST)

1. **Go to Supabase Dashboard → SQL Editor**
2. **Copy ENTIRE contents** of `add-connectivity-tracking.sql`
3. **Paste and Run**
4. You'll see some "already exists" messages - that's OK!
5. The `generate_session_wake_snapshot` function will be updated

### Option 2: Update Just the Function (FASTER)

Copy and run this in SQL Editor:

```sql
-- Just update the generate_session_wake_snapshot function
-- (Copy from line 199 to end of add-connectivity-tracking.sql)
```

Or copy lines 199-442 from `add-connectivity-tracking.sql`

---

## Then Test Again

```bash
node test-connectivity-migration.mjs
```

**Should now see:**
```
🧪 Testing Connectivity Migration...

Test 1: Testing if functions were created (by calling them)...
  ℹ️  Skipping function existence check (not critical)
  ℹ️  Will test by calling functions directly...

Test 2: Testing snapshot generation with connectivity...
  ✅ Snapshot generated! ID: <uuid>

Test 3: Verifying connectivity data in snapshot...
  📊 Snapshot has X devices
  📶 X devices have connectivity data
  ...
  ✅ Connectivity data looks good!

Test 4: Testing connectivity calculation function...
  ✅ Connectivity calculated:
     Status: good
     Color: #F59E0B
     ...

🎉 All tests passed! Migration successful!
```

---

## Why This Happened

PostgreSQL subtraction of timestamps returns an INTERVAL type.

**These DON'T work with INTERVAL:**
- ❌ `DATE_PART('day', interval)`
- ❌ `EXTRACT(DAY FROM interval)::integer`

**This DOES work:**
- ✅ `(EXTRACT(EPOCH FROM interval) / 86400)::integer`

EPOCH gives us total seconds, which we can divide by seconds-per-day.

---

## Quick Copy-Paste

**For Supabase SQL Editor:**

1. Open `add-connectivity-tracking.sql`
2. Select ALL (Cmd+A / Ctrl+A)
3. Copy (Cmd+C / Ctrl+C)
4. Paste in SQL Editor
5. Run (Cmd+Enter / Ctrl+Enter)
6. Ignore "already exists" warnings
7. Should see "Success. No rows returned" at the end

---

**After reapplying, run the test script again!**
