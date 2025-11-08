# Fix Device Schema Error - Missing Columns

## Problem Summary

The error `column d.mapped_at does not exist` occurs because your devices table is missing 5 columns that are referenced in the migration file `20251108120000_add_junction_tables_and_codes.sql`.

## Current State (Verified)

**Devices Table:**
- ❌ Missing 5 required columns
- ✅ Has 21 columns total
- ✅ Has 1 existing device record

**Junction Tables:**
- ✅ Tables exist (`device_site_assignments`, `device_program_assignments`, `site_program_assignments`)
- ❌ All tables are EMPTY (0 records) because the data migration failed
- ❌ `devices.device_code` column is missing
- ✅ `sites.site_code` column exists

## Root Cause

The devices table was created using the consolidated migration script `APPLY_IOT_MIGRATIONS.sql` which is missing these columns compared to the individual migration file `20251107000001_create_devices_table.sql`.

The junction tables migration ran partially - it created the tables but failed during the data migration step when trying to reference `mapped_at` and `mapped_by_user_id`.

### Missing Columns:
1. `mapped_at` (timestamptz) - Referenced on lines 381 & 401 of junction tables migration
2. `mapped_by_user_id` (uuid) - Referenced on lines 382 & 402 of junction tables migration
3. `provisioning_status` (text) - Needed for device provisioning flow
4. `device_reported_site_id` (text) - For device self-reporting
5. `device_reported_location` (text) - For device self-reporting

## Solution

### Step 1: Apply Missing Columns Migration

**Option A: Using Supabase Dashboard (RECOMMENDED)**

1. Open your Supabase project dashboard:
   https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

2. Copy the entire contents of this file:
   `supabase/migrations/20251108115959_add_missing_device_columns.sql`

3. Paste it into the SQL Editor

4. Click "Run" to execute the migration

5. You should see success messages confirming the columns were added

**Option B: Using SQL Editor Directly**

Copy and paste this SQL directly into your Supabase SQL Editor:

```sql
-- Add mapped_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'mapped_at'
  ) THEN
    ALTER TABLE devices ADD COLUMN mapped_at TIMESTAMPTZ;
    COMMENT ON COLUMN devices.mapped_at IS 'Timestamp when device was mapped to a site by an administrator';
  END IF;
END $$;

-- Add mapped_by_user_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'mapped_by_user_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN mapped_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN devices.mapped_by_user_id IS 'User who mapped the device to a site';
  END IF;
END $$;

-- Add provisioning_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'provisioning_status'
  ) THEN
    ALTER TABLE devices ADD COLUMN provisioning_status TEXT DEFAULT 'pending_mapping';
    ALTER TABLE devices ADD CONSTRAINT devices_provisioning_status_check
      CHECK (provisioning_status IN ('pending_mapping', 'mapped', 'active', 'inactive'));
    COMMENT ON COLUMN devices.provisioning_status IS 'Device provisioning state: pending_mapping (awaiting admin assignment), mapped (assigned to site), active (operational), inactive (disabled)';
  END IF;
END $$;

-- Add device_reported_site_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_reported_site_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_reported_site_id TEXT;
    COMMENT ON COLUMN devices.device_reported_site_id IS 'Site ID as reported by device firmware (may not match actual site_id)';
  END IF;
END $$;

-- Add device_reported_location column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_reported_location'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_reported_location TEXT;
    COMMENT ON COLUMN devices.device_reported_location IS 'Location string as reported by device firmware';
  END IF;
END $$;

-- Create index on provisioning_status
CREATE INDEX IF NOT EXISTS idx_devices_provisioning_status ON devices(provisioning_status);

-- Update existing devices
DO $$
BEGIN
  UPDATE devices
  SET provisioning_status = 'mapped', mapped_at = created_at
  WHERE site_id IS NOT NULL AND (provisioning_status IS NULL OR provisioning_status = 'pending_mapping');

  UPDATE devices
  SET provisioning_status = 'active'
  WHERE site_id IS NOT NULL AND is_active = true AND provisioning_status = 'mapped';

  UPDATE devices
  SET provisioning_status = 'inactive'
  WHERE is_active = false;
END $$;
```

