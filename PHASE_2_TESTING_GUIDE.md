# Phase 2 Testing Guide

## What's Working Now (After Event Consolidation)

✅ **Device History Tracking** - Your original problem!
- Schedule changes automatically logged
- Wake sessions automatically logged
- Alerts automatically logged
- Commands automatically logged

✅ **Unified Event View**
- `device_events_unified` view combines all events
- Single query for complete device timeline

✅ **MGI Scoring Infrastructure**
- `device_images.mgi_score` column ready
- `mold_growth_velocity` and `mold_growth_speed` columns ready

---

## What Still Needs to be Applied

### **Phase 2 Analytics Infrastructure**

**File:** `supabase/migrations/20251116000005_phase2_device_analytics_infrastructure.sql`

**What it adds:**
1. Program/Site scoping to telemetry and images
2. Wake variance tracking (early/late wakes)
3. Device rollup statistics (total wakes, alerts, etc.)
4. Program expiry automation
5. Daily session auto-creation (pg_cron)

**Time:** 2 minutes to apply

---

## Testing Plan

### **Test 1: Schedule Change Tracking** ✅ READY NOW

**What to test:** Your original issue - schedule changes visible in history

**Steps:**
1. Go to any device detail page
2. Click "Edit" on wake schedule
3. Change schedule (e.g., from "0 8 * * *" to "0 9 * * *")
4. Save
5. Go to "History" tab

**Expected Result:**
```
ConfigurationChange | wake_schedule_updated
Wake schedule changed to: 0 9 * * * (effective: 2025-11-15)
```

**Status:** ✅ Should work now with event consolidation migration

---

### **Test 2: Device Events Unified View** ✅ READY NOW

**What to test:** Query all device events in one place

**Test Query:**
```sql
SELECT
  event_category,
  event_type,
  severity,
  description,
  event_timestamp
FROM device_events_unified
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY event_timestamp DESC
LIMIT 20;
```

**Expected Result:**
- Mix of WakeSession, ConfigurationChange, Alert, Command events
- Sorted chronologically
- All have proper severity and descriptions

**Status:** ✅ View created by event consolidation migration

---

### **Test 3: Wake Variance Tracking** ⏳ NEEDS PHASE 2 APPLIED

**What to test:** Track when devices wake early/late

**Steps:**
1. Apply Phase 2 migration (20251116000005)
2. Device wakes at unexpected time
3. Query device_wake_sessions:

```sql
SELECT
  wake_status,
  expected_wake_time,
  actual_wake_time,
  wake_time_variance_minutes
FROM device_wake_sessions
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY expected_wake_time DESC;
```

**Expected Result:**
- `wake_time_variance_minutes` shows difference
- Positive = late, Negative = early

**Status:** ⏳ Requires Phase 2 migration

---

### **Test 4: MGI Scoring** ✅ READY NOW

**What to test:** Mold Growth Index infrastructure

**Setup:**
1. Device captures image
2. Roboflow scores it (or manual test):

```sql
UPDATE device_images
SET
  mgi_score = 0.45,
  mold_growth_velocity = 0.02,
  mold_growth_speed = 1.5
WHERE image_id = 'YOUR_IMAGE_ID';
```

**Query:**
```sql
SELECT
  captured_at,
  mgi_score,
  mold_growth_velocity,
  mold_growth_speed
FROM device_images
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY captured_at DESC;
```

**Expected Result:**
- Scores visible
- Can calculate growth trends over time

**Status:** ✅ Columns exist, ready for Roboflow integration

---

### **Test 5: Device Rollup Stats** ⏳ NEEDS PHASE 2 APPLIED

**What to test:** Aggregate counters on devices table

**Steps:**
1. Apply Phase 2 migration
2. Check devices table:

```sql
SELECT
  device_code,
  total_wake_sessions,
  successful_wakes,
  failed_wakes,
  total_alerts,
  total_images_captured,
  last_wake_at
FROM devices
WHERE device_id = 'YOUR_DEVICE_ID';
```

**Expected Result:**
- Counters auto-increment with each event
- Quick dashboard stats without complex queries

**Status:** ⏳ Requires Phase 2 migration

---

### **Test 6: Auto Session Creation** ⏳ NEEDS PHASE 2 + PG_CRON

**What to test:** Daily site_device_sessions created automatically

**Setup:**
1. Apply Phase 2 migration
2. Enable pg_cron extension
3. Wait for midnight (or manually trigger)

**Verify:**
```sql
SELECT
  session_date,
  device_id,
  program_id,
  site_id
FROM site_device_sessions
WHERE session_date = CURRENT_DATE
AND device_id = 'YOUR_DEVICE_ID';
```

**Expected Result:**
- New session created at midnight
- Linked to active program/site

**Status:** ⏳ Requires Phase 2 + pg_cron setup

---

## Quick Test Checklist

### ✅ **Working Now (No additional migration needed)**
- [x] Schedule changes tracked in device_history
- [x] Wake sessions tracked in device_history
- [x] Unified device_events_unified view
- [x] MGI scoring columns exist

### ⏳ **Needs Phase 2 Migration**
- [ ] Program/site scoping on telemetry
- [ ] Program/site scoping on images
- [ ] Wake variance tracking
- [ ] Device rollup statistics
- [ ] Auto session creation (also needs pg_cron)

---

## Apply Phase 2 Now? (2 minutes)

**File:** `supabase/migrations/20251116000005_phase2_device_analytics_infrastructure.sql`

1. Open Supabase Dashboard SQL Editor
2. Copy/paste entire file
3. Run

**This adds:**
- Analytics-ready structure
- Wake variance tracking
- Rollup counters
- Auto session creation

---

## What to Test First

**Immediate (already working):**
1. ✅ Test schedule change tracking (Test 1)
2. ✅ Test device events view (Test 2)
3. ✅ Test MGI columns exist (Test 4)

**After applying Phase 2:**
1. ⏳ Test wake variance (Test 3)
2. ⏳ Test rollup stats (Test 5)
3. ⏳ Setup pg_cron for auto sessions (Test 6)

---

**Want me to help you test specific features or apply Phase 2 migration?** 🚀
