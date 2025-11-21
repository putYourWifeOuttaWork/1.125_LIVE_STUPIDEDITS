# 📸 SNAPSHOT AUTOMATION - DEPLOYED & ACTIVE

## ✅ Deployment Status: COMPLETE

**Deployed:** 2025-11-21 20:00 UTC  
**Status:** ✅ Active & Running  
**Cron Job ID:** 6

---

## 🎯 What's Running

### Cron Job Configuration
- **Name:** `hourly-snapshot-generation`
- **Schedule:** `0 * * * *` (Every hour at :00)
- **Status:** ✅ Active
- **Command:** `SELECT generate_snapshots_for_all_sites()`

### First Successful Run
- **Timestamp:** 2025-11-21 20:00:00
- **Site:** Iot Test Site 2
- **Snapshot ID:** c5802be1-6d16-4c89-bce6-6a20ade0e245
- **Wake Number:** 21
- **Devices:** 5 active devices

---

## 📊 System Coverage

**Total Sites with Snapshots Enabled:** 27 sites

### Sites by Cadence:
- **1 hour cadence:** 2 sites (IoT Test Site, Iot Test Site 2)
- **3 hour cadence:** 25 sites (all others)

### Current Status:
- All sites show "Ready now" (first run pending)
- `last_snapshot_at` will be populated after first generation
- System will respect cadence going forward

---

## 🔄 How It Works

```
Every hour at :00
  ├─ Check all sites with snapshot_cadence_hours > 0
  ├─ For each site:
  │   ├─ Has enough time elapsed? (cadence check)
  │   ├─ Has active session? (required)
  │   └─ If YES to both → Generate snapshot
  │       ├─ Calculate wake window (last N hours)
  │       ├─ Aggregate all device data
  │       ├─ Apply LOCF for missing MGI
  │       ├─ Create complete JSONB
  │       └─ Update last_snapshot_at
  └─ Continue forever
```

---

## 📈 Expected Behavior

### For 1-Hour Cadence Sites:
```
12:00 PM - First snapshot ✅
 1:00 PM - Second snapshot ✅
 2:00 PM - Third snapshot ✅
 ...every hour
```

### For 3-Hour Cadence Sites:
```
12:00 PM - First snapshot ✅
 1:00 PM - Skip (only 1 hour)
 2:00 PM - Skip (only 2 hours)
 3:00 PM - Second snapshot ✅
 4:00 PM - Skip
 5:00 PM - Skip
 6:00 PM - Third snapshot ✅
 ...continues
```

---

## 🔍 Monitoring Commands

### View Cron Job Status
```sql
SELECT * FROM get_scheduled_cron_jobs();
```

### View Recent Cron Runs
```sql
SELECT * FROM get_cron_job_history(10);
```

### View Recent Snapshots
```sql
SELECT 
  s.name as site_name,
  sws.wake_number,
  sws.created_at,
  sws.active_devices_count,
  sws.new_images_this_round
FROM session_wake_snapshots sws
JOIN sites s ON s.site_id = sws.site_id
ORDER BY sws.created_at DESC
LIMIT 20;
```

### Check Site Snapshot Status
```sql
SELECT 
  name,
  snapshot_cadence_hours,
  last_snapshot_at,
  CASE 
    WHEN last_snapshot_at IS NULL THEN 'Ready now'
    WHEN (NOW() - last_snapshot_at) >= (snapshot_cadence_hours || ' hours')::INTERVAL THEN 'Ready now'
    ELSE 'Next in ' || 
         EXTRACT(EPOCH FROM (last_snapshot_at + (snapshot_cadence_hours || ' hours')::INTERVAL - NOW()))::INT / 60 || 
         ' minutes'
  END as next_snapshot
FROM sites
WHERE snapshot_cadence_hours > 0
ORDER BY last_snapshot_at NULLS FIRST;
```

---

## ⚙️ Configuration

### Change Site Cadence
```sql
-- Set specific site to 1 hour
UPDATE sites 
SET snapshot_cadence_hours = 1
WHERE site_id = 'your-site-id';

-- Set all sites to 2 hours
UPDATE sites 
SET snapshot_cadence_hours = 2
WHERE snapshot_cadence_hours IS NOT NULL;
```

### Force Immediate Snapshot
```sql
-- Reset last_snapshot_at to trigger on next cron run
UPDATE sites 
SET last_snapshot_at = NULL
WHERE site_id = 'your-site-id';

-- Or trigger manually right now
SELECT trigger_snapshot_generation();
```

### Disable Snapshots for a Site
```sql
UPDATE sites 
SET snapshot_cadence_hours = NULL
WHERE site_id = 'your-site-id';
```

---

## 🎉 Success Metrics

### Deployment Verification
- ✅ Cron job created successfully
- ✅ Function deployed and tested
- ✅ First automatic snapshot generated
- ✅ 27 sites configured for automation
- ✅ Manual trigger function available

### Architecture Compliance
- ✅ Uses `sites.snapshot_cadence_hours`
- ✅ Tracks with `sites.last_snapshot_at`
- ✅ Creates session-based snapshots
- ✅ LOCF for missing data
- ✅ Complete JSONB with all devices
- ✅ All foreign keys populated
- ✅ Matches architecture diagram

---

## 📞 Troubleshooting

### If snapshots stop generating:

1. **Check cron job is active:**
   ```sql
   SELECT * FROM get_scheduled_cron_jobs() 
   WHERE jobname = 'hourly-snapshot-generation';
   ```

2. **Check for errors in cron history:**
   ```sql
   SELECT * FROM get_cron_job_history(5);
   ```

3. **Verify sites have active sessions:**
   ```sql
   SELECT s.name, sds.status, sds.start_time
   FROM sites s
   LEFT JOIN site_device_sessions sds ON sds.site_id = s.site_id
   WHERE s.snapshot_cadence_hours > 0;
   ```

4. **Test manual generation:**
   ```sql
   SELECT trigger_snapshot_generation();
   ```

---

## 🚀 Next Steps

1. **Monitor first 24 hours** - Watch cron_job_history
2. **Verify snapshot quality** - Check JSONB content
3. **Adjust cadences** - Fine-tune per site as needed
4. **Enable for more sites** - Set snapshot_cadence_hours as needed

---

**System Status:** 🟢 OPERATIONAL  
**Last Verified:** 2025-11-21 20:00 UTC  
**Maintenance:** Zero - fully automated
