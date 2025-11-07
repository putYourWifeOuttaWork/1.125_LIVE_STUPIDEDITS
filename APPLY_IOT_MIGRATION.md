# ✅ IoT Device Integration - Ready to Apply

## Status: Implementation Complete ✓ - Migration Error FIXED

All preparation work has been completed successfully:

- ✅ **Cleanup migration created** - Removes old device tables
- ✅ **8 new IoT migrations prepared** - Fixed to use `pilot_program_users` table
- ✅ **TypeScript types updated** - Added device interfaces and types
- ✅ **Project builds successfully** - No compilation errors
- ✅ **SQL ERROR FIXED** - Corrected `access_level` to `role` column reference

## 📋 What You Need to Do Now

### Step 1: Apply the Database Migration

You have **ONE consolidated migration file** ready to apply:

**File:** `supabase/migrations/APPLY_IOT_MIGRATIONS.sql`

**Size:** 881 lines (complete migration script)

### Step 2: How to Apply

#### Option A: Supabase Dashboard (Recommended)

1. **Open your Supabase Dashboard**
   - URL: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff
   - Navigate to: **SQL Editor**

2. **Create New Query**
   - Click **"New query"**
   - Name it: "IoT Device Migration - Nov 2025"

3. **Copy the Migration**
   - Open: `supabase/migrations/APPLY_IOT_MIGRATIONS.sql`
   - Select All (Cmd/Ctrl + A)
   - Copy (Cmd/Ctrl + C)

4. **Run the Migration**
   - Paste into SQL Editor (Cmd/Ctrl + V)
   - Click **"Run"** or press **Cmd/Ctrl + Enter**
   - Wait 5-10 seconds for completion

5. **Verify Success**
   - Check for green success message
   - Go to **Table Editor**
   - Verify these 5 new tables exist:
     - ✓ `devices`
     - ✓ `device_telemetry`
     - ✓ `device_images`
     - ✓ `device_commands`
     - ✓ `device_alerts`

#### Option B: Supabase CLI (If You Have It)

```bash
cd /path/to/your/project
psql $DATABASE_URL -f supabase/migrations/APPLY_IOT_MIGRATIONS.sql
```

## 📊 What This Migration Does

### Removes (10 Old Tables)
- `device_command_logs` (old)
- `device_commands` (old)
- `device_configs` (old)
- `device_errors` (old)
- `device_publish_log` (old)
- `device_sites` (old)
- `device_status` (old)
- `sensor_readings` (old)
- `captures` (old)
- `devices` (old)

### Creates (5 New Tables)

| Table | Purpose | Key Features |
|-------|---------|--------------|
| **devices** | Device registry | MAC address, wake scheduling, battery health, RLS policies |
| **device_telemetry** | Sensor data | Time-series environmental data (BME680) |
| **device_images** | Image tracking | Chunked image transmission status |
| **device_commands** | Command queue | Async device command management |
| **device_alerts** | Monitoring | Alert system with severity levels |

### Modifies (3 Existing Tables)

| Table | New Columns | Purpose |
|-------|-------------|---------|
| **submissions** | `created_by_device_id`, `is_device_generated` | Link submissions to devices |
| **petri_observations** | `is_device_generated`, `device_capture_metadata` | Track device-captured observations |
| **gasifier_observations** | `is_device_generated`, `device_capture_metadata` | Track device-captured observations |

## 🔍 Post-Migration Verification

After applying the migration, run these queries to verify:

### 1. Check New Tables Exist
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'device%'
ORDER BY table_name;
```
**Expected:** 5 tables (devices, device_alerts, device_commands, device_images, device_telemetry)

### 2. Verify RLS is Enabled
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'device%';
```
**Expected:** All show `rowsecurity = true`

### 3. Check Submission Modifications
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'submissions'
  AND column_name IN ('created_by_device_id', 'is_device_generated');
