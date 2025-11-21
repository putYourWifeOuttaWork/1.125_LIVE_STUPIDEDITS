# 🚀 DEPLOY CONNECTIVITY INDICATOR - COMPLETE GUIDE

## ✅ Status: READY TO DEPLOY

**All bugs fixed!** The DATE_PART error has been corrected and the migration is ready to apply.

---

## 📋 Pre-Flight Checklist

- ✅ DATE_PART bug fixed (lines 281-282)
- ✅ Frontend code built successfully
- ✅ Regeneration script updated
- ✅ Test script created
- ✅ All documentation written

---

## 🎯 What You're Deploying

**Device Wake Reliability Indicator System**

Visual WiFi-style indicator above each device showing connectivity based on last 3 expected wakes:
- 🟢 Green (3 bars): 3/3 wakes - Excellent
- 🟡 Yellow (2 bars): 2/3 wakes - Good
- 🔴 Red (1 bar or X): ≤1/3 wakes - Poor/Offline
- ⚪ Gray: No schedule configured

---

## 📦 Deployment Steps

### Step 1: Apply Database Migration (5 minutes)

**Via Supabase Dashboard (RECOMMENDED):**

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" → "New Query"
4. Open file: `add-connectivity-tracking.sql`
5. Copy ALL contents (Cmd+A, Cmd+C)
6. Paste into SQL Editor
7. Click "Run" (or Cmd+Enter)
8. Wait for "Success. No rows returned"

**What this does:**
- Creates `get_previous_wake_times()` - Parses cron schedules
- Creates `was_device_active_near()` - Checks device activity
- Creates `calculate_device_wake_reliability()` - Calculates reliability score
- Updates `generate_session_wake_snapshot()` - Adds connectivity metadata

### Step 2: Verify Migration (1 minute)

```bash
node test-connectivity-migration.mjs
```

**Expected output:**
```
🧪 Testing Connectivity Migration...

Test 1: Checking if functions were created...
  ✅ get_previous_wake_times exists
  ✅ was_device_active_near exists
  ✅ calculate_device_wake_reliability exists
  ✅ generate_session_wake_snapshot exists

Test 2: Testing snapshot generation with connectivity...
  ✅ Snapshot generated! ID: <uuid>

Test 3: Verifying connectivity data in snapshot...
  📊 Snapshot has 5 devices
  📶 5 devices have connectivity data

  Sample connectivity data:
    Device: Test_1
    Status: good
    Color: #F59E0B
    Wakes: 2/3
    Reliability: 67%

  ✅ Connectivity data looks good!

Test 4: Testing connectivity calculation function...
  ✅ Connectivity calculated:
     Status: good
     Color: #F59E0B
     Trailing wakes: 2/3

🎉 All tests passed! Migration successful!
```

### Step 3: Regenerate Existing Snapshots (2 minutes)

```bash
node regenerate-snapshots-with-locf.mjs
```

**Expected output:**
```
🔄 Regenerating snapshots with LOCF logic...

✅ Found session: 720e945e-b304-428b-b075-1fdad8d494cc
   Status: in_progress

📸 Found 2 snapshots to regenerate

   Wake #1... ✅ Done
   Wake #2... ✅ Done

📊 Results:
   ✅ Success: 2
   ❌ Errors: 0

🎉 Snapshots regenerated with connectivity!
```

### Step 4: Generate Missing Snapshots (Automatic)

The cron job `generate-site-snapshots` runs every hour at `:00` and will now successfully generate new snapshots with connectivity data.

