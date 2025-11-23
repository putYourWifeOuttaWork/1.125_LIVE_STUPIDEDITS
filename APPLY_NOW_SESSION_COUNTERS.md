# 🚀 Apply Session Counter Fix NOW

## What's Wrong
Session page shows **all zeros** for wake counts even though devices are sending data.

## Why
Missing database triggers to increment `site_device_sessions` counter columns.

## Quick Fix (3 Steps)

### Step 1: Copy SQL
Open file: **`session-rollup-triggers.sql`** and copy all contents

### Step 2: Run in Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Paste the SQL
3. Click Run

### Step 3: Backfill Historical Data
Run this immediately after Step 2:

```sql
UPDATE site_device_sessions s
SET
  completed_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.wake_complete = true
  ),
  failed_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.wake_failed = true
  ),
  extra_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.is_extra_wake = true
  )
WHERE session_date >= '2025-11-01';
```

## Expected Result
✅ Session page shows actual wake counts  
✅ "Total Wakes" shows correct number (not 0)  
✅ Device Performance table shows per-device counts  
✅ Future wakes auto-increment counters

## Also Don't Forget
Deploy the edge function: Dashboard → Edge Functions → `mqtt_device_handler` → Deploy

## That's It!
Simple 3-step fix for session counters.
