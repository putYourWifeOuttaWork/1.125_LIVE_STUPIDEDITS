# Two Critical Fixes - November 22, 2025

## Issue #1: Device Images Context Inheritance ✅ FIXED

### Problem
Device images created WITHOUT `site_id`, `program_id`, `site_device_session_id`
- Only `company_id` was inherited
- Device HAS the correct context, but images didn't inherit it

### Root Cause
Function `populate_device_data_company_id()` only inherited `company_id`
Also tried to query `site_device_sessions.device_id` which doesn't exist

### Schema Reality Check
`site_device_sessions` table structure:
- `session_id` (PK)
- `company_id`
- `program_id`
- `site_id` ← Links to site, NOT device
- `session_date`
- `session_start_time`
- `session_end_time`
- `status` ('pending', 'in_progress', 'locked')
- **NO `device_id` column** - sessions are per-site, not per-device

### Fix Applied
**File:** `supabase/migrations/20251122120003_fix_device_images_context_inheritance.sql`

**Changes:**
1. Enhanced `populate_device_data_company_id()` to inherit:
   - `company_id` from device ✓ (was already working)
   - `site_id` from device ✓ (NEW)
   - `program_id` from device ✓ (NEW)
   - `site_device_session_id` from active session ✓ (NEW - fixed query)

2. Fixed session lookup to use `site_id` instead of non-existent `device_id`:
   ```sql
   SELECT session_id
   FROM site_device_sessions
   WHERE site_id = v_device_site_id  -- ✓ Correct
     AND status IN ('pending', 'in_progress')
     AND session_date = CURRENT_DATE
   ```

**Status:** Ready to apply in Supabase Dashboard

---

## Issue #2: Roboflow MGI Scoring Shows "failed" ✅ FIXED

### Problem
Roboflow returned valid response with MGI score:
```json
{
  "outputs": [{"MGI": "0.15"}],
  "profiler_trace": []
}
```

But edge function marked it as `"mgi_scoring_status": "failed"`

### Root Cause
Edge function expected response format:
```json
[{"MGI": "0.15"}]  ← Old format (array)
```

But Roboflow now returns:
```json
{"outputs": [{"MGI": "0.15"}], "profiler_trace": []}  ← New format (object with outputs)
```

Code was looking at `roboflowData[0]` but should look at `roboflowData.outputs[0]`

### Additional Bug
Edge function tried to update column `mgi_scored_at` but actual column name is `scored_at`

### Fix Applied
**File:** `supabase/functions/score_mgi_image/index.ts`

**Changes:**
1. Handle both response formats:
   ```typescript
   // Handle new format with outputs wrapper
   const outputs = roboflowData.outputs || roboflowData;

   if (Array.isArray(outputs) && outputs.length > 0) {
     const firstResult = outputs[0] as RoboflowResult;
     if (firstResult.MGI !== undefined) {
       mgiScore = parseFloat(firstResult.MGI);
     }
   }
   ```

2. Fixed column name:
   ```typescript
   .update({
     mgi_score: mgiScore,
     scored_at: new Date().toISOString(),  // ✓ Correct column name
     mgi_scoring_status: 'complete',
     roboflow_response: roboflowData
   })
   ```

**Status:** Fixed in code, needs Supabase edge function redeployment

---

## Summary

### To Apply

1. **Context Inheritance Fix (Database)**
   - Copy `supabase/migrations/20251122120003_fix_device_images_context_inheritance.sql`
   - Paste in Supabase Dashboard → SQL Editor
   - Run migration
   - All NEW device_images will inherit full context

2. **Roboflow Fix (Edge Function)**
   - Edge function code already updated
   - Redeploy: `supabase functions deploy score_mgi_image`
   - Or copy updated code from `supabase/functions/score_mgi_image/index.ts` to Supabase Dashboard

### Testing After Fixes

1. Trigger a new device image upload
2. Verify device_images record has:
   - `site_id` populated ✓
   - `program_id` populated ✓
   - `site_device_session_id` populated (if session exists) ✓
3. Verify Roboflow scoring completes with:
   - `mgi_scoring_status: 'complete'` ✓
   - `mgi_score: 0.15` (or whatever value) ✓
   - `scored_at` populated ✓

---

## Architecture Notes

### Site Device Sessions
- Sessions are **per-site**, not per-device
- Multiple devices can participate in the same site session
- Session tracks wake counts across ALL devices at that site
- Link device_images to session via inherited `site_id`

### Context Inheritance Chain
```
devices table
  ↓ (inherit)
device_images table
  - company_id ← from device.company_id
  - site_id ← from device.site_id
  - program_id ← from device.program_id
  - site_device_session_id ← from active session matching device.site_id
```

Build: ✅ **SUCCESS** (17.07s)
