# Apply MGI Automation & IoT Test Site 2 Setup

## What's Wrong

Your device_images have these issues:
1. ❌ No `site_device_session_id` populated
2. ❌ `mgi_velocity` values are wrong - not calculated from previous image
3. ❌ `mgi_speed` values don't make sense
4. ❌ No automatic rollup to `devices.latest_mgi_score` / `devices.latest_mgi_velocity`
5. ❌ IoT Test Site 2 doesn't have all test cases

## Solution

### Step 1: Apply Automation Migration

This migration creates triggers that:
- **Auto-calculate `mgi_velocity`** from previous image when inserting/updating
- **Auto-calculate `mgi_speed`** based on program start date
- **Auto-rollup** latest MGI to devices table
- **Backfill** all existing images

```bash
# File: supabase/migrations/20251121000001_device_image_automation.sql
```

Copy/paste this SQL into Supabase SQL Editor:

```sql
-- See migration file for full SQL
```

### Step 2: Seed IoT Test Site 2

After migration, run:

```bash
node seed-iot-test-site-2.mjs
```

This will create 5 devices with all test cases:
- 🟢 **DEVICE-ESP32S3-003**: Green (8% MGI, slow velocity)
- 🟡 **TEST-DEVICE-002**: Yellow (18% MGI, medium velocity)  
- 🟠 **DEVICE-ESP32S3-004**: Orange (33% MGI, high velocity)
- 🔴 **MOCK-DEV-4484**: Red (55% MGI, very high velocity)
- 🔴⚠️ **DEVICE-ESP32S3-001**: Red + Triangle (65% MGI, 17%+ critical velocity)

## What You'll Get

### Automatic Calculations

When you insert a new `device_images` row with `mgi_score`:

1. **mgi_velocity** = current MGI - previous MGI (from last image)
2. **mgi_speed** = current MGI / days_since_program_start
3. **Devices table updated** with latest_mgi_score, latest_mgi_velocity

### Complete Test Site

"IoT Test Site 2 - Site Map" will have 5 devices positioned on the map showing:
- All 4 MGI color ranges (green, yellow, orange, red)
- All velocity levels (slow, medium, high, very high, critical)
- Critical velocity warning triangles on 17%+ devices
- Animated pulse rings sized by velocity

## Current Status

- ✅ Migration file created
- ✅ Seed script created
- ⏳ Waiting for you to apply migration
- ⏳ Then seed IoT Test Site 2
- ⏳ Then verify on HomePage

## Next Action

**Please apply the migration SQL, then run the seed script!**

After that, navigate to HomePage → "IoT Test Site 2 - Site Map" to see all test cases in action.