**Wait for next hour** (e.g., if it's 6:45 PM, wait until 7:00 PM) and check:

```bash
# Check if new snapshot was created
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data } = await supabase
    .from('session_wake_snapshots')
    .select('wake_number, created_at')
    .eq('session_id', '720e945e-b304-428b-b075-1fdad8d494cc')
    .order('wake_number', { ascending: false })
    .limit(3);

  console.log('📸 Latest snapshots:');
  data?.forEach(s => {
    const created = new Date(s.created_at);
    console.log(\`  Wake #\${s.wake_number}: \${created.toLocaleString()}\`);
  });
})();
"
```

### Step 5: Verify in Browser (1 minute)

1. **Hard refresh browser** (Cmd+Shift+R / Ctrl+Shift+R)
2. Navigate to: **Lab → Site Sessions → "Iot Test Site 2"**
3. Click **Timeline Playback**
4. **Look above each device** - you should see WiFi icons!

**What to look for:**
- WiFi icon with colored bars above each device
- Number of bars matches reliability (1-3 bars)
- Tooltip shows "Reliability: X/3 wakes (XX%)"
- Colors: Green, Yellow, or Red based on performance

---

## 🧪 Testing & Validation

### Quick Visual Test

Open browser and check:
1. ✅ WiFi icons visible above devices
2. ✅ Icons show different colors
3. ✅ Number of bars varies by device
4. ✅ Tooltip shows reliability percentage
5. ✅ Icons update during timeline playback

### Detailed Data Test

```bash
# Check a specific snapshot has connectivity
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data } = await supabase
    .from('session_wake_snapshots')
    .select('site_state')
    .eq('session_id', '720e945e-b304-428b-b075-1fdad8d494cc')
    .eq('wake_number', 2)
    .single();

  const devices = data.site_state.devices || [];
  const withConnectivity = devices.filter(d => d.connectivity);

  console.log(\`📊 Wake #2 has \${devices.length} devices\`);
  console.log(\`📶 \${withConnectivity.length} have connectivity data\`);

  if (withConnectivity.length > 0) {
    console.log('\nSample device:');
    const sample = withConnectivity[0];
    console.log(JSON.stringify(sample.connectivity, null, 2));
  }
})();
"
```

---

## 📊 Expected Results

### Current Devices (Iot Test Site 2)

Based on wake schedules and recent activity:

| Device | Schedule | Expected Status |
|--------|----------|-----------------|
| DEVICE-ESP32S3-001 | `0 8,20 * * *` | Yellow/Red (inconsistent) |
| DEVICE-ESP32S3-003 | `0 8,14,20 * * *` | Yellow/Red (inconsistent) |
| DEVICE-ESP32S3-004 | `0 */3 * * *` | Yellow (some misses) |
| TEST-DEVICE-002 | `0 */1 * * *` | Green (hourly) |

Devices without schedules will show gray/unknown status.

---

## 🔧 Troubleshooting

### No WiFi Icons Showing

**1. Check migration applied:**
```sql
SELECT proname FROM pg_proc WHERE proname = 'calculate_device_wake_reliability';
```
Should return 1 row.

**2. Check snapshots have connectivity:**
```bash
node test-connectivity-migration.mjs
```

**3. Hard refresh browser:**
- Chrome/Edge: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
- Firefox: Cmd+Shift+R (Mac) / Ctrl+F5 (Windows)

### Icons Show Wrong Colors

**Check device wake schedule:**
```sql
SELECT device_code, wake_schedule_cron, last_seen_at
FROM devices
WHERE site_id = '134218af-9afc-4ee9-9244-050f51ccbb39';
```

**Check device recent activity:**
```sql
SELECT device_id, COUNT(*) as activity_count
FROM device_telemetry
WHERE site_id = '134218af-9afc-4ee9-9244-050f51ccbb39'
  AND captured_at >= NOW() - INTERVAL '24 hours'
GROUP BY device_id;
```

### New Snapshots Not Being Created

**Check cron job status:**
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data } = await supabase.rpc('get_cron_job_history', { p_limit: 5 });
  console.log('Recent cron runs:');
  data?.forEach(run => {
    console.log(\`  \${run.job_name}: \${run.status} at \${new Date(run.run_start).toLocaleString()}\`);
  });
})();
"
```

---

## 📁 Files Reference

**Database:**
- `add-connectivity-tracking.sql` - Main migration (442 lines, DATE_PART fixed)

**Scripts:**
- `regenerate-snapshots-with-locf.mjs` - Regenerate existing snapshots
- `test-connectivity-migration.mjs` - Verify migration worked
- `APPLY_MIGRATION_INSTRUCTIONS.md` - Detailed SQL application guide

**Documentation:**
- `CONNECTIVITY_INDICATOR_COMPLETE.md` - Full technical documentation
- `APPLY_CONNECTIVITY_NOW.md` - Quick start guide
- `SNAPSHOT_GENERATION_ISSUE.md` - Debugging guide (RESOLVED)
- This file - Complete deployment guide

**Frontend (already built):**
- `src/components/devices/DeviceConnectivityIndicator.tsx`
- `src/components/lab/SiteMapViewer.tsx` (updated)
- `src/lib/types.ts` (updated with DeviceConnectivity type)

---

## ✅ Success Criteria

After deployment, you should have:

- ✅ Migration applied without errors
- ✅ Test script passes all 4 tests
- ✅ Snapshots regenerated successfully
- ✅ WiFi icons visible above devices in browser
- ✅ Icons show appropriate colors (green/yellow/red)
- ✅ Tooltip displays reliability percentage
- ✅ New snapshots being created hourly
- ✅ Connectivity data present in all new snapshots

---

## 🎉 You're Done!

The connectivity indicator system is now fully deployed and operational!

**What happens now:**
1. Snapshots are generated every hour with connectivity data
2. Devices show WiFi icons indicating wake reliability
3. Operators can see at a glance which devices are checking in reliably
4. Historical playback shows how connectivity changed over time

**Next enhancements could include:**
- Configurable tolerance windows (±15, ±30, ±60 min)
- Alert when reliability drops below threshold
- Historical reliability trends (24h, 7d, 30d)
- Battery correlation analysis
- Predictive wake failure warnings

---

**Questions? Issues? Check the troubleshooting section or review the technical documentation in `CONNECTIVITY_INDICATOR_COMPLETE.md`**
