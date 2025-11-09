# Migration Ready to Apply

## Issue Fixed
The migration file has been updated to handle all existing policies properly to avoid conflicts.

## What Was Changed
Added DROP POLICY statements for all existing policies before creating new ones:
- `"Users can create sites in accessible programs"`
- `"Users can update sites in accessible programs"`
- `"Users can delete sites in accessible programs"`

These were causing conflicts because they already existed in the database.

## How to Apply

### Via Supabase Dashboard (Recommended)
1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire contents of:
   ```
   supabase/migrations/20251109120000_fix_sites_rls_admin_access.sql
   ```
5. Click **RUN**

The migration should now execute successfully without any errors.

## What This Fixes
After applying this migration:
- ✅ Super admins will see ALL sites
- ✅ Company admins will see all sites in programs owned by their company
- ✅ Regular users will see sites in programs they have explicit access to
- ✅ Sites will immediately become visible to admin users at Sandhill Growers

## Verification
After applying, log in as an admin user and navigate to any program. You should now see all sites for that program.
