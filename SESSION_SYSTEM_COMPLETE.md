

# Session System Unification - COMPLETE ✅

**Date:** 2025-11-17
**Status:** ✅ Ready to Deploy

---

## Summary

Successfully implemented a unified session management system that:
1. ✅ **Auto-locks expired sessions** (both human and device)
2. ✅ **Unifies Sessions drawer** to show ALL active sessions (human + device)
3. ✅ **Creates sessions automatically** at midnight for sites with devices
4. ✅ **Respects company boundaries** (super-admins see all, users see their company)

---

## What Was Implemented

### Phase B: Auto-Locking System ✅

**File:** `20251117000002_auto_lock_expired_sessions.sql`

**Functions Created:**
1. `lock_expired_submission_sessions()` - Locks human sessions from previous days
2. `lock_expired_device_sessions()` - Locks device sessions past their end time
3. `lock_all_expired_sessions()` - Master function that locks both types
4. `check_expired_sessions()` - Diagnostic tool (doesn't lock, just checks)

**How It Works:**
- Submission sessions: Active sessions from previous days → Mark as "Completed"
- Device sessions: in_progress sessions past session_end_time → Mark as "locked"
- Runs automatically at midnight via edge function

### Phase C: Unified Sessions Drawer ✅

**File:** `20251117000003_unified_sessions_view.sql`

**Functions Created:**
1. `get_all_active_sessions_unified(company_id)` - Returns human + device sessions
2. `get_my_active_sessions_unified()` - Context-aware version for current user

**UI Updates:** `src/components/submissions/ActiveSessionsDrawer.tsx`

**Features:**
- Shows both human 👤 and device 🤖 sessions
- Type badges with clear visual distinction
- Company filtering (super-admin sees all)
- Progress tracking for both types
- Smart navigation (device sessions → Lab view, human → Edit page)
- Expected vs completed items display

### Phase A: Midnight Jobs Automation ✅

**File:** `supabase/functions/midnight_jobs/index.ts`

**What It Does:**
1. Locks all expired sessions (yesterday's sessions)
2. Creates new device sessions for today
3. Logs results and errors
4. Returns detailed execution report

**Flow:**
```
Midnight UTC → Edge Function Called → Lock Old Sessions → Create New Sessions → Done
```

---

## Migrations to Apply

Apply these **in order** in Supabase SQL Editor:

### 1. Session Filtering Fix (Already Applied ✅)
```sql
-- File: 20251117000001_fix_auto_session_filters.sql
-- Fixes auto-creation to only process sites with devices
-- Status: ✅ Applied (you tested this)
```

### 2. Auto-Lock Functions (APPLY NOW)
```sql
-- File: 20251117000002_auto_lock_expired_sessions.sql
-- Creates lock_expired_*() functions
-- Status: ⏳ Ready to apply
```

### 3. Unified Sessions View (APPLY NOW)
```sql
-- File: 20251117000003_unified_sessions_view.sql
-- Creates get_all_active_sessions_unified() RPC
-- Status: ⏳ Ready to apply
```

---

## Testing Guide

### Step 1: Check for Expired Sessions

```sql
-- See what would be locked (doesn't actually lock)
SELECT * FROM check_expired_sessions();
```

**Expected Output:**
```json
{
  "expired_submission_sessions": 0,
  "expired_device_sessions": 1,  -- Today's session from earlier
  "total_expired": 1,
  "device_details": [{
    "session_id": "90c25115-fd45-4c41-ae84-b93776438167",
    "session_date": "2025-11-17",
    "status": "in_progress",
    "hours_overdue": 0
  }]
}
```

### Step 2: Test Locking (Manual)

```sql
-- Lock any expired sessions
SELECT * FROM lock_all_expired_sessions();
```

**Expected Output:**
```json
{
  "success": true,
  "total_locked": 1,
  "submission_sessions": {"locked_count": 0},
  "device_sessions": {"locked_count": 1}
}
```

### Step 3: Test Unified Sessions Query

```sql
-- See all active sessions (super-admin view)
SELECT * FROM get_all_active_sessions_unified(NULL);

-- See specific company sessions
SELECT * FROM get_all_active_sessions_unified('YOUR_COMPANY_ID');

-- See your own sessions (respects context)
SELECT * FROM get_my_active_sessions_unified();
```

**Expected Columns:**
- `session_id`, `session_type` ('human' or 'device')
- `site_name`, `program_name`, `company_name`
- `status`, `started_at`
- `expected_items`, `completed_items`, `progress_percent`
- `session_metadata` (type-specific details)

### Step 4: Test UI

1. Open the app
2. Click "Sessions" tab (slide-out drawer)
3. Should see:
   - Both human and device sessions
   - Type badges (👤 Human / 🤖 Device)
   - Progress bars
   - Expected/completed item counts
4. Click "View" on device session → Should navigate to lab view
5. Super-admin: Should see all companies' sessions

---

## Deployment Steps

### A. Apply Migrations

```bash
# Copy each migration file to Supabase SQL Editor and run:
# 1. 20251117000002_auto_lock_expired_sessions.sql
# 2. 20251117000003_unified_sessions_view.sql
```

### B. Deploy Edge Function

The edge function file is created but needs deployment:

**Option 1: Via Supabase Dashboard**
1. Go to Supabase Dashboard → Edge Functions
2. Click "Create Function"
3. Name: `midnight_jobs`
4. Paste contents of `supabase/functions/midnight_jobs/index.ts`
5. Deploy

**Option 2: Via Supabase CLI** (if available)
```bash
supabase functions deploy midnight_jobs
```

### C. Schedule Daily Execution

**Recommended: External Cron Service**

Use [cron-job.org](https://cron-job.org) (free):

1. Create account
2. Create new cron job:
   - **Title:** "Midnight Session Jobs"
   - **URL:** `https://YOUR_PROJECT_ID.supabase.co/functions/v1/midnight_jobs`
   - **Schedule:** `0 0 * * *` (midnight UTC)
   - **Request Method:** POST
   - **Headers:**
     ```
     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     Content-Type: application/json
     ```
3. Save and enable

**Alternative: Other Cron Services**
- [EasyCron](https://www.easycron.com/)
- [crontab.guru](https://crontab.guru/) + your own server
- AWS EventBridge
- Vercel Cron
- GitHub Actions (scheduled workflow)

---

## How The System Works

### Daily Midnight Flow

```
12:00 AM UTC
     ↓
External Cron Triggers
     ↓
midnight_jobs Edge Function
     ↓
  ┌──────────────────────┐
  │ 1. Lock Old Sessions │ ← lock_all_expired_sessions()
  └──────────────────────┘
            ↓
  ┌──────────────────────┐
  │ 2. Create New Sessions│ ← auto_create_daily_sessions()
  └──────────────────────┘
            ↓
        Done ✅
```

### What Gets Locked

**Human Sessions (submission_sessions):**
- Status: "Active"
- Condition: `DATE(session_start_time) < CURRENT_DATE`
- Action: Set `session_status = 'Completed'`, `completion_time = NOW()`

**Device Sessions (site_device_sessions):**
- Status: "in_progress"
- Condition: `session_end_time < NOW()`
- Action: Set `status = 'locked'`, `locked_at = NOW()`

### What Gets Created

**Device Sessions (site_device_sessions):**
- For each site with:
  1. Active program
  2. Program within date range
  3. At least one assigned active device
- Creates session with:
  - `session_date = CURRENT_DATE`
  - `session_start_time = 00:00 site timezone`
  - `session_end_time = 23:59 site timezone`
  - `expected_wake_count = <calculated from cron schedules>`
  - `status = 'in_progress'`

---

## Unified Sessions Drawer Behavior

### For Regular Users
- Sees sessions from their company only
- Both human and device sessions mixed
- "My Sessions" tab shows claimed human + all device sessions
- "Unclaimed Sessions" tab shows unclaimed human sessions only

### For Super-Admins
- **With company context set:** Sees that company's sessions
- **Without context:** Sees ALL companies' sessions
- Can quick-switch between sessions across companies
- Company name shown for each session

### Session Type Badges
- 👤 **Human** (green badge) - Manual field worker submissions
- 🤖 **Device** (blue badge) - Automated device sessions

### Action Buttons
- **Human unclaimed:** "Claim" button
- **Human claimed:** "Resume" button (navigates to edit page)
- **Device:** "View" button (navigates to lab session view)

---

## Monitoring & Logs

### Check Session Creation Logs

```sql
SELECT *
FROM session_creation_log
ORDER BY execution_time DESC
LIMIT 10;
```

### Check What Would Run Tomorrow

```sql
-- Sites that will get sessions tomorrow
SELECT
  s.site_id,
  s.name,
  p.name as program,
  COUNT(dsa.device_id) as devices
FROM sites s
JOIN pilot_programs p ON s.program_id = p.program_id
LEFT JOIN device_site_assignments dsa ON dsa.site_id = s.site_id AND dsa.is_active = TRUE
LEFT JOIN devices d ON dsa.device_id = d.device_id AND d.is_active = TRUE
WHERE p.status = 'active'
  AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
GROUP BY s.site_id, s.name, p.name
HAVING COUNT(dsa.device_id) > 0;
```

### Manual Trigger (Testing)

```bash
# Test the edge function manually
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/midnight_jobs \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

---

## Rollback Plan

If anything goes wrong:

### Revert UI Changes
```bash
git revert <commit-hash>  # Revert ActiveSessionsDrawer changes
```

### Disable Cron Job
- Pause/delete the cron-job.org job

### Drop New Functions (if needed)
```sql
DROP FUNCTION IF EXISTS lock_expired_submission_sessions();
DROP FUNCTION IF EXISTS lock_expired_device_sessions();
DROP FUNCTION IF EXISTS lock_all_expired_sessions();
DROP FUNCTION IF EXISTS check_expired_sessions();
DROP FUNCTION IF EXISTS get_all_active_sessions_unified(UUID);
DROP FUNCTION IF EXISTS get_my_active_sessions_unified();
```

---

## FAQ

### Q: Will this lock today's sessions?
**A:** No. Device sessions are only locked after `session_end_time` (23:59 today). Human sessions are only locked if from previous days.

### Q: What happens if a session is manually edited while locked?
**A:** Locked device sessions are read-only in the UI. Human "Completed" sessions can still be edited (existing behavior preserved).

### Q: Can I run the locking function multiple times?
**A:** Yes! It's idempotent. Running it twice won't cause issues.

### Q: What if no sites have devices?
**A:** The creation function will process 0 sites and complete successfully. No error.

### Q: How do I know if it's working?
**A:** Check `session_creation_log` table each morning. Should have entries showing successful runs.

---

## Next Steps

1. ✅ Apply migration 20251117000002 (auto-lock functions)
2. ✅ Apply migration 20251117000003 (unified sessions RPC)
3. ⏳ Test `check_expired_sessions()` to see current state
4. ⏳ Test `lock_all_expired_sessions()` manually
5. ⏳ Test UI - open Sessions drawer, verify both types show
6. ⏳ Deploy `midnight_jobs` edge function
7. ⏳ Schedule cron job to run daily at midnight
8. ⏳ Monitor first automatic run tomorrow morning
9. ⏳ Check logs and verify everything works

---

## Files Changed

### Migrations Created
- `20251117000000_fix_auto_session_status_enum.sql` (enum fix - already applied ✅)
- `20251117000001_fix_auto_session_filters.sql` (device/date filters - already applied ✅)
- `20251117000002_auto_lock_expired_sessions.sql` ⏳
- `20251117000003_unified_sessions_view.sql` ⏳

### Edge Functions Created
- `supabase/functions/midnight_jobs/index.ts` ⏳

### UI Components Updated
- `src/components/submissions/ActiveSessionsDrawer.tsx` ✅

### Documentation Created
- `AUTO_SESSION_FIX_SUMMARY.md`
- `SESSION_UNIFICATION_PLAN.md`
- `SESSION_SYSTEM_COMPLETE.md` (this file)

---

## Success Criteria

✅ System is successful when:
1. Old sessions automatically lock at midnight
2. New device sessions automatically created at midnight
3. Sessions drawer shows both human and device sessions
4. Company filtering works (super-admin sees all, users see their company)
5. Users can navigate to appropriate views from session cards
6. No manual intervention needed for session lifecycle

---

**Ready to deploy! 🚀**

Apply the migrations, deploy the edge function, schedule the cron job, and you're done!
