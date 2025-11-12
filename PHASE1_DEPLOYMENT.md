# Phase 1 Deployment Runbook

**Telemetry Foundations + Zone Tracking + Alert Infrastructure**

This runbook provides step-by-step instructions for deploying Phase 1 enhancements to production.

---

## **Pre-Deployment Checklist**

- [ ] Backup current database schema
- [ ] Verify Supabase connection credentials in `.env`
- [ ] Ensure you have admin access to Supabase dashboard
- [ ] Notify team of deployment window (if applicable)

---

## **Part 1: Database Migrations**

### **Step 1: Apply Phase 1 Schema Migration**

This migration adds:
- Device zone tracking (zone_id, zone_label, placement_json)
- Site zones configuration
- company_alert_prefs table
- report_subscriptions table
- site_snapshots enhancements
- device_telemetry company_id with backfill

```bash
# Navigate to project root
cd /tmp/cc-agent/51386994/project

# Apply migration 1 - Schema changes
supabase db push --file supabase/migrations/20251113000000_phase1_telemetry_zones_alerts.sql
```

**Expected Output:**
```
✅ Added column devices.zone_id
✅ Added column devices.zone_label
✅ Added column devices.placement_json
✅ Added column sites.zones
✅ Created table company_alert_prefs
✅ Created table report_subscriptions
✅ Added column device_telemetry.company_id
✅ Backfilled device_telemetry.company_id
✅ Created view vw_device_zones
```

**Verification:**
```sql
-- Verify devices table has new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'devices'
AND column_name IN ('zone_id', 'zone_label', 'placement_json');

-- Verify company_alert_prefs exists
SELECT COUNT(*) FROM company_alert_prefs;

-- Verify device_telemetry has company_id
SELECT COUNT(*) FROM device_telemetry WHERE company_id IS NOT NULL;
```

---

### **Step 2: Apply RPC Functions Migration**

This migration creates:
- fn_get_company_alert_prefs - Retrieve preferences with defaults
- fn_set_company_alert_prefs - Update preferences
- fn_evaluate_threshold - Helper for threshold evaluation

```bash
# Apply migration 2 - RPC functions
supabase db push --file supabase/migrations/20251113000001_rpc_alert_prefs.sql
```

**Expected Output:**
```
✅ Created function fn_get_company_alert_prefs
✅ Created function fn_set_company_alert_prefs
✅ Created function fn_evaluate_threshold
```

**Verification:**
```sql
-- Test RPC function (replace with your actual company_id)
SELECT fn_get_company_alert_prefs('YOUR_COMPANY_ID_HERE');

-- Should return JSON with thresholds, channels, and defaults
```

---

## **Part 2: Edge Function Deployment**

### **Step 3: Deploy MQTT Handler**

Deploy the updated MQTT handler with telemetry-only support:

```bash
# Deploy mqtt_device_handler edge function
supabase functions deploy mqtt_device_handler
```

**Expected Output:**
```
✅ mqtt_device_handler deployed successfully
Function URL: https://YOUR_PROJECT.supabase.co/functions/v1/mqtt_device_handler
```

**Verification:**
```bash
# Test health endpoint
curl https://YOUR_PROJECT.supabase.co/functions/v1/mqtt_device_handler

# Expected response includes:
# {
#   "success": true,
#   "version": "3.2.0",
#   "telemetry_only_supported": true
# }
```

---

## **Part 3: UI Deployment**

### **Step 4: Update Frontend Routes**

Add the new CompanyAlertPrefs route to your routing configuration:

**File: `src/App.tsx` (or your routing file)**

Add this route (super-admin only):
```tsx
<Route path="/lab/admin/prefs" element={
  <RequireSuperAdmin>
    <CompanyAlertPrefs />
  </RequireSuperAdmin>
} />
```

### **Step 5: Build and Deploy Frontend**

