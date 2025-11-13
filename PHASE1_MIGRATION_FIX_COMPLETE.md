# ✅ Phase 1 Migration Fixed

## **What Was Fixed**

The Phase 1 migrations had **2 critical bugs** with incorrect column names:

### **Bug 1: Wrong device_id column**
- ❌ `sub.device_id` (doesn't exist)
- ✅ `sub.created_by_device_id` (correct)

### **Bug 2: Wrong petri slot column**
- ❌ `po.slot_index` (doesn't exist)
- ✅ `po.order_index` (correct)

---

## **Changes Made**

### **File: `supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql`**

#### **Fix 1: Column Name - slot_index → order_index**
```sql
-- BEFORE (❌ BROKEN):
po.slot_index

-- AFTER (✅ FIXED):
po.order_index
```

**Fixed in 4 locations:**
- Line 98: fn_calculate_mgi_velocity SELECT
- Lines 111-113: LAG window functions (PARTITION BY)
- Line 285: vw_mgi_trends view

#### **Fix 2: vw_mgi_trends View (Line 297)**
```sql
-- BEFORE (❌ BROKEN):
INNER JOIN devices d ON d.device_id = sub.device_id

-- AFTER (✅ FIXED):
LEFT JOIN devices d ON d.device_id = sub.created_by_device_id
LEFT JOIN sites s ON s.site_id = COALESCE(d.site_id, sub.site_id)
LEFT JOIN pilot_programs p ON p.program_id = COALESCE(d.program_id, sub.program_id)
LEFT JOIN companies c ON c.company_id = COALESCE(p.company_id, sub.company_id)
```

**Why COALESCE?**
- Not all submissions are device-generated (`is_device_generated` flag)
- Some submissions have site_id/program_id directly, some through devices
- This handles both manual and device-generated submissions

#### **Fix 2: fn_get_zone_mgi_averages Function (Line 173)**
```sql
-- BEFORE (❌ BROKEN):
INNER JOIN submissions s ON s.device_id = d.device_id

-- AFTER (✅ FIXED):
INNER JOIN submissions s ON s.created_by_device_id = d.device_id
```

---

## **How to Apply**

### **Option 1: Apply All 3 Phase 1 Migrations**

Run these in order in Supabase SQL Editor:

1. **Telemetry, Zones, Alerts:**
   ```
   supabase/migrations/20251113000000_phase1_telemetry_zones_alerts.sql
   ```

2. **Alert Preferences RPC:**
   ```
   supabase/migrations/20251113000001_rpc_alert_prefs.sql
   ```

3. **MGI Scoring (FIXED):**
   ```
   supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql
   ```

### **Option 2: Quick Device Fields Only**

If you only need the device zone/placement columns for the immediate error fix:

```sql
-- Add device zone/placement columns
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS zone_id uuid NULL,
  ADD COLUMN IF NOT EXISTS zone_label text NULL,
  ADD COLUMN IF NOT EXISTS placement_json jsonb NOT NULL DEFAULT '{}';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_devices_zone_id ON public.devices(zone_id);
CREATE INDEX IF NOT EXISTS idx_devices_zone_label ON public.devices(zone_label);

-- Comments
COMMENT ON COLUMN public.devices.zone_id IS 'Optional zone identifier for spatial grouping';
COMMENT ON COLUMN public.devices.zone_label IS 'Human-readable zone label (e.g., North Corner)';
COMMENT ON COLUMN public.devices.placement_json IS 'Device placement metadata: {x, y, height, notes}';
```

---

## **What Phase 1 Adds**

After applying all 3 migrations, you'll have:

### **1. Device Zone & Placement Tracking**
- `devices.zone_id` - Links device to a zone
- `devices.zone_label` - Human-readable zone name
- `devices.placement_json` - X,Y coordinates and metadata

### **2. New Tables**
- `site_zones` - Define zones within sites
- `company_alert_prefs` - Threshold-based alert configuration
- `report_subscriptions` - User alert subscriptions
- `site_snapshots` - Risk level tracking over time

### **3. RPC Functions**
- `fn_get_company_alert_prefs()` - Get alert preferences
- `fn_upsert_company_alert_pref()` - Update alert preferences
- `fn_get_zone_alert_summary()` - Zone-based alert summaries

### **4. MGI Scoring (Roboflow Integration)**
- `petri_observations.mgi_score` - MGI score (0-4)
- `petri_observations.mgi_confidence` - Confidence level
- `petri_observations.mgi_scored_at` - Timestamp
- `fn_calculate_mgi_velocity()` - Velocity calculations
- `fn_get_zone_mgi_averages()` - Zone MGI statistics
- `vw_mgi_trends` - MGI trends view
- Auto-scoring trigger for Roboflow

---

## **Verification**

After applying, verify:

```sql
-- Check devices columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'devices'
AND column_name IN ('zone_id', 'zone_label', 'placement_json')
ORDER BY column_name;

-- Should return 3 rows

-- Check MGI columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'petri_observations'
AND column_name IN ('mgi_score', 'mgi_confidence', 'mgi_scored_at')
ORDER BY column_name;

-- Should return 3 rows

-- Check view exists
SELECT table_name FROM information_schema.views
WHERE table_name = 'vw_mgi_trends';

-- Should return 1 row
```

---

## **Next Steps**

1. ✅ Apply the fixed Phase 1 migrations
2. ⚠️ Fix the session creation issue (see `SESSION_CREATION_FIX_REQUIRED.md`)
3. 🎯 Test device zone/placement updates in UI
4. 🔬 Configure MGI scoring with Roboflow (optional)

---

## **Build Status**

✅ **All TypeScript builds pass with no errors**

---

**The migrations are now ready to apply!** 🚀
