# Apply MGI Migration - CORRECTED

## What Was Wrong
The original migration tried to use `submissions.device_id` but the correct column is `submissions.created_by_device_id`.

## Fixed Migration File
**`fix-device-id-migration.sql`** - Now uses the correct column name

## Apply via Supabase Dashboard (Recommended)

1. Open **Supabase Dashboard**
2. Go to **SQL Editor**
3. Copy/paste the entire contents of `fix-device-id-migration.sql`
4. Click **Run**

## What This Migration Does

1. Adds `device_id` column to `petri_observations` table
2. Backfills existing records using `submissions.created_by_device_id`
3. Creates indexes for efficient MGI queries
4. Enables homepage map to show MGI zones

## After Applying

### Create Test Data
```bash
node test-mgi-visualization.mjs
```

This creates 3 mock MGI scores:
- Device 1: 25% (low/green)
- Device 2: 65% (medium/yellow)
- Device 3: 85% (high/red)

### View on Homepage
1. Refresh your homepage
2. Select **"Mold Growth (MGI)"** from Zones dropdown
3. See colored zones on the site map!

## Verification

Check the column exists:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'petri_observations'
AND column_name = 'device_id';
```

Check data was backfilled:
```sql
SELECT 
  COUNT(*) as total_observations,
  COUNT(device_id) as with_device_id,
  COUNT(device_id) * 100.0 / COUNT(*) as percent_filled
FROM petri_observations;
```

## Test with Real Petri Dish Images

Once the migration is applied and test data created:

```bash
# Get any public petri dish image URL
IMAGE_URL="https://your-image-url.jpg"

# Test Roboflow scoring
node test/test_mgi_scoring.mjs test-image-1 "$IMAGE_URL"
```

Roboflow will analyze the image and save MGI score to the database!
