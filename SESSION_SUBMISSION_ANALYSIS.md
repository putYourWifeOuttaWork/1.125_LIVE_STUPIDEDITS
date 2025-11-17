# Device Session/Submission Architecture Analysis

**Date:** 2025-11-17
**Status:** Issues Identified - Needs Fix

---

## Current Architecture Overview

### The Intent
The system is designed to:
1. Automatically create daily "sessions" for each site that has active devices
2. Track device wake-ups and image captures within those sessions
3. Link device-captured images to submissions automatically
4. Provide a clean UI for monitoring device activity per site/day

### The Implementation
- **Edge Function**: `auto_create_daily_sessions.ts` (exists but not scheduled)
- **Database Function**: `auto_create_daily_sessions()` (calls `fn_midnight_session_opener` for each site)
- **Per-Site Function**: `fn_midnight_session_opener(site_id)` (creates session for one site)
- **Table**: `site_device_sessions` (stores daily sessions per site)

---

## Issues Discovered

### Issue #1: No Sites or Devices to Process ❌
**Problem**: The diagnostic shows 0 active sites with devices
**Why Sessions Aren't Created**: The function has nothing to process

**Current State**:
```
✅ Found 0 active sites
⚠️  No sites with active programs found
⚠️  No devices assigned to sites
```

**Root Cause**: Either:
- No pilot programs created yet, OR
- No sites created under programs, OR
- No devices assigned to sites, OR
- Programs are not marked as "active"

### Issue #2: Enum Value Mismatch ❌
**Problem**: Function query uses `status IN ('active', 'in_progress')` but enum doesn't have `'in_progress'`
**Error**: `invalid input value for enum program_status_enum: "in_progress"`

**Location**: `20251111120003_auto_session_scheduler.sql` line 99:
```sql
WHERE p.status IN ('active', 'in_progress')
```

**Actual Enum Values**: Need to verify what values exist in `program_status_enum`

### Issue #3: Column Name Mismatch ❌
**Problem**: Diagnostic script queries `actual_wake_count` but column may not exist
**Error**: `column site_device_sessions.actual_wake_count does not exist`

**Need to verify**:
- What columns actually exist in `site_device_sessions`
- What the correct column name is (maybe `wake_count`?)

### Issue #4: Query Relationship Issue ❌
**Problem**: Device query fails due to ambiguous relationship
**Error**: `more than one relationship was found for 'devices' and 'sites'`

**Cause**: Multiple foreign keys between devices and sites:
- `devices.site_id` → `sites.site_id` (direct)
- `device_site_assignments` junction table

**Solution**: Need to explicitly specify which relationship to use in query

---

## Architecture Confusion

### The Problem with Current UI/UX
You mentioned: _"Right now, we have a strange session/submission UI for device oriented sites, and it's not a good experience"_

**What's Happening**:
1. Sessions are created in `site_device_sessions` table (for device tracking)
2. But submissions still use the old `submissions` table (for human field workers)
3. The UI tries to blend both concepts, creating confusion

**Two Different Workflows**:

| Aspect | Field Worker Workflow | Device Workflow |
|--------|----------------------|-----------------|
| Trigger | User clicks "New Submission" | Device wakes up automatically |
| Session Table | `submission_sessions` | `site_device_sessions` |
| Entry Point | SubmissionsPage → NewSubmissionPage | Device automatically sends data |
| Completion | User clicks "Complete" | Automatic on image receipt |
| UI | Rich form with observations | Monitoring dashboard |

**The Confusion**:
- DevicesPage shows "Device Sessions" (from `site_device_sessions`)
- SubmissionsPage shows "Submissions" (from `submissions`)
- Some submissions are device-generated, others are human
- No clear way to see "today's device session" for a site
- No clear workflow for when devices + humans work on same site

---

## Proposed Solutions

### Solution #1: Fix the Data (Immediate)

**Step 1: Verify Database State**
```sql
-- Check what program status values are allowed
SELECT
  enumlabel
FROM pg_enum
WHERE enumtypid = 'program_status_enum'::regtype;

-- Check site_device_sessions actual columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'site_device_sessions';

-- Check for test data
SELECT COUNT(*) FROM pilot_programs;
SELECT COUNT(*) FROM sites;
SELECT COUNT(*) FROM devices WHERE site_id IS NOT NULL;
```

**Step 2: Fix Enum Query**
Update `auto_session_scheduler.sql` to use only valid enum values:
```sql
WHERE p.status = 'active'  -- Remove 'in_progress' if it doesn't exist
```

