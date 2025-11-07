# IoT Device Integration - Migration Instructions

## Overview
This migration removes the old IoT device infrastructure and implements a new cohesive architecture designed for ESP32-CAM devices with MQTT communication.

## What This Migration Does

### 1. Removes Old Tables (10 tables)
- `device_command_logs`
- `device_commands`
- `device_configs`
- `device_errors`
- `device_publish_log`
- `device_sites`
- `device_status`
- `sensor_readings`
- `captures`
- `devices`

### 2. Creates New Tables (5 tables)
- `devices` - Device registry with MAC addresses, wake scheduling, battery health
- `device_telemetry` - Time-series environmental sensor data (BME680)
- `device_images` - Chunked image transmission tracking
- `device_commands` - Async command queue for device management
- `device_alerts` - Monitoring and alerting system

### 3. Modifies Existing Tables (3 tables)
- `submissions` - Adds device creator fields and flags
- `petri_observations` - Adds device generation metadata
- `gasifier_observations` - Adds device generation metadata

## Migration File
The complete migration is in: `supabase/migrations/APPLY_IOT_MIGRATIONS.sql`

## How to Apply

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff
   - Go to: SQL Editor

2. **Create New Query**
   - Click "New query"
   - Name it: "IoT Device Migration"

3. **Copy Migration Script**
   - Open: `supabase/migrations/APPLY_IOT_MIGRATIONS.sql`
   - Copy the entire contents (881 lines)

4. **Paste and Run**
   - Paste into the SQL Editor
   - Click "Run" or press Cmd/Ctrl + Enter
   - Wait for completion (should take 5-10 seconds)

5. **Verify Success**
   - Check for success message
   - Go to: Table Editor
   - Confirm new tables exist:
     - devices
     - device_telemetry
     - device_images
     - device_commands
     - device_alerts
   - Confirm old tables are gone:
     - captures (old)
     - device_configs (old)
     - etc.

### Option 2: Supabase CLI (If Installed Locally)

```bash
# Navigate to project root
cd /path/to/project

# Apply migration
supabase db push

# Or apply specific file
psql $DATABASE_URL -f supabase/migrations/APPLY_IOT_MIGRATIONS.sql
```

## Post-Migration Verification

### 1. Check Table Structure
```sql
-- Verify devices table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'devices'
ORDER BY ordinal_position;

-- Count tables
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'device%';
-- Expected: 5 tables
```

### 2. Check Foreign Keys
```sql
-- Verify foreign key relationships
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name LIKE 'device%';
```

### 3. Check RLS Policies
```sql
-- Verify RLS is enabled on all device tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'device%';
-- All should show rowsecurity = true

-- Count policies
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename LIKE 'device%'
GROUP BY tablename;
```

### 4. Check Submissions Table Modifications
```sql
-- Verify new columns exist in submissions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'submissions'
AND column_name IN ('created_by_device_id', 'is_device_generated');
```

## Expected Results

### New Tables Created
| Table | Rows (Initial) | RLS Enabled | Policies |
|-------|----------------|-------------|----------|
| devices | 0 | Yes | 4 |
| device_telemetry | 0 | Yes | 1 |
| device_images | 0 | Yes | 1 |
| device_commands | 0 | Yes | 4 |
| device_alerts | 0 | Yes | 5 |

### Modified Tables
| Table | New Columns | Constraints Added |
|-------|-------------|-------------------|
| submissions | created_by_device_id, is_device_generated | Check constraint (user XOR device) |
| petri_observations | is_device_generated, device_capture_metadata | None |
| gasifier_observations | is_device_generated, device_capture_metadata | None |

## Rollback (If Needed)

If something goes wrong, you can rollback by:

1. **Re-create old tables** (if you have a backup)
2. **Or remove new tables**:
```sql
DROP TABLE IF EXISTS device_alerts CASCADE;
DROP TABLE IF EXISTS device_commands CASCADE;
DROP TABLE IF EXISTS device_images CASCADE;
DROP TABLE IF EXISTS device_telemetry CASCADE;
DROP TABLE IF EXISTS devices CASCADE;

-- Remove columns from submissions
ALTER TABLE submissions
DROP COLUMN IF EXISTS created_by_device_id,
DROP COLUMN IF EXISTS is_device_generated;

-- Remove columns from petri_observations
ALTER TABLE petri_observations
DROP COLUMN IF EXISTS is_device_generated,
DROP COLUMN IF EXISTS device_capture_metadata;

-- Remove columns from gasifier_observations
ALTER TABLE gasifier_observations
DROP COLUMN IF EXISTS is_device_generated,
DROP COLUMN IF EXISTS device_capture_metadata;
```

## Troubleshooting

### Error: "relation does not exist"
- **Cause**: Old tables already removed or never existed
- **Solution**: Continue with migration, `IF EXISTS` clauses will handle it

### Error: "foreign key constraint violation"
- **Cause**: Data exists that references tables being dropped
- **Solution**: Use `CASCADE` (already included) or manually clear referencing data

### Error: "column already exists"
- **Cause**: Migration partially applied before
- **Solution**: Check which tables exist, remove duplicates, re-run

### Error: "permission denied"
- **Cause**: Insufficient database permissions
- **Solution**: Run as database owner or user with SUPERUSER role

## Next Steps After Migration

1. **Update TypeScript Types** - Add interfaces for new device tables
2. **Build Device Management UI** - Create pages for device registry, monitoring
3. **Implement MQTT Integration** - Create Edge Function for MQTT message handling
4. **Test Device Provisioning** - Register a test device and verify RLS policies
5. **Create Device Monitoring Dashboard** - Build real-time telemetry visualization

## Architecture Alignment

This migration aligns with the architecture documented in:
- `docs/IOT_DEVICE_ARCHITECTURE.md`
- `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf`

The new schema supports:
- MQTT pub/sub communication
- Wake schedule management (cron expressions)
- Battery health monitoring
- Chunked image transmission
- Async command delivery
- Comprehensive alerting system
- Device-to-site associations
- Automatic submission creation from device data

## Support

If you encounter issues:
1. Check Supabase logs in Dashboard → Logs
2. Verify database connection in Dashboard → Settings → Database
3. Review RLS policies in Dashboard → Authentication → Policies
4. Check project status in Dashboard → Project Settings