```bash
# Run build
npm run build

# Verify build completes without errors
# Expected: Build successful, no TypeScript errors

# Deploy to your hosting platform (example: Vercel)
# vercel --prod

# OR for manual deployment, upload dist/ folder to your hosting
```

---

## **Part 4: Testing & Verification**

### **Step 6: Test Telemetry Ingestion**

Use the provided test script to publish telemetry messages:

```bash
# Test normal telemetry
node test/telemetry_publish.mjs AA:BB:CC:DD:EE:FF normal

# Test high temperature alert
node test/telemetry_publish.mjs AA:BB:CC:DD:EE:FF high_temp

# Test critical humidity alert
node test/telemetry_publish.mjs AA:BB:CC:DD:EE:FF critical_rh
```

**Note:** Replace `AA:BB:CC:DD:EE:FF` with an actual device MAC from your database.

**Verification Steps:**
1. Check database:
   ```sql
   SELECT * FROM device_telemetry ORDER BY captured_at DESC LIMIT 5;
   ```

2. Verify company_id is populated correctly

3. Open IngestFeed UI at `/lab/ingest-feed`

4. Click "Telemetry" filter chip

5. Verify telemetry events appear in real-time

---

### **Step 7: Test Alert Preferences UI**

1. Log in as super-admin

2. Navigate to `/lab/admin/prefs`

3. Verify **Thresholds** tab loads with default values

4. Edit thresholds JSON (e.g., change temp_max to 42)

5. Click "Save Preferences"

6. Verify success toast message

7. Switch to **Channels & Quiet Hours** tab

8. Edit channels JSON (e.g., add email address)

9. Click "Save Preferences"

10. Refresh page and verify changes persisted

---

## **Part 5: Full System Verification**

### **Comprehensive Checklist**

- [ ] Database migrations applied successfully
- [ ] No migration errors in Supabase logs
- [ ] RPC functions callable (test with SQL)
- [ ] MQTT handler health endpoint returns `telemetry_only_supported: true`
- [ ] Test telemetry script creates rows in `device_telemetry`
- [ ] IngestFeed page loads without errors
- [ ] Telemetry filter chip functional
- [ ] Telemetry events display correctly (device name, site, temp, RH)
- [ ] CompanyAlertPrefs page accessible to super-admin
- [ ] Thresholds tab editable and saveable
- [ ] Channels tab editable and saveable
- [ ] Changes persist after page refresh
- [ ] vw_device_zones view returns data
- [ ] Frontend build has no TypeScript errors
- [ ] All existing features still work (no regressions)

---

## **Rollback Procedure** (If Needed)

If critical issues arise, follow this rollback procedure:

### **1. Revert Database Migrations**

```sql
-- Drop new tables
DROP TABLE IF EXISTS public.report_subscriptions CASCADE;
DROP TABLE IF EXISTS public.company_alert_prefs CASCADE;

-- Drop new view
DROP VIEW IF EXISTS public.vw_device_zones CASCADE;

-- Remove device columns
ALTER TABLE public.devices DROP COLUMN IF EXISTS placement_json;
ALTER TABLE public.devices DROP COLUMN IF EXISTS zone_label;
ALTER TABLE public.devices DROP COLUMN IF EXISTS zone_id;

-- Remove site column
ALTER TABLE public.sites DROP COLUMN IF EXISTS zones;

-- Remove telemetry column
ALTER TABLE public.device_telemetry DROP COLUMN IF EXISTS company_id;

-- Drop RPC functions
DROP FUNCTION IF EXISTS public.fn_get_company_alert_prefs CASCADE;
DROP FUNCTION IF EXISTS public.fn_set_company_alert_prefs CASCADE;
DROP FUNCTION IF EXISTS public.fn_evaluate_threshold CASCADE;
```

### **2. Revert Edge Function**

```bash
# Redeploy previous version from git
git checkout HEAD~1 supabase/functions/mqtt_device_handler/
supabase functions deploy mqtt_device_handler
```

### **3. Revert Frontend**

