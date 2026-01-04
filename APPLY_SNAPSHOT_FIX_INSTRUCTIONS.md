# Apply Comprehensive Snapshot Function Fix

## Problem
The snapshot generation function is creating incomplete `site_state` structures missing critical visualization data.

## Solution
Apply the comprehensive snapshot function that includes all necessary metadata.

## Steps to Apply

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase SQL Editor**
   - Go to https://supabase.com/dashboard
   - Navigate to your project
   - Click "SQL Editor" in the left sidebar

2. **Copy the SQL**
   - Open the file: `fix-comprehensive-snapshot-function.sql`
   - Copy the entire contents

3. **Execute**
   - Paste into the SQL editor
   - Click "Run"
   - Wait for success confirmation

4. **Verify**
   ```bash
   node regenerate-jan4-snapshots.mjs
   ```

### Option 2: Command Line (If you have database access)

```bash
# If you have the database connection string
psql $DATABASE_URL < fix-comprehensive-snapshot-function.sql
```

## After Applying

1. **Regenerate January 4 Snapshots**
   ```bash
   node regenerate-jan4-snapshots.mjs
   ```

2. **Verify the structure**
   - Check that snapshots have all required keys:
     - `snapshot_metadata`
     - `site_metadata`
     - `program_context`
     - `devices`
     - `environmental_zones`
     - `session_metrics`

3. **Test the UI**
   - Navigate to the session detail page
   - Confirm the map renders
   - Verify the timeline controller works

## What This Fixes

- **site_metadata**: Site dimensions, walls, doors, platforms for map rendering
- **program_context**: Program information for timeline
- **environmental_zones**: Device-centered zones for overlays
- **snapshot_metadata**: Wake timing and session linkage
- **session_metrics**: Aggregate counts for summary display
- **LOCF Support**: Carries forward last observations when devices miss wakes
- **device_wake_payloads**: Uses correct telemetry source instead of deprecated device_telemetry

## Current Status
Session `4889eee2-6836-4f52-bbe4-9391e0930f88` has:
- 23 completed wakes
- 22 images
- 13 snapshots (incomplete - need regeneration after fix)
- 0 snapshots with complete site_state structure

After applying this fix and regenerating, snapshots will have complete data for visualization.
