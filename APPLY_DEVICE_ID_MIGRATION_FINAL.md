# Apply Device ID Migration - FINAL CORRECTED VERSION

## All Issues Fixed

1. ✅ Used correct column: `submissions.created_by_device_id`
2. ✅ Used correct column: `petri_observations.created_at` (not captured_at)
3. ✅ Updated test script with required petri_observations fields

## Migration File

**`fix-device-id-migration.sql`** - Ready to apply!

## Apply Now (Supabase Dashboard)

1. Open **Supabase Dashboard**
2. Go to **SQL Editor**
3. Copy/paste entire contents of `fix-device-id-migration.sql`
4. Click **Run**

## What This Does

- Adds `device_id` column to `petri_observations`
- Backfills from `submissions.created_by_device_id`
- Creates indexes on `(device_id, created_at)`
- Enables MGI visualization on homepage map

## After Migration

### Test with Mock Data

```bash
node test-mgi-visualization.mjs
```

Creates 3 devices with MGI scores:
- Device 1: 25% (green zone)
- Device 2: 65% (yellow zone) 
- Device 3: 85% (red zone)

### View on Homepage

1. Refresh homepage
2. Select **"Mold Growth (MGI)"** from Zones dropdown
3. See beautiful colored zones!

## Verification Queries

Check column exists:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'petri_observations'
AND column_name = 'device_id';
```

Check backfill worked:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(device_id) as with_device_id
FROM petri_observations;
```

Check indexes created:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'petri_observations'
AND indexname LIKE '%device%';
```

## Test with Real Petri Images

The Roboflow integration is ready:

```bash
# Get any public petri dish image
IMAGE_URL="https://example.com/petri.jpg"

# Score it with Roboflow
node test/test_mgi_scoring.mjs test-image "$IMAGE_URL"
```

Roboflow will:
- Analyze the image
- Return MGI score (0-100%)
- Save to database
- Show on map immediately!

## Build Status

✅ TypeScript compiles successfully  
✅ No errors  
✅ Ready to deploy