### Step 2: Re-run Junction Tables Data Migration

The junction tables already exist but are empty. After Step 1 completes, you need to re-run only the data migration portion:

**Copy and run this SQL in the Supabase SQL Editor:**

```sql
-- Add device_code column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_code'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_code TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);
    COMMENT ON COLUMN devices.device_code IS 'Human-readable unique device identifier (e.g., ESP32-CAM-001)';
  END IF;
END $$;

-- Migrate existing device-site assignments
INSERT INTO device_site_assignments (
  device_id,
  site_id,
  program_id,
  is_primary,
  is_active,
  assigned_at,
  assigned_by_user_id
)
SELECT
  d.device_id,
  d.site_id,
  d.program_id,
  true,
  d.is_active,
  COALESCE(d.mapped_at, d.created_at),
  d.mapped_by_user_id
FROM devices d
WHERE d.site_id IS NOT NULL AND d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate existing device-program assignments
INSERT INTO device_program_assignments (
  device_id,
  program_id,
  is_primary,
  is_active,
  assigned_at,
  assigned_by_user_id
)
SELECT
  d.device_id,
  d.program_id,
  true,
  d.is_active,
  COALESCE(d.mapped_at, d.created_at),
  d.mapped_by_user_id
FROM devices d
WHERE d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate existing site-program assignments
INSERT INTO site_program_assignments (
  site_id,
  program_id,
  is_primary,
  is_active,
  assigned_at
)
SELECT
  s.site_id,
  s.program_id,
  true,
  true,
  s.created_at
FROM sites s
WHERE s.program_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

### Step 3: Verify Success

Run this query to verify the columns exist:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'devices'
ORDER BY ordinal_position;
```

You should see all these columns including the 5 new ones:
- `mapped_at`
- `mapped_by_user_id`
- `provisioning_status`
- `device_reported_site_id`
- `device_reported_location`

### Step 4: Verify Junction Tables

Run this query to verify the junction tables were created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%assignment%'
ORDER BY table_name;
```

You should see:
- `device_program_assignments`
- `device_site_assignments`
- `site_program_assignments`

## Testing After Fix

After applying both migrations, test that:

1. **Devices page loads without errors**
   - Navigate to your devices page in the application
   - Verify device list displays correctly

2. **Existing device still has its site assignment**
   - Check that device "ESP32-CAM-001" still shows assigned to its site
   - Verify program assignment is intact

3. **Junction tables populated correctly**
   ```sql
   SELECT COUNT(*) FROM device_site_assignments;
   SELECT COUNT(*) FROM device_program_assignments;
   SELECT COUNT(*) FROM site_program_assignments;
   ```
   These should have at least 1 record each based on your existing device.

## Files Created/Modified

1. **Created**: `supabase/migrations/20251108115959_add_missing_device_columns.sql`
   - Adds the 5 missing columns to devices table
   - Safe to run multiple times (uses IF NOT EXISTS pattern)

2. **Already Exists**: `supabase/migrations/20251108120000_add_junction_tables_and_codes.sql`
   - This will work after Step 1 completes
   - Creates junction tables and migrates existing data

## Prevention

To prevent this issue in the future:

1. **Always use individual migration files** rather than consolidated SQL scripts
2. **Test migrations in order** starting from the lowest timestamp
3. **Verify schema** after running migrations using information_schema queries
4. **Keep migration files in sync** with the actual database schema

## Need Help?

If you encounter any issues:
1. Check the Supabase logs for detailed error messages
2. Verify you have the correct permissions to run DDL statements
3. Ensure no other migrations are running simultaneously
4. Contact support if you see constraint violation errors
