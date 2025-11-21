# AUTOMATED SNAPSHOT GENERATION - READY TO DEPLOY

## ✅ What This Does

Creates a fully automated snapshot generation system that:

1. **Runs hourly via pg_cron** - Checks every hour at :00
2. **Respects each site's cadence** - Uses `snapshot_cadence_hours` from sites table
3. **Smart scheduling** - Only generates when enough time has elapsed
4. **Tracks generation** - Updates `last_snapshot_at` automatically
5. **Uses LOCF** - Carries forward missing MGI data as designed
6. **Complete snapshots** - Full JSONB with all devices, telemetry, zones, analytics

## 📋 Migration Contents

**File**: `/tmp/snapshot-automation-migration.sql`

### What It Creates:

1. **Column**: `sites.last_snapshot_at` - Tracks when last snapshot was generated
2. **Function**: `generate_snapshots_for_all_sites()` - Main automation function
3. **Function**: `trigger_snapshot_generation()` - Manual trigger for testing
4. **Cron Job**: `hourly-snapshot-generation` - Runs every hour

### Logic Flow:

```
Every hour at :00
  ↓
For each site with snapshot_cadence_hours > 0:
  ↓
  Check: Has cadence elapsed since last_snapshot_at?
  ↓
  YES → Find active session
      ↓
      Calculate wake window (last N hours)
      ↓
      Call generate_session_wake_snapshot()
      ↓
      Update last_snapshot_at
  ↓
  NO → Skip until next hour
```

## 🚀 How to Apply

### Step 1: Copy SQL to Supabase
```bash
# Copy the contents of /tmp/snapshot-automation-migration.sql
cat /tmp/snapshot-automation-migration.sql
```

### Step 2: Run in Supabase SQL Editor
1. Open Supabase Dashboard → SQL Editor
2. Paste the entire migration
3. Click "Run"
4. Should see: "✅ Snapshot automation configured successfully!"

### Step 3: Verify Setup
```sql
-- View the cron job
SELECT * FROM get_scheduled_cron_jobs();

-- Check sites ready for snapshots
SELECT 
  site_id,
  name,
  snapshot_cadence_hours,
  last_snapshot_at,
  CASE 
    WHEN last_snapshot_at IS NULL THEN 'Ready now'
    WHEN (NOW() - last_snapshot_at) >= (snapshot_cadence_hours || ' hours')::INTERVAL THEN 'Ready now'
    ELSE 'Next in ' || EXTRACT(EPOCH FROM (last_snapshot_at + (snapshot_cadence_hours || ' hours')::INTERVAL - NOW()))::INT / 60 || ' min'
  END as status
FROM sites
WHERE snapshot_cadence_hours > 0;
```

### Step 4: Test Immediately (Optional)
```sql
-- Manually trigger snapshot generation right now
SELECT trigger_snapshot_generation();

-- View results
SELECT 
  snapshot_id,
  site_id,
  wake_number,
  created_at,
  active_devices_count,
  new_images_this_round
FROM session_wake_snapshots
ORDER BY created_at DESC
LIMIT 5;
```

## 📊 Your Current Sites

From your JSON:
- **IoT Test Site 2**: `snapshot_cadence_hours = 3`
- **IoT Test Site**: `snapshot_cadence_hours = 3`

After applying:
- First run will generate snapshots immediately (last_snapshot_at is NULL)
- Then will run every 3 hours automatically
- You can change to 1 hour by updating the `snapshot_cadence_hours` column

## 🔍 Monitoring

### View cron job history:
```sql
SELECT * FROM get_cron_job_history(10);
```

### View recent snapshots:
```sql
SELECT 
  s.name as site_name,
  sws.wake_number,
  sws.created_at,
  sws.active_devices_count,
  sws.new_images_this_round,
  sws.avg_mgi
FROM session_wake_snapshots sws
JOIN sites s ON s.site_id = sws.site_id
ORDER BY sws.created_at DESC
LIMIT 20;
```

## ⚙️ Configuration

### Change snapshot frequency:
```sql
-- Set to 1 hour for all sites
UPDATE sites 
SET snapshot_cadence_hours = 1
WHERE snapshot_cadence_hours IS NOT NULL;

-- Or per-site:
UPDATE sites 
SET snapshot_cadence_hours = 2
WHERE site_id = 'your-site-id';
```

### Force immediate snapshot:
```sql
-- Reset last_snapshot_at to trigger on next run
UPDATE sites 
SET last_snapshot_at = NULL
WHERE site_id = 'your-site-id';

-- Or trigger manually right now
SELECT trigger_snapshot_generation();
```

## ✅ Benefits

1. **Zero manual work** - Runs automatically forever
2. **Per-site control** - Each site has its own cadence
3. **Smart scheduling** - Won't duplicate if already generated
4. **Production ready** - Error handling, logging, retries
5. **Easy monitoring** - Built-in history and status functions

## 🎯 Ready to Deploy?

The migration is ready in `/tmp/snapshot-automation-migration.sql`

Just copy and paste into Supabase SQL Editor and run!
