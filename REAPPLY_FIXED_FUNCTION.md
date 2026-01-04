# Reapply Fixed Snapshot Function

## Issue
The first version had a bug in the `program_day` calculation:
```sql
DATE_PART('day', p_wake_round_end - pp.start_date)  -- ERROR: wrong type
```

## Fix Applied
Changed to simple date subtraction:
```sql
(p_wake_round_end::date - pp.start_date::date)  -- Returns integer days
```

## Action Required

### Reapply the SQL (1 minute)
1. Open Supabase SQL Editor again
2. Copy **updated** contents of `fix-comprehensive-snapshot-function.sql`
3. Paste and click "Run"

### Then Regenerate (30 seconds)
```bash
node regenerate-jan4-snapshots.mjs
```

This will now work correctly!

## What Changed
- Line 104: Fixed `program_day` calculation
- Line 105: Fixed `total_days` calculation

Both now use simple date arithmetic instead of `DATE_PART` which was causing type errors.
