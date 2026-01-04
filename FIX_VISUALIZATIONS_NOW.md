# Fix Session Detail Visualizations - STEP BY STEP

**Problem**: Map and Analytics tabs are blank because the snapshot generation function has bugs.

**Solution**: Apply the fixed SQL function and regenerate snapshots.

---

## Step 1: Apply SQL Fix (REQUIRED)

1. Open Supabase Dashboard in your browser
2. Navigate to: **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the ENTIRE contents of: `fix-snapshot-aggregate-casting.sql`
5. Paste into SQL Editor
6. Click **RUN** (or press Cmd/Ctrl + Enter)
7. You should see: "Success. No rows returned"

**What this does**: Fixes the `generate_session_wake_snapshot()` function to:
- Query `device_wake_payloads` (not `device_telemetry`)
- Properly cast numeric fields before aggregation
- Correctly link images via JOIN

---

## Step 2: Regenerate Snapshots

After applying the SQL fix, run:

```bash
node regenerate-jan4-snapshots.mjs
```

**Expected output**:
```
✅ Created 6/6 snapshots

📊 Verification:
  Wake #1: temp=null, humidity=null, images=0
  Wake #2: temp=31.1, humidity=42.9, images=8  ← DATA!
  Wake #3: temp=null, humidity=null, images=2
  ...

✅ Snapshots have data! Map and analytics should render now.
```

---

## Step 3: View in UI

1. Navigate to the **January 4, 2026** session:
   - Site: IoT Test Site
   - Session ID: `4889eee2-6836-4f52-bbe4-9391e0930f88`

2. You should now see:
   - **Overview & Map tab**: 2D site visualization with timeline scrubber
   - **Analytics tab**: Temperature and humidity charts
   - **Images tab**: 13 images displayed

---

## Why January 4, Not January 3?

The January 3 session you were viewing has **NO data**:
- 0 telemetry records
- 0 images
- Devices weren't reporting on that date

The January 4 session has:
- 7 wake payloads with telemetry
- 13 images
- Actual visualization data

**To view Jan 4 session**, navigate to:
```
/programs/{programId}/sites/{siteId}/sessions/4889eee2-6836-4f52-bbe4-9391e0930f88
```

---

## Quick Verification Script

To check if everything is working:

```bash
node verify-jan4-backfill.mjs
```

You should see:
```
✅ Backfill is INTACT
✅ Snapshots have telemetry data
```

---

## Troubleshooting

### Issue: "function avg(text) does not exist" when regenerating

**Cause**: SQL fix wasn't applied yet
**Solution**: Go back to Step 1 and apply `fix-snapshot-aggregate-casting.sql`

### Issue: Snapshots created but still show NULL values

**Cause**: Snapshot function is querying the wrong table
**Solution**: Double-check Step 1 was completed successfully

### Issue: Map still doesn't render after applying fix

**Possible causes**:
1. Browser cache - **Hard refresh** (Cmd+Shift+R / Ctrl+Shift+R)
2. Wrong session - Navigate to **Jan 4** session, not Jan 3
3. Snapshots not regenerated - Run Step 2 again

---

## Technical Details

### What was fixed?

**Before** (broken):
```sql
-- Tried to AVG text, caused error
SELECT AVG((device->>'telemetry')::jsonb->>'temperature')::numeric
```

**After** (fixed):
```sql
-- AVG numeric values directly from wake_payloads
SELECT AVG(temperature), AVG(humidity)
FROM device_wake_payloads
WHERE temperature IS NOT NULL
```

### Data Flow

```
device_wake_payloads (with backfilled telemetry)
  ↓
generate_session_wake_snapshot() ← FIXED FUNCTION
  ↓
session_wake_snapshots (with avg_temperature, avg_humidity)
  ↓
Frontend useSiteSnapshots hook
  ↓
SiteMapAnalyticsViewer + TimeSeriesChart components
  ↓
Beautiful visualizations!
```

---

## Scripts Created

| Script | Purpose |
|--------|---------|
| `backfill-wake-payload-data.mjs` | ✅ Ran - linked telemetry to payloads |
| `regenerate-jan4-snapshots.mjs` | Run after SQL fix |
| `verify-jan4-backfill.mjs` | Check if data is intact |
| `find-sessions-with-data.mjs` | Find viewable sessions |
| `check-jan3-session.mjs` | Confirmed Jan 3 has no data |

---

## Summary

1. **Apply SQL**: `fix-snapshot-aggregate-casting.sql` via Supabase Dashboard
2. **Regenerate**: `node regenerate-jan4-snapshots.mjs`
3. **Navigate**: Go to Jan 4 session in UI
4. **Enjoy**: Map and analytics should now render perfectly!

---

**After completing these steps, the visualizations will work!**
