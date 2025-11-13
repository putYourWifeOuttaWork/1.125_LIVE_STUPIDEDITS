# 🔴 SESSION CREATION NOT WORKING - FIX REQUIRED

## **Problem**
No device sessions have been created since November 11th, even though there are **2 active sites** with **8 active devices total**.

---

## **Root Cause**
The `auto_create_daily_sessions()` function has a bug on line 99:

```sql
WHERE p.status IN ('active', 'in_progress')  -- ❌ 'in_progress' doesn't exist!
```

The enum `program_status_enum` only has these values:
- `active`
- `inactive`

There is **no** `in_progress` value, causing the function to fail with:
```
invalid input value for enum program_status_enum: "in_progress"
```

---

## **Affected Sites**

### **Sites Not Getting Sessions:**
1. **Test Site for IoT Device** - 7 active devices
2. **Greenhouse #1** - 1 active device

### **Last Sessions Created:**
- Nov 11, 2025 (2 days ago)
- Nov 10, 2025
- Nov 9, 2025
- (Daily before that)

---

## **Fix Instructions**

### **Option 1: Apply SQL Fix (Quickest)** ⭐

Run this in Supabase SQL Editor:

```sql
-- File: fix-session-creation.sql
-- This file has been created for you
```

Copy the contents of `fix-session-creation.sql` and run it in the SQL Editor.

---

### **Option 2: Test Function Now**

After applying the fix, test manually:

```sql
SELECT auto_create_daily_sessions();
```

This should return:
```json
{
  "success": true,
  "success_count": 2,  -- One for each active site
  "error_count": 0,
  "total_sites": 2
}
```

---

### **Option 3: Create Today's Sessions Manually**

If you need sessions RIGHT NOW while fixing the automation:

```sql
-- For Test Site for IoT Device
INSERT INTO site_device_sessions (site_id, program_id, session_date, status)
SELECT
  s.site_id,
  s.program_id,
  CURRENT_DATE,
  'pending'
FROM sites s
WHERE s.name = 'Test Site for IoT Device'
ON CONFLICT (site_id, session_date) DO NOTHING;

-- For Greenhouse #1
INSERT INTO site_device_sessions (site_id, program_id, session_date, status)
SELECT
  s.site_id,
  s.program_id,
  CURRENT_DATE,
  'pending'
FROM sites s
WHERE s.name = 'Greenhouse #1'
ON CONFLICT (site_id, session_date) DO NOTHING;
```

---

## **Automation Status**

### **Current State:**
- ❌ Automatic scheduler NOT running
- ✅ Function exists but has bug
- ✅ Edge function file exists
- ❌ pg_cron is commented out in migration
- ❌ No external cron configured

### **What's Needed:**

After fixing the function bug, you need to **schedule it**. Choose one:

#### **A. Enable pg_cron (If Available)**

Run in SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'auto-create-device-sessions-daily',
  '0 0 * * *',  -- Daily at midnight UTC
  $$ SELECT auto_create_daily_sessions(); $$
);
```

#### **B. Deploy Edge Function + External Cron**

1. The edge function already exists at:
   `supabase/functions/auto_create_daily_sessions.ts`

2. Set up external cron (e.g., cron-job.org, Vercel Cron, GitHub Actions) to call:
   ```
   POST https://YOUR_PROJECT.supabase.co/functions/v1/auto_create_daily_sessions
   Authorization: Bearer YOUR_ANON_KEY
   ```

3. Schedule for daily at midnight (adjust for timezone)

#### **C. Supabase Edge Function Cron (Recommended)**

If using Supabase Edge Functions native cron:
```bash
supabase functions deploy auto_create_daily_sessions --no-verify-jwt
```

Then configure cron in Supabase Dashboard:
- Go to Edge Functions
- Select `auto_create_daily_sessions`
- Set up Cron schedule: `0 0 * * *`

---

## **Verification**

After fix + scheduling, verify:

1. **Check logs:**
   ```sql
   SELECT * FROM session_creation_log
   ORDER BY execution_time DESC
   LIMIT 5;
   ```

2. **Check sessions:**
   ```sql
   SELECT session_date, COUNT(*) as sessions
   FROM site_device_sessions
   WHERE session_date >= CURRENT_DATE - 7
   GROUP BY session_date
   ORDER BY session_date DESC;
   ```

3. **Should see daily sessions** going forward

---

## **Quick Test Script**

Run this to verify the fix worked:

```bash
node check-sessions.mjs
```

You should see:
- ✅ Sessions exist for today
- ✅ No "NO SESSIONS CREATED TODAY" error

---

## **Files Created**

1. `fix-session-creation.sql` - SQL fix for the function
2. `check-sessions.mjs` - Verification script
3. This document - Complete troubleshooting guide

---

**Priority:** 🔴 **HIGH** - Sites are not collecting device data since Nov 12!

Apply the fix ASAP to resume session creation and device data collection.
