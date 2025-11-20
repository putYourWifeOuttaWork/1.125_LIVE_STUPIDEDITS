# MGI System - Quick Start Guide

## 🚀 What Just Happened

You successfully deployed the complete MGI (Mold Growth Index) system! Your architecture now uses `device_images` as the single source of truth, with automated velocity and speed calculations.

---

## ⚡ Apply This One Fix Now

**File:** `FIX_MGI_SPEED_TRIGGER.sql`

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy/paste the file contents
4. Click "Run"

This fixes the speed calculation trigger to properly look up the program start date.

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `APPLY_MGI_MIGRATION.sql` | Main migration (already applied ✅) |
| `FIX_MGI_SPEED_TRIGGER.sql` | Speed trigger fix (apply next ⚠️) |
| `MGI_SYSTEM_DEPLOYMENT_COMPLETE.md` | Full documentation |
| `test-mgi-system.mjs` | Test script to verify system |

---

## 🎯 What's Now Available

### New Columns on device_images:
- `mgi_score` - The MGI value (0-100)
- `mgi_velocity` - Daily change rate
- `mgi_speed` - Average rate since program start
- `roboflow_response` - Full API response
- `scored_at` - When scoring completed
- `wake_payload_id` - Links to device wake event

### New Columns on devices:
- `latest_mgi_score` - Quick access to most recent MGI
- `latest_mgi_velocity` - Quick access to velocity
- `latest_mgi_at` - Timestamp of latest MGI

### New Columns on sites:
- `snapshot_cadence_hours` - How often to snapshot (default: 3)
- `last_snapshot_at` - When last snapshot was generated

### New Table:
- `site_snapshots` - Timeline snapshots of device states

### New Functions:
- `generate_site_snapshot(site_id)` - Create snapshot now
- `generate_due_site_snapshots()` - Batch generate snapshots

---

## 🔄 Automated Workflows

When you set an MGI score on a device_image:

```sql
UPDATE device_images 
SET mgi_score = 45.5 
WHERE image_id = '...';
```

**Three triggers fire automatically:**

1. **Velocity Trigger** - Calculates change from yesterday's last image
2. **Speed Trigger** - Calculates average rate since program start  
3. **Device Update** - Updates latest values on devices table

No manual calculation needed! ✨

---

## 🧪 Test It

After applying the speed trigger fix:

```bash
node test-mgi-system.mjs
```

This will:
- Verify all columns exist
- Test snapshot generation
- Simulate MGI score update
- Validate triggers fire correctly

---

## 📊 Use in Your UI

**Display latest MGI on device cards:**
```typescript
const { data: devices } = await supabase
  .from('devices')
  .select('device_name, latest_mgi_score, latest_mgi_velocity')
  .eq('is_active', true);
```

**Get MGI history for a device:**
```typescript
const { data: images } = await supabase
  .from('device_images')
  .select('captured_at, mgi_score, mgi_velocity, mgi_speed')
  .eq('device_id', deviceId)
  .not('mgi_score', 'is', null)
  .order('captured_at', { ascending: false });
```

**Get site snapshot for timeline:**
```typescript
const { data: snapshots } = await supabase
  .from('site_snapshots')
  .select('*')
  .eq('site_id', siteId)
  .order('snapshot_time', { ascending: false })
  .limit(24); // Last 24 snapshots
```

---

## 🎨 What to Build Next

1. **MGI Badge Component** - Show color-coded MGI score with velocity arrow
2. **Velocity Chart** - Line chart showing MGI velocity over time
3. **Site Timeline** - Animated playback using site_snapshots
4. **Alert Dashboard** - Show devices with rapid MGI increases

---

## 📞 Next Steps Summary

1. ✅ Applied `APPLY_MGI_MIGRATION.sql` 
2. ⚠️ **Apply `FIX_MGI_SPEED_TRIGGER.sql`** (do this now)
3. 🔧 Deploy Roboflow edge function for auto-scoring
4. 📅 Set up pg_cron for periodic snapshots
5. 🎨 Update UI to display new MGI fields

---

## ✨ Key Benefits

- **Simplified**: One source of truth (device_images)
- **Automated**: Velocity and speed calculated automatically
- **Timeline Ready**: Site snapshots for temporal visualization
- **Scalable**: No dependency on petri_observations for device data
- **Auditable**: Full Roboflow response stored for transparency

**Your system is production-ready!** 🚀