**Step 3: Fix Column Name**
Update diagnostic script to use correct column name

**Step 4: Create Test Data**
- Create at least one active pilot program
- Create at least one site under that program
- Assign at least one device to that site
- Set device wake schedule (e.g., `0 8,16 * * *` for 8am and 4pm)

### Solution #2: Deploy & Schedule the Edge Function

**Option A: Manual Testing** (for now)
```bash
# Test RPC function directly in Supabase SQL Editor
SELECT auto_create_daily_sessions();
```

**Option B: External Cron** (recommended for production)
- Use cron-job.org or similar service
- Call the edge function URL daily at midnight UTC
- Endpoint: `https://YOUR_PROJECT.supabase.co/functions/v1/auto_create_daily_sessions`

**Option C: pg_cron** (if available in your Supabase instance)
```sql
SELECT cron.schedule(
  'auto-create-device-sessions-daily',
  '0 0 * * *',
  $$ SELECT auto_create_daily_sessions(); $$
);
```

### Solution #3: Improve the UI/UX (After Data Fixed)

**Concept: Unified Session View**

**HomePage for Device-Enabled Sites**:
```
┌───────────────────────────────────────────────────┐
│ Today's Session - Site Alpha                      │
├───────────────────────────────────────────────────┤
│  📅 Nov 17, 2025                                  │
│  🤖 Devices: 3 active, 2 checked in               │
│  📸 Images: 12/18 expected                        │
│  ✅ Human Submissions: 2 completed                │
│                                                    │
│  [View Device Activity]  [Add Manual Submission]  │
└───────────────────────────────────────────────────┘
```

**New "Lab" or "Monitoring" Page**:
- Dedicated view for device sessions
- Shows all sites with devices
- Real-time device status
- Image capture timeline
- No mixing with human submission workflow

**SubmissionsPage**:
- Keep focused on human-created submissions
- Add filter: "Show device submissions" (optional)
- Clear badge/icon for device-generated vs human

**Device-Generated Submissions**:
- Read-only by default (can't edit device data)
- Clear visual indicator (robot icon?)
- Link to device session for context
- Show device MAC, capture time, environmental data

---

## Next Steps (Prioritized)

1. **[IMMEDIATE]** Run diagnostic to verify enum values and column names
2. **[IMMEDIATE]** Create test program, site, and assign a device
3. **[SHORT TERM]** Fix enum query in migration (if needed)
4. **[SHORT TERM]** Test manual session creation with `SELECT auto_create_daily_sessions();`
5. **[SHORT TERM]** Set up external cron to call edge function daily
6. **[MEDIUM TERM]** Build dedicated Lab/Monitoring UI for device sessions
7. **[MEDIUM TERM]** Separate device submissions from human submissions in UI
8. **[LONG TERM]** Consider merging sessions or keeping them separate with clear UX

---

## Questions to Answer

1. **Should device sessions and human submissions be in the same table?**
   - Pros: Unified view of all site activity
   - Cons: Different workflows, different completion logic

2. **Should the UI show them together or separately?**
   - Current: Mixed (causing confusion)
   - Proposal: Separate Lab page for device monitoring

3. **What happens when a site has both devices AND human workers?**
   - Does one session represent both?
   - Or separate sessions for each workflow type?
   - How do they link together?

4. **What's the scheduling strategy?**
   - Run auto-session function once daily at midnight UTC?
   - Or run hourly with timezone-aware logic?
   - Current: `auto_create_daily_sessions()` (simple) vs `auto_create_daily_sessions_timezone_aware()` (complex)

---

## Testing Checklist

- [ ] Verify `program_status_enum` values
- [ ] Verify `site_device_sessions` column names
- [ ] Create test pilot program (status='active')
- [ ] Create test site under program
- [ ] Create test device with MAC address
- [ ] Assign device to site (through DeviceSetupWizard)
- [ ] Set device wake schedule (e.g., `0 8 * * *`)
- [ ] Run `SELECT auto_create_daily_sessions();` manually
- [ ] Verify session created in `site_device_sessions`
- [ ] Test device image upload creates observation
- [ ] Verify device submission linked to session
- [ ] Check if session `status` updates correctly
- [ ] Test edge function via HTTP call
- [ ] Verify RLS policies allow access to sessions
- [ ] Test UI displays sessions correctly

---

**END OF ANALYSIS**
