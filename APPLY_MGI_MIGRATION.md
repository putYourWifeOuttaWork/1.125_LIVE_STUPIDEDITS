# Apply MGI Migration - Quick Start

## Issue
The migration file `supabase/migrations/20251119200000_add_device_id_to_petri_observations.sql` had a SQL error.

## Fixed Migration
A corrected version is at: **`fix-device-id-migration.sql`**

## How to Apply

### Option 1: Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Copy/paste contents of `fix-device-id-migration.sql`
4. Click **Run**

### Option 2: Command Line (if you have direct DB access)

```bash
psql $DATABASE_URL -f fix-device-id-migration.sql
```

## What This Does

- Adds `device_id` column to `petri_observations`
- Backfills existing records from `submissions` table
- Creates indexes for efficient MGI queries
- Enables the homepage map to fetch MGI data directly

## After Applying

Run the test to create mock MGI data:

```bash
node test-mgi-visualization.mjs
```

Then refresh your homepage and select **"Mold Growth (MGI)"** from the Zones dropdown!

## Verification

Check that the column exists:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'petri_observations'
AND column_name = 'device_id';
```

Should return:
```
column_name | data_type
device_id   | uuid
```
