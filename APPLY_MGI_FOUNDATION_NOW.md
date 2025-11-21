# Apply MGI Foundation - Action Required

## Problem
You cannot see MGI colors or pulse animations on the HomePage site maps because:
1. The database trigger is broken and prevents device_images inserts
2. No device_images rows exist with MGI data
3. SiteMapAnalyticsViewer needs to be updated to show MGI persistently

## Solution Steps

### Step 1: Fix Database Trigger (REQUIRED)
Apply this migration in Supabase SQL Editor:

```bash
# File: supabase/migrations/20251121000000_fix_mgi_speed_trigger.sql
```

Or copy/paste this SQL into Supabase SQL Editor:

```sql
-- Drop the broken trigger
DROP TRIGGER IF EXISTS trigger_calculate_mgi_speed ON device_images CASCADE;

-- Recreate the function with correct column reference
CREATE OR REPLACE FUNCTION calculate_mgi_speed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_program_start_date DATE;
  v_capture_date DATE;
  v_days_since_start NUMERIC;
BEGIN
  IF NEW.mgi_score IS NOT NULL AND (OLD IS NULL OR OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    SELECT pp.start_date INTO v_program_start_date
    FROM sites s
    JOIN pilot_programs pp ON pp.program_id = s.program_id
    WHERE s.site_id = NEW.site_id;
    
    IF v_program_start_date IS NOT NULL THEN
      v_capture_date := DATE(NEW.captured_at AT TIME ZONE 'UTC');
      v_days_since_start := v_capture_date - v_program_start_date;
      
      IF v_days_since_start > 0 THEN
        NEW.mgi_speed := NEW.mgi_score / v_days_since_start;
      ELSE
        NEW.mgi_speed := NEW.mgi_score;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_calculate_mgi_speed
  BEFORE INSERT OR UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION calculate_mgi_speed();
```

### Step 2: Seed Device Images
After applying the migration, run:

```bash
node seed-device-images-progression.mjs
```

This will create 5-8 images per device showing MGI progression over time.

Expected output:
- 50-80 device_images rows created
- 10 devices updated with latest_mgi_score and latest_mgi_velocity
- Mix of green, yellow, orange, and red MGI scores

### Step 3: Update UI Components
I will update these files to show MGI persistently:
- `src/components/lab/SiteMapAnalyticsViewer.tsx` - Add persistent MGI colors/pulses
- Device circles will ALWAYS show MGI colors regardless of zone mode
- Pulse animations will ALWAYS be visible based on velocity

## What You'll See After

On HomePage when you select "Test Site for IoT Device":
- 🟢 Green device circles (0-10% MGI) with small slow pulses
- 🟡 Yellow device circles (11-25% MGI) with medium pulses
- 🟠 Orange device circles (26-40% MGI) with larger pulses
- 🔴 Red device circles (41%+ MGI) with large fast pulses
- ⚠️ Red warning triangles on devices with 17%+ velocity

The zone dropdown (temperature/humidity/battery/mgi) will control the BACKGROUND zones, but device colors and pulses will ALWAYS show MGI.

## Current Status
- ✅ MGI thresholds fixed (0-10, 11-25, 26-40, 41+)
- ✅ Velocity thresholds fixed (1-5, 6-8, 9-12, 13-16, 17+)
- ✅ Migration file created
- ✅ Seed script created  
- ⏳ Waiting for you to apply migration
- ⏳ Then seed script will run
- ⏳ Then UI will be updated

## Next Action
**Please apply the migration SQL above in your Supabase SQL Editor, then let me know when done!**