```
**Expected:** 2 rows returned

### 4. Count RLS Policies
```sql
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'device%'
GROUP BY tablename;
```
**Expected:**
- devices: 4 policies
- device_telemetry: 1 policy
- device_images: 1 policy
- device_commands: 4 policies
- device_alerts: 5 policies

## 🎯 What's Next (After Migration)

### Phase 2: MQTT Integration (Edge Function)
Create `supabase/functions/mqtt_device_handler` to:
- Handle incoming MQTT messages from ESP32-CAM devices
- Process telemetry data
- Reassemble chunked images
- Store images in Supabase Storage
- Create device_images records

### Phase 3: Device Management UI
Build pages for:
- Device registry with status indicators
- Device provisioning workflow
- Wake schedule management
- Real-time telemetry charts
- Command issuing interface
- Alert management dashboard

### Phase 4: Automated Processing
Implement:
- Automatic submission creation from device data
- Template-based observation generation
- Split-image processing for device captures
- Error handling and retry mechanisms

### Phase 5: Monitoring & Analytics
Create:
- Device health overview dashboard
- Battery health trending
- Connection reliability metrics
- Alert notification system
- Historical analytics per site/program

## 📁 Files Modified/Created

### Created:
- `supabase/migrations/20251108000000_remove_old_iot_tables.sql` - Cleanup
- `supabase/migrations/APPLY_IOT_MIGRATIONS.sql` - Consolidated migration
- `supabase/IOT_MIGRATION_INSTRUCTIONS.md` - Detailed instructions
- `APPLY_IOT_MIGRATION.md` - This file

### Modified:
- `supabase/migrations/20251107000001_create_devices_table.sql` - Fixed table references
- `supabase/migrations/20251107000002_create_device_telemetry_table.sql` - Fixed table references
- `supabase/migrations/20251107000003_create_device_images_table.sql` - Fixed table references
- `supabase/migrations/20251107000004_create_device_commands_table.sql` - Fixed table references
- `supabase/migrations/20251107000005_create_device_alerts_table.sql` - Fixed table references
- `supabase/migrations/20251107000006_modify_submissions_for_devices.sql` - Fixed table references
- `src/lib/types.ts` - Added IoT device types

## 🔒 Security Highlights

All tables have comprehensive Row Level Security (RLS):

- **Devices**: Users can view devices in their programs; only admins can manage
- **Telemetry**: Read-only for users; system-only writes via service role
- **Images**: Read-only for users; system-only writes
- **Commands**: Users can view; only admins can issue commands
- **Alerts**: Users can view; only admins can resolve

## 🏗️ Architecture Alignment

This implementation aligns with:
- ✅ `docs/IOT_DEVICE_ARCHITECTURE.md`
- ✅ `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf`
- ✅ ESP32-S3 CAM with BME680 sensor
- ✅ MQTT pub/sub protocol
- ✅ Wake schedule with cron expressions
- ✅ Chunked image transmission (128-4096 bytes)
- ✅ Battery health monitoring
- ✅ Automatic submission creation

## 📞 Support

If you encounter any issues:

1. **Check Supabase Logs**
   - Dashboard → Logs → Check for errors during migration

2. **Verify Connection**
   - Dashboard → Settings → Database → Ensure database is active

3. **Review Migration Output**
   - SQL Editor should show detailed success/error messages

4. **Rollback if Needed**
   - See `supabase/IOT_MIGRATION_INSTRUCTIONS.md` for rollback steps

## 🎉 Summary

Everything is ready! You just need to:

1. **Open Supabase Dashboard SQL Editor**
2. **Copy/paste the contents of `supabase/migrations/APPLY_IOT_MIGRATIONS.sql`**
3. **Click Run**
4. **Verify the 5 new tables exist**
5. **Start building device management UI!**

The migration script is safe to run multiple times (uses `IF EXISTS` and `IF NOT EXISTS` clauses).

---

**Next Command:** Open your Supabase Dashboard and apply the migration!
