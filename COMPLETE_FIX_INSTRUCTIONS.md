# Complete Fix Instructions - Session Visualization

## Current Status

✅ **Audit Complete** - Found the issues:
- Sites: All have proper dimensions (ready ✅)
- Devices: All have positions (ready ✅)
- Wake payloads: 23 payloads with data
- Images: 22 images
- Snapshots: **0 snapshots** ❌ (this is why map is blank)
- Linkages: **16 records linked** (9 telemetry + 7 images)

## Root Cause

The `generate_session_wake_snapshot()` function exists but has bugs that prevent it from working correctly. Snapshots are NOT being generated when they should be.

---

## Fix Steps (5-10 minutes)

### Step 1: Apply SQL Fix to Database

**CRITICAL**: This must be done first, before regenerating snapshots!

1. Open your **Supabase Dashboard** in a web browser
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file: `APPLY_SIMPLE_SNAPSHOT_FIX.sql`
5. Copy the **ENTIRE** contents of that file
6. Paste into the Supabase SQL Editor
7. Click **RUN** (or press Cmd/Ctrl + Enter)
8. You should see: "SUCCESS: Simple snapshot function deployed!"

**What this does**:
- Replaces the broken snapshot function with a working one
- Fixes aggregate casting errors
- Uses `device_wake_payloads` as the data source
- Includes device positions and telemetry in snapshots

---

### Step 2: Regenerate Snapshots

After applying the SQL fix, run this command in your terminal:

```bash
node regenerate-snapshots-for-jan4-session.mjs
```

**Expected output**:
```
📸 REGENERATING SNAPSHOTS FOR JANUARY 4 SESSION
================================================================================

Session: IoT Test Site
Date: 2026-01-04
Status: in_progress

✅ Found 23 wake payloads
🕐 Creating wake windows...

Wake #1: 14:00
  ✅ Created snapshot
Wake #2: 15:00
  ✅ Created snapshot
...

📊 SUMMARY: Created 6/6 snapshots

✅ SUCCESS! Snapshots have data - map and analytics should render now!
```

---

### Step 3: Verify in UI

1. Open your web application
2. Navigate to the **January 4, 2026** session for **IoT Test Site**
3. Click the **"Overview & Map"** tab
4. You should now see:
   - ✅ **Site map** with device positions
   - ✅ **Timeline scrubber** with multiple wake points
   - ✅ **Device markers** on the map
   - ✅ **Telemetry data** (temperature, humidity)
5. Click the **"Analytics"** tab
6. You should see:
   - ✅ **Time series charts** (temperature and humidity over time)
   - ✅ **Histogram charts** showing data distribution
   - ✅ **Environmental aggregates** (avg, min, max values)

---

## Troubleshooting

### Issue: SQL Editor shows an error

**Error**: "function generate_session_wake_snapshot does not exist"
- **Cause**: The function was never created
- **Solution**: Make sure you copied the ENTIRE SQL file, including the `CREATE FUNCTION` statement

**Error**: "column new_images_this_round does not exist"
- **Cause**: Wrong version of the SQL file
- **Solution**: Use `APPLY_SIMPLE_SNAPSHOT_FIX.sql` (not the old `APPLY_SNAPSHOT_FIX_NOW.sql`)

---

### Issue: Snapshot script shows "No payloads found"

**Cause**: Wrong session ID or session has no data
**Solution**: Verify the session ID in the script:
```javascript
const SESSION_ID = '4889eee2-6836-4f52-bbe4-9391e0930f88';
```

You can find session IDs by running:
```bash
node diagnose-visualization-data-complete.mjs
```

---

### Issue: Snapshots created but map still blank

**Possible causes**:

1. **Browser cache**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

2. **Device positions missing**: Verify devices have x_position and y_position:
   ```bash
   node check-device-positions-fixed.mjs
   ```

3. **Site dimensions missing**: Check sites table has length and width set

4. **Wrong session**: Make sure you're viewing the January 4 session, not January 3
   - January 3 has NO data (0 payloads, 0 images)
   - January 4 has 23 payloads and 22 images

---

### Issue: Snapshots have NULL temperature/humidity

**Cause**: Wake payloads don't have telemetry data linked
**Solution**: This is expected for some wake windows. The map should still render with device positions.

To check which wake windows have data:
```bash
node regenerate-snapshots-for-jan4-session.mjs
```

Look for the "Wake Payloads Summary" section showing which payloads have temperature data.

---

## Data Architecture Explanation

### How Snapshots Work

```
Device wakes up
  ↓
Creates wake_payload in device_wake_payloads
  ↓
Sends telemetry (temp, humidity) → stored in payload
Captures image → linked via wake_payload_id
  ↓
Snapshot function groups payloads by hour
  ↓
Generates session_wake_snapshot with:
  - Device positions
  - Telemetry averages
  - Image counts
  - site_state JSONB (complete snapshot)
  ↓
Frontend reads snapshots
  ↓
Renders map and analytics
```

### Why Linkages Matter

