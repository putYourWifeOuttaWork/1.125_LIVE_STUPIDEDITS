# APPLY PHASE 1 MIGRATIONS NOW

**Critical:** The UI expects these database columns, but they don't exist yet!

---

## **Quick Fix (2 minutes)**

### **Option 1: Supabase SQL Editor (Recommended)**

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
2. Copy and paste each migration file **in order**:

#### **Migration 1: Core Phase 1 Features**
```bash
# File: supabase/migrations/20251113000000_phase1_telemetry_zones_alerts.sql
```

#### **Migration 2: Alert Preference RPCs**
```bash
# File: supabase/migrations/20251113000001_rpc_alert_prefs.sql
```

#### **Migration 3: MGI Scoring & Velocity**
```bash
# File: supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql
```

3. Click **"Run"** for each one
4. Check for errors in the output panel

---

## **Option 2: Command Line (If you have Supabase CLI)**

```bash
# Link to your project first
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push
```

---

## **Option 3: Direct SQL Execution**

If you prefer, I can show you the exact SQL to run. Just the device zone/placement part is:

```sql
-- Add zone columns to devices table
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS zone_id uuid NULL;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS zone_label text NULL;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS placement_json jsonb NOT NULL DEFAULT '{}';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_devices_zone_id ON public.devices(zone_id);
CREATE INDEX IF NOT EXISTS idx_devices_zone_label ON public.devices(zone_label);

-- Comments
COMMENT ON COLUMN public.devices.zone_id IS 'Optional zone identifier for spatial grouping within a site';
COMMENT ON COLUMN public.devices.zone_label IS 'Human-readable zone label (e.g., North Corner, Zone A, Room 101)';
COMMENT ON COLUMN public.devices.placement_json IS 'Device placement metadata: {x, y, height, notes}';
```

But the full migrations include much more (alert prefs, MGI scoring, etc.), so it's better to run all three.

---

## **What Each Migration Does**

### **Migration 1: phase1_telemetry_zones_alerts.sql**
- Adds `zone_id`, `zone_label`, `placement_json` to devices
- Creates `site_zones` table
- Creates `company_alert_prefs` table
- Creates `report_subscriptions` table
- Creates `site_snapshots` table for risk tracking
- Enhances `device_telemetry` with indexes

### **Migration 2: rpc_alert_prefs.sql**
- `fn_get_company_alert_prefs` - Get alert preferences
- `fn_upsert_company_alert_pref` - Update alert preferences
- `fn_get_zone_alert_summary` - Zone-based alerts

### **Migration 3: mgi_scoring_and_velocity.sql**
- Adds `mgi_score`, `mgi_confidence`, `mgi_scored_at` to petri_observations
- `fn_calculate_mgi_velocity` - Velocity calculations
- `fn_get_zone_mgi_averages` - Zone MGI stats
- Auto-scoring trigger for Roboflow integration
- `vw_mgi_trends` view

---

## **Verification**

After applying, verify with:

```sql
-- Check devices columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'devices'
AND column_name IN ('zone_id', 'zone_label', 'placement_json')
ORDER BY column_name;

-- Should return 3 rows
```

---

## **Need Help?**

If you encounter errors:
1. Copy the error message
2. Check if column already exists (may just be a notice)
3. Look for "ERROR" vs "NOTICE" in output
4. All migrations are idempotent (safe to re-run)

---

**Once applied, the device edit modal will work correctly!** ✅
