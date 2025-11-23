# ✅ Assignment Card Fixed - Now Queries Junction Tables

## Issue Identified

You were correct - the Assignment card was **still showing wrong data** even after the migration!

### Root Cause
The `useDevice` hook was querying the `devices` table directly using foreign keys:
```typescript
// OLD CODE - WRONG
sites:site_id (...)          // Uses devices.site_id
pilot_programs:program_id (...) // Uses devices.program_id
```

But the devices table is now just a **cached copy**. The junction tables are the **source of truth**!

---

## Fix Applied

Updated `src/hooks/useDevice.ts` to query **junction tables** instead:

### Before (Lines 174-192)
```typescript
const { data, error } = await supabase
  .from('devices')
  .select(`
    *,
    sites:site_id (...),           // ❌ Wrong - uses cached copy
    pilot_programs:program_id (...) // ❌ Wrong - uses cached copy
  `)
```

### After (Lines 174-231)
```typescript
// 1. Get device data
const { data: deviceData } = await supabase
  .from('devices')
  .select('*')
  .eq('device_id', deviceId)
  .maybeSingle();

// 2. Get active site assignment from JUNCTION TABLE (source of truth)
const { data: siteAssignment } = await supabase
  .from('device_site_assignments')  // ✅ Junction table
  .select(`
    site_id,
    program_id,
    sites:site_id (site_id, name, type, program_id)
  `)
  .eq('device_id', deviceId)
  .eq('is_active', true)            // ✅ Only active assignments
  .maybeSingle();

// 3. Get active program assignment from JUNCTION TABLE (source of truth)
const { data: programAssignment } = await supabase
  .from('device_program_assignments') // ✅ Junction table
  .select(`
    program_id,
    pilot_programs:program_id (program_id, name, company_id)
  `)
  .eq('device_id', deviceId)
  .eq('is_active', true)             // ✅ Only active assignments
  .maybeSingle();

// 4. Combine data
const data = {
  ...deviceData,
  sites: siteAssignment?.sites || null,
  pilot_programs: programAssignment?.pilot_programs || null
};
```

---

## What This Fixes

### Assignment Card Now Shows:
✅ **Correct site** from `device_site_assignments` (junction table)  
✅ **Correct program** from `device_program_assignments` (junction table)  
✅ **Only active assignments** (is_active = true)  
✅ **Real-time accuracy** - reflects junction table changes immediately

### Devices Table Cache Status:
- `devices.site_id` and `devices.program_id` are now **ignored** for display
- They're maintained by auto-sync triggers but **not used as source of truth**
- Assignment card queries junction tables directly

---

## Files Modified

**Frontend:**
- `src/hooks/useDevice.ts` - Updated to query junction tables ✅

**Build Status:**
- ✅ Compiles successfully in 17.09s with no errors

---

## Test It Now

1. **Refresh your browser** on the device detail page
2. **Assignment card** should now show "IoT Test Site 2" (correct)
3. **Program** should match the junction table assignment
4. Try **reassigning** a device - card will update immediately

---

## Why This Matters

### Before This Fix:
- Assignment card showed cached data from devices table
- Could be stale or incorrect after Site Template assignments
- Junction tables had correct data but weren't being displayed

### After This Fix:
- Assignment card queries junction tables directly
- Always shows current, accurate assignment
- Respects is_active flag for proper multi-assignment handling
- Fully aligned with Phase 1 junction table architecture

---

## Complete Solution Summary

We've now fixed **both parts** of the assignment system:

1. ✅ **Migration** - Makes junction tables source of truth (backend)
2. ✅ **useDevice Hook** - Queries junction tables for display (frontend)

**The Assignment card should now show correct data!**
