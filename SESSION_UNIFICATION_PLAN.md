# Session System Unification Plan

**Date:** 2025-11-17
**Status:** Plan Ready for Review & Implementation

---

## Current State Analysis

### Two Separate Session Systems

| Aspect | Human Sessions | Device Sessions |
|--------|---------------|-----------------|
| **Table** | `submission_sessions` | `site_device_sessions` |
| **Created By** | User clicks "New Submission" | Auto-created at midnight |
| **Duration** | User-controlled (claim → complete) | Fixed (00:00 - 23:59 local time) |
| **Status Field** | `session_status` (Unclaimed, Active, Completed) | `status` (in_progress, completed, locked) |
| **Locking** | Manual (user clicks complete) | Should auto-lock at midnight |
| **UI Component** | ActiveSessionsDrawer | DeviceSessionsView (separate) |
| **RPC Function** | `get_active_sessions_with_details()` | None (direct queries) |

### The Problems

1. **Old Sessions Not Locking** ✅ Identified
   - Nov 13 sessions still showing as "Active/in_progress"
   - No automatic locking mechanism

2. **Separate UIs** ✅ Identified
   - ActiveSessionsDrawer shows human sessions only
   - Device sessions have their own views
   - No unified "quick access" to all live sessions

3. **Function Not Scheduled** ✅ Identified
   - `auto_create_daily_sessions()` works but isn't scheduled
   - Won't run at midnight automatically

4. **RLS Confusion** ⚠️ Need to Verify
   - Super-admins should see ALL company sessions
   - Regular users should see their company sessions
   - Need to verify this works for device sessions

---

## Solution Architecture

### Phase 1: Auto-Locking System (PRIORITY 1)

**Goal:** Automatically lock sessions at end of day

#### For Human Sessions (`submission_sessions`)
```sql
CREATE OR REPLACE FUNCTION lock_expired_submission_sessions()
RETURNS JSONB AS $$
DECLARE
  v_locked_count INT := 0;
BEGIN
  -- Lock sessions that are still Active but session_date < today
  UPDATE submission_sessions
  SET session_status = 'Completed',
      updated_at = NOW()
  WHERE session_status = 'Active'
    AND session_date < CURRENT_DATE;

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'locked_count', v_locked_count,
    'type', 'submission_sessions'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### For Device Sessions (`site_device_sessions`)
```sql
CREATE OR REPLACE FUNCTION lock_expired_device_sessions()
RETURNS JSONB AS $$
DECLARE
  v_locked_count INT := 0;
  v_site RECORD;
BEGIN
  -- For each site, lock sessions where session_end_time < NOW()
  FOR v_site IN
    SELECT session_id, site_id, session_end_time
    FROM site_device_sessions
    WHERE status = 'in_progress'
      AND session_end_time < NOW()
  LOOP
    UPDATE site_device_sessions
    SET status = 'locked',
        updated_at = NOW()
    WHERE session_id = v_site.session_id;

    v_locked_count := v_locked_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'locked_count', v_locked_count,
    'type', 'device_sessions'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Combined Lock Function
```sql
CREATE OR REPLACE FUNCTION lock_all_expired_sessions()
RETURNS JSONB AS $$
DECLARE
  v_submission_result JSONB;
  v_device_result JSONB;
BEGIN
  v_submission_result := lock_expired_submission_sessions();
  v_device_result := lock_expired_device_sessions();

  RETURN jsonb_build_object(
    'success', true,
    'submission_sessions', v_submission_result,
    'device_sessions', v_device_result,
    'total_locked',
      (v_submission_result->>'locked_count')::INT +
      (v_device_result->>'locked_count')::INT
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 2: Unified Sessions Drawer (PRIORITY 2)

**Goal:** Single slide-out showing ALL active sessions (human + device)

#### New Unified RPC Function
```sql
CREATE OR REPLACE FUNCTION get_all_active_sessions_unified(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
  session_id UUID,
  session_type TEXT,  -- 'human' or 'device'
  session_date DATE,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  claimed_by_user_id UUID,
  claimed_by_name TEXT,
  expected_items INT,
  completed_items INT,
  progress_percent NUMERIC
) AS $$
BEGIN
  RETURN QUERY

  -- UNION of human and device sessions
  SELECT
    ss.session_id,
    'human'::TEXT as session_type,
    ss.session_date,
    ss.site_id,
    s.name as site_name,
    s.program_id,
    p.name as program_name,
    ss.session_status as status,
    ss.created_at as started_at,
    ss.claimed_by_user_id,
    u.full_name as claimed_by_name,
    0 as expected_items,  -- human sessions don't have expected count
    (SELECT COUNT(*) FROM submissions WHERE session_id = ss.session_id) as completed_items,
    0::NUMERIC as progress_percent
  FROM submission_sessions ss
  JOIN sites s ON ss.site_id = s.site_id
  JOIN pilot_programs p ON s.program_id = p.program_id
  LEFT JOIN users u ON ss.claimed_by_user_id = u.id
  WHERE ss.session_status IN ('Unclaimed', 'Active')
    AND (p_company_id IS NULL OR p.company_id = p_company_id)

  UNION ALL

  SELECT
    sds.session_id,
    'device'::TEXT as session_type,
    sds.session_date,
    sds.site_id,
    s.name as site_name,
    sds.program_id,
    p.name as program_name,
    sds.status,
    sds.session_start_time as started_at,
    NULL::UUID as claimed_by_user_id,
    'Auto (Device)'::TEXT as claimed_by_name,
    sds.expected_wake_count as expected_items,
    0 as completed_items,  -- TODO: count actual device submissions
    0::NUMERIC as progress_percent
  FROM site_device_sessions sds
  JOIN sites s ON sds.site_id = s.site_id
  JOIN pilot_programs p ON sds.program_id = p.program_id
  WHERE sds.status = 'in_progress'
    AND (p_company_id IS NULL OR p.company_id = p_company_id)

  ORDER BY started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Update ActiveSessionsDrawer Component
