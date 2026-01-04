# MGI Images Tab Fix - Ready to Apply

## Problem Identified

The "Images & MGI Scores" tab on the Session Detail page was showing **"0 Images with MGI Scores"** even though:
- 20 images exist for the session
- The Overview tab correctly shows MGI aggregates (0.5 average, 18 samples)
- The device_images table has mgi_score values populated

## Root Cause

The `get_session_devices_with_wakes` database function was not selecting the `mgi_score` and `mgi_velocity` fields when fetching images. It was only returning:
- image_id
- captured_at
- image_url
- status
- wake_window_index

When the frontend checked `img.mgi_score != null`, it was always null because the field wasn't included in the query.

## Solution Created

A migration file has been created that updates the function to include MGI fields:

**File:** `supabase/migrations/20260104000000_add_mgi_to_session_images.sql`

The migration adds two fields to the images subquery:
- `mgi_score` - The MGI score for the image
- `mgi_velocity` - The MGI velocity calculation

## How to Apply the Fix

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase Dashboard:
   https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff

2. Navigate to **SQL Editor** in the left sidebar

3. Click **"New query"**

4. Copy the entire contents of this file:
   `supabase/migrations/20260104000000_add_mgi_to_session_images.sql`

5. Paste into the SQL Editor

6. Click **"Run"** (or press Cmd/Ctrl + Enter)

7. You should see: "Success. No rows returned"

### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
supabase db push --include-all
```

### Option 3: Run Helper Script

```bash
node apply-mgi-migration-direct.mjs
```

This will display the full SQL that you can copy/paste into the dashboard.

## Expected Results

After applying the migration:

1. **Images & MGI Scores Tab** - The summary stats will correctly show:
   - "Images with MGI Scores" will show the actual count (e.g., 18 instead of 0)

2. **Device Sections** - Each device will show:
   - "20 images" and "18 with MGI" (or similar accurate counts)

3. **Individual Images** - MGI data will be available for each image card

## Testing the Fix

1. Go to any session detail page with images that have MGI scores
2. Click the "Images & MGI Scores" tab
3. Verify the summary shows correct count of images with MGI scores
4. Check individual device sections show "X with MGI" counts
5. Refresh the page to ensure data loads correctly

## No Code Changes Required

The frontend code already checks for `img.mgi_score` - it just needs the data to be present in the API response. Once this migration is applied, everything will work immediately without any frontend changes.

## Rollback (if needed)

If you need to rollback, you can restore the previous version of the function from:
`supabase/migrations/20251123170000_fix_completed_wakes_exclude_overage.sql`

However, this is unlikely to be necessary as the change is purely additive (adding fields) and won't break existing functionality.