The `wake_payload_id` foreign key connects:
- `device_telemetry.wake_payload_id` → `device_wake_payloads.payload_id`
- `device_images.wake_payload_id` → `device_wake_payloads.payload_id`

This allows the snapshot function to:
1. Find all payloads in a time window
2. Get associated telemetry and images
3. Aggregate the data for visualization

---

## Next Steps (Automation)

Once your visualizations are working, consider implementing:

### 1. Real-Time Snapshot Generation

Create a trigger that automatically generates snapshots when devices report data:

```sql
CREATE OR REPLACE FUNCTION auto_generate_snapshot_on_wake()
RETURNS TRIGGER AS $$
BEGIN
  -- When a wake payload is marked complete, generate snapshot
  IF NEW.is_complete = true AND OLD.is_complete = false THEN
    PERFORM generate_session_wake_snapshot(
      NEW.site_device_session_id,
      NEW.wake_window_index,
      -- Define wake window bounds
      NEW.captured_at - interval '30 minutes',
      NEW.captured_at + interval '30 minutes'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_snapshot
AFTER UPDATE ON device_wake_payloads
FOR EACH ROW
EXECUTE FUNCTION auto_generate_snapshot_on_wake();
```

### 2. Automatic Wake Payload Linking

Create triggers to automatically link telemetry and images:

```sql
CREATE OR REPLACE FUNCTION auto_link_telemetry_to_payload()
RETURNS TRIGGER AS $$
DECLARE
  v_payload_id uuid;
BEGIN
  -- Find matching wake payload within ±5 seconds
  SELECT payload_id INTO v_payload_id
  FROM device_wake_payloads
  WHERE device_id = NEW.device_id
    AND site_device_session_id = NEW.site_device_session_id
    AND captured_at BETWEEN (NEW.captured_at - interval '5 seconds')
                       AND (NEW.captured_at + interval '5 seconds')
  ORDER BY ABS(EXTRACT(EPOCH FROM (captured_at - NEW.captured_at)))
  LIMIT 1;

  IF v_payload_id IS NOT NULL THEN
    NEW.wake_payload_id := v_payload_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_link_telemetry
BEFORE INSERT ON device_telemetry
FOR EACH ROW
EXECUTE FUNCTION auto_link_telemetry_to_payload();
```

### 3. Data Health Monitoring

Create a view to monitor data completeness:

```sql
CREATE OR REPLACE VIEW session_data_health AS
SELECT
  sds.session_id,
  sds.session_date,
  s.name as site_name,
  COUNT(DISTINCT dwp.payload_id) as payload_count,
  COUNT(DISTINCT di.image_id) as image_count,
  COUNT(DISTINCT sws.snapshot_id) as snapshot_count,
  CASE
    WHEN COUNT(DISTINCT dwp.payload_id) > 0
     AND COUNT(DISTINCT sws.snapshot_id) = 0
    THEN 'MISSING_SNAPSHOTS'
    WHEN COUNT(DISTINCT dwp.payload_id) = 0
     AND COUNT(DISTINCT sws.snapshot_id) > 0
    THEN 'SNAPSHOTS_WITHOUT_DATA'
    ELSE 'OK'
  END as health_status
FROM site_device_sessions sds
JOIN sites s ON s.site_id = sds.site_id
LEFT JOIN device_wake_payloads dwp ON dwp.site_device_session_id = sds.session_id
LEFT JOIN device_images di ON di.site_device_session_id = sds.session_id
LEFT JOIN session_wake_snapshots sws ON sws.session_id = sds.session_id
GROUP BY sds.session_id, sds.session_date, s.name;
```

---

## Success Criteria

You'll know everything is working when:

✅ **Map renders** with device positions
✅ **Timeline scrubber** shows multiple wake points
✅ **Device tooltips** show telemetry data on hover
✅ **Analytics charts** display temperature and humidity trends
✅ **Environmental aggregates** show avg/min/max values
✅ **Zone analytics** display (if 2+ devices)

---

## Files Created

| File | Purpose |
|------|---------|
| `APPLY_SIMPLE_SNAPSHOT_FIX.sql` | ⭐ SQL fix to apply first |
| `regenerate-snapshots-for-jan4-session.mjs` | Regenerate snapshots |
| `backfill-wake-payload-linkages.mjs` | Link telemetry/images (already ran) |
| `diagnose-visualization-data-complete.mjs` | Audit system health |
| `check-device-positions-fixed.mjs` | Verify device positions |
| `COMPLETE_FIX_INSTRUCTIONS.md` | This file |

---

## Questions?

If visualizations still don't render after following these steps:

1. Run the diagnostic again:
   ```bash
   node diagnose-visualization-data-complete.mjs
   ```

2. Check for errors in browser console (F12 → Console tab)

3. Verify you're on the correct session (January 4, not January 3)

4. Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+R)

---

**Ready to proceed?**

1. Apply `APPLY_SIMPLE_SNAPSHOT_FIX.sql` in Supabase Dashboard
2. Run `node regenerate-snapshots-for-jan4-session.mjs`
3. View your session in the UI

**You should see working visualizations in < 5 minutes!**