- Call new unified RPC function
- Show session type badge (Human 👤 / Device 🤖)
- Filter by company context (super-admin sees all, users see their company)
- Quick-switch between sessions
- Show appropriate details for each type

### Phase 3: Scheduling (PRIORITY 3)

**Goal:** Auto-run functions at midnight

#### Option A: Edge Function Wrapper
Create `/supabase/functions/midnight_jobs/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

Deno.serve(async (req) => {
  const results = {
    session_creation: null,
    session_locking: null
  };

  // 1. Create new sessions
  const { data: createData, error: createError } =
    await supabase.rpc('auto_create_daily_sessions');
  results.session_creation = createData || { error: createError?.message };

  // 2. Lock expired sessions
  const { data: lockData, error: lockError } =
    await supabase.rpc('lock_all_expired_sessions');
  results.session_locking = lockData || { error: lockError?.message };

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

#### Option B: External Cron (Recommended)
Use cron-job.org or similar:
- Schedule: `0 0 * * *` (midnight UTC)
- URL: `https://YOUR_PROJECT.supabase.co/functions/v1/midnight_jobs`
- Header: `Authorization: Bearer SERVICE_ROLE_KEY`

---

## Implementation Steps

### Step 1: Create Auto-Lock Functions ⏰
- [ ] Create `lock_expired_submission_sessions()`
- [ ] Create `lock_expired_device_sessions()`
- [ ] Create `lock_all_expired_sessions()` wrapper
- [ ] Test manually: `SELECT lock_all_expired_sessions();`
- [ ] Verify old Nov 13 sessions get locked

### Step 2: Create Unified Sessions RPC 🔗
- [ ] Create `get_all_active_sessions_unified()`
- [ ] Test with super-admin (should see all companies)
- [ ] Test with regular user (should see own company only)
- [ ] Add company_id parameter handling

### Step 3: Update ActiveSessionsDrawer UI 🎨
- [ ] Update to call new unified RPC
- [ ] Add session type badge (Human/Device)
- [ ] Add filtering by company (super-admin view)
- [ ] Test quick-switching between sessions
- [ ] Ensure RLS works correctly

### Step 4: Create Midnight Jobs Edge Function 🌙
- [ ] Create `midnight_jobs` edge function
- [ ] Combine session creation + locking
- [ ] Test locally
- [ ] Deploy to Supabase

### Step 5: Schedule Daily Execution ⏰
- [ ] Set up external cron (cron-job.org)
- [ ] Or configure pg_cron if available
- [ ] Test by manually triggering
- [ ] Monitor logs for first automatic run

### Step 6: Verify RLS Policies 🔒
- [ ] Test super-admin can see all company sessions
- [ ] Test regular user only sees their company
- [ ] Test device sessions follow same rules
- [ ] Update policies if needed

---

## RLS Policy Requirements

### For `site_device_sessions`

```sql
-- Super-admins see everything
CREATE POLICY "Super admins can view all device sessions"
  ON site_device_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.is_super_admin = true
    )
  );

-- Users see their company's sessions
CREATE POLICY "Users can view company device sessions"
  ON site_device_sessions FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );
```

### For `submission_sessions`
(Verify existing policies follow same pattern)

---

## Testing Checklist

- [ ] Old Nov 13 sessions get auto-locked
- [ ] New sessions created at midnight
- [ ] Sessions auto-lock at end of day
- [ ] Unified drawer shows both session types
- [ ] Super-admin sees all companies
- [ ] Regular users see only their company
- [ ] Quick-switch works between sessions
- [ ] Session type badges display correctly
- [ ] Progress tracking works for both types
- [ ] Edge function runs successfully
- [ ] Cron triggers at midnight UTC

---

## Open Questions

1. **Session Status Values:**
   - submission_sessions: `Unclaimed`, `Active`, `Completed`
   - site_device_sessions: `in_progress`, `completed`, `locked`
   - Should we unify these? Or keep separate?

2. **Locking vs Completing:**
   - Human sessions: User clicks "Complete"
   - Device sessions: Auto-locks at midnight
   - Should locked device sessions still be editable?

3. **Progress Tracking:**
   - How to count "completed_items" for device sessions?
   - Count submissions? Count device wake-ups? Count images?

4. **Timezone Handling:**
   - Currently midnight UTC creates all sessions
   - Should we use site-specific timezones?
   - Function `auto_create_daily_sessions_timezone_aware()` exists but not used

---

## Next Steps for User

Please review this plan and let me know:

1. **Priority Order:** Do you agree with Phase 1 → 2 → 3?
2. **Status Names:** Keep separate or unify `Active`/`in_progress`?
3. **Locking Behavior:** Should locked device sessions be read-only?
4. **Scheduling:** Prefer external cron or should I check if pg_cron is available?
5. **Progress Tracking:** How should we count device session progress?

Once approved, I'll implement in phases!
