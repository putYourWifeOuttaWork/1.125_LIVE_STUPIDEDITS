# APPLY CONNECTIVITY INDICATOR - QUICK START

## What This Adds

WiFi-style connectivity indicator above each device on the map showing wake reliability:
- 🟢 **Green**: 3/3 recent wakes (excellent)
- 🟡 **Yellow**: 2/3 recent wakes (good)
- 🔴 **Red**: ≤1/3 recent wakes (poor/offline)

## Apply Now (3 Steps)

### Step 1: Apply Database Migration

**Supabase Dashboard (EASIEST):**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy ALL contents of:
   ```
   /tmp/cc-agent/51386994/project/add-connectivity-tracking.sql
   ```
6. Paste into editor
7. Click **Run** (or press Cmd+Enter)

✅ Should see: "Success. No rows returned"

### Step 2: Regenerate Snapshots

```bash
node regenerate-snapshots-with-locf.mjs
```

Expected output:
```
📸 Found 12 snapshots to regenerate
   Wake #1... ✅ Done
   Wake #2... ✅ Done
   ...
   Wake #12... ✅ Done

📊 Results:
   ✅ Success: 12
   ❌ Errors: 0

🎉 Snapshots regenerated with connectivity!
```

### Step 3: Test in Browser

1. **Refresh browser** (hard refresh: Cmd+Shift+R / Ctrl+Shift+R)
2. Navigate to: **Lab → Site Sessions → "Iot Test Site 2"**
3. Click **Timeline Playback**
4. **Look above each device** on the map

You should see WiFi icons with different colors showing reliability!

---

## What to Expect

### Good Device (Green)
```
     📶 (3 bars, green)
       🟢
    DEVICE-001
```

### Intermittent Device (Yellow)
```
     📶 (2 bars, yellow)
       🟠
    DEVICE-002
```

### Offline Device (Red)
```
     ✖️ (X symbol, red)
       🔴
    DEVICE-003
```

### Hover Tooltip
```
Device Name
MGI: 45%
Velocity: +0.12/day
Temp: 72.5°F
RH: 55.3%
Reliability: 2/3 wakes (67%)  ← NEW!
Position: (50, 25)
```

---

## Troubleshooting

### "Function already exists" error
This is OKAY! It means functions are already installed. Continue to Step 2.

### No icons showing
1. Check browser console for errors
2. Verify snapshots were regenerated (Step 2)
3. Hard refresh browser (Cmd+Shift+R)
4. Check if devices have `wake_schedule_cron` set

### All icons gray
This means devices don't have wake schedules configured. Check:
```sql
SELECT device_code, wake_schedule_cron
FROM devices
WHERE site_id = 'YOUR_SITE_ID';
```

### Icons show but wrong colors
Check device activity:
```sql
SELECT
  d.device_code,
  d.wake_schedule_cron,
  d.last_seen_at,
  COUNT(dt.telemetry_id) as telemetry_count
FROM devices d
LEFT JOIN device_telemetry dt ON dt.device_id = d.device_id
WHERE d.site_id = 'YOUR_SITE_ID'
  AND dt.captured_at >= NOW() - INTERVAL '24 hours'
GROUP BY d.device_code, d.wake_schedule_cron, d.last_seen_at;
```

---

## Files

- `add-connectivity-tracking.sql` - Database migration (442 lines)
- `regenerate-snapshots-with-locf.mjs` - Regeneration script
- `CONNECTIVITY_INDICATOR_COMPLETE.md` - Full documentation
- This file - Quick start guide

---

## Success Criteria

✅ Migration applied without errors
✅ 12 snapshots regenerated successfully
✅ WiFi icons visible above devices on map
✅ Icons show different colors (green/yellow/red)
✅ Tooltip shows "Reliability: X/3 wakes (XX%)"

---

**Ready to apply? Start with Step 1!** 🚀
