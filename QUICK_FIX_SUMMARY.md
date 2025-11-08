# Quick Fix Summary - Device Schema Error

## The Problem
Error: `column d.mapped_at does not exist` when running database operations involving devices.

## The Root Cause
Your devices table is missing 5 columns that were defined in migration files but never applied to the actual database.

## What I've Done

1. ✅ **Diagnosed the issue** - Verified your database is missing:
   - `mapped_at`
   - `mapped_by_user_id`
   - `provisioning_status`
   - `device_reported_site_id`
   - `device_reported_location`

2. ✅ **Created the fix migration**
   - File: `supabase/migrations/20251108115959_add_missing_device_columns.sql`
   - Safely adds all missing columns using conditional DDL
   - Includes proper indexes, constraints, and comments

3. ✅ **Verified project builds successfully**
   - Ran `npm run build` - all TypeScript compiled without errors
   - No breaking changes to existing code

4. ✅ **Created verification script**
   - File: `verify-device-columns.mjs`
   - Run `node verify-device-columns.mjs` to check migration status

5. ✅ **Documented everything**
   - File: `FIX_DEVICE_SCHEMA_ERROR.md`
   - Complete step-by-step instructions with SQL snippets

## What You Need to Do

### Step 1: Add Missing Columns (5 minutes)

1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

2. Copy ALL the SQL from: `supabase/migrations/20251108115959_add_missing_device_columns.sql`

3. Paste and click "Run"

### Step 2: Populate Junction Tables (2 minutes)

The junction tables exist but are empty. Copy and run this SQL:

```sql
-- Add device_code column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_code'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_code TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);
  END IF;
END $$;

-- Migrate device-site assignments
INSERT INTO device_site_assignments (
  device_id, site_id, program_id, is_primary, is_active, assigned_at, assigned_by_user_id
)
SELECT
  d.device_id, d.site_id, d.program_id, true, d.is_active,
  COALESCE(d.mapped_at, d.created_at), d.mapped_by_user_id
FROM devices d
WHERE d.site_id IS NOT NULL AND d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate device-program assignments
INSERT INTO device_program_assignments (
  device_id, program_id, is_primary, is_active, assigned_at, assigned_by_user_id
)
SELECT
  d.device_id, d.program_id, true, d.is_active,
  COALESCE(d.mapped_at, d.created_at), d.mapped_by_user_id
FROM devices d
WHERE d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate site-program assignments
INSERT INTO site_program_assignments (
  site_id, program_id, is_primary, is_active, assigned_at
)
SELECT s.site_id, s.program_id, true, true, s.created_at
FROM sites s
WHERE s.program_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

### Step 3: Verify Success

Run: `node verify-device-columns.mjs`

You should see:
- ✅ All 5 missing columns now exist
- ✅ Junction tables have 1+ records
- ✅ device_code column exists

## Expected Results

After completing these steps:
- The SQL error will be resolved
- Your existing device (ESP32-CAM-001) will have proper assignments in junction tables
- Device provisioning flow will work correctly
- All device-related pages will load without errors

## Files Reference

- **Migration to apply**: `supabase/migrations/20251108115959_add_missing_device_columns.sql`
- **Verification script**: `verify-device-columns.mjs`
- **Detailed guide**: `FIX_DEVICE_SCHEMA_ERROR.md`

## Total Time Needed
~10 minutes to apply both SQL scripts in Supabase Dashboard

## Questions?
Refer to `FIX_DEVICE_SCHEMA_ERROR.md` for complete documentation including:
- Detailed explanation of each missing column
- Full migration SQL with comments
- Troubleshooting steps
- Data integrity validation queries