```bash
# Checkout previous version
git checkout HEAD~1 src/pages/lab/IngestFeed.tsx
git checkout HEAD~1 src/pages/lab/admin/

# Rebuild and redeploy
npm run build
# Deploy to hosting
```

---

## **Post-Deployment Monitoring**

### **What to Monitor (First 24 Hours)**

1. **Device Telemetry Ingestion**
   ```sql
   -- Monitor telemetry insertion rate
   SELECT DATE_TRUNC('hour', captured_at) AS hour, COUNT(*) as count
   FROM device_telemetry
   WHERE captured_at > NOW() - INTERVAL '24 hours'
   GROUP BY hour
   ORDER BY hour DESC;
   ```

2. **Error Logs**
   ```sql
   -- Check for edge function errors
   SELECT * FROM async_error_logs
   WHERE created_at > NOW() - INTERVAL '24 hours'
   AND function_name IN ('handleTelemetryOnly', 'handleMetadata')
   ORDER BY created_at DESC;
   ```

3. **MQTT Handler Health**
   - Check edge function logs in Supabase dashboard
   - Verify `connected: true` in health endpoint response

4. **Alert Preferences Usage**
   ```sql
   -- Check if companies are configuring prefs
   SELECT COUNT(*) FROM company_alert_prefs;
   ```

---

## **Phase 1 Success Criteria**

✅ **Phase 1 is successful when:**

1. Telemetry-only messages are ingested without creating device_images
2. Device placement can be tracked with X,Y coordinates
3. Site zones can be configured
4. Company alert preferences can be set and retrieved
5. IngestFeed shows telemetry events in real-time
6. CompanyAlertPrefs UI allows threshold configuration
7. No regressions in existing device submission flow
8. All tests pass (manual + automated)

---

## **Next Steps (Phase 2)**

After Phase 1 is stable, Phase 2 will add:

- Alert generation engine (background worker)
- MGI image scoring with Roboflow integration
- Email/SMS notification delivery
- Velocity and speed calculations for MGI/temp/RH
- Zone-based analytics dashboard
- Automated report generation

---

## **Support & Troubleshooting**

### **Common Issues**

**Issue: Telemetry not appearing in IngestFeed**
- Check device MAC is registered in database
- Verify device has complete lineage (device → site → program → company)
- Check edge function logs for errors
- Verify MQTT broker connectivity

**Issue: RPC functions return access denied**
- Verify user has company_admin or super_admin role
- Check user's company_id matches target company
- Review RLS policies on company_alert_prefs table

**Issue: JSON validation errors in CompanyAlertPrefs**
- Ensure JSON is properly formatted (no trailing commas)
- Verify all required fields are present
- Check browser console for detailed error messages

---

## **Deployment Log Template**

Copy this template to track your deployment:

```
PHASE 1 DEPLOYMENT LOG
Date: _______________
Deployed by: _______________

✅ Step 1: Schema migration applied
   Time: _______
   Notes: _______________________________________

✅ Step 2: RPC functions migration applied
   Time: _______
   Notes: _______________________________________

✅ Step 3: MQTT handler deployed
   Time: _______
   Function URL: _______________________________________

✅ Step 4: Frontend routes updated
   Time: _______

✅ Step 5: Frontend built and deployed
   Time: _______
   Hosting URL: _______________________________________

✅ Step 6: Telemetry test completed
   Time: _______
   Test devices: _______________________________________

✅ Step 7: Alert prefs UI tested
   Time: _______

Completion Time: _______
Status: SUCCESS / ROLLBACK REQUIRED
Post-deployment monitoring started: YES / NO
```

---

**End of Phase 1 Deployment Runbook**

For questions or issues, refer to the implementation files:
- Database: `supabase/migrations/20251113000000_*.sql`
- Edge Function: `supabase/functions/mqtt_device_handler/`
- Frontend: `src/pages/lab/IngestFeed.tsx`, `src/pages/lab/admin/CompanyAlertPrefs.tsx`
- Tests: `test/telemetry_publish.mjs`
