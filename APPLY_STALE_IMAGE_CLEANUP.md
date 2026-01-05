# Apply Stale Image Cleanup Migration

## Quick Start

This migration adds automatic and manual cleanup for stale images stuck in "receiving" status.

## Step 1: Apply Database Migration

The migration SQL is ready in:
`supabase/migrations/20260105024519_add_stale_image_cleanup.sql`

### Option A: Via Supabase Dashboard (Recommended)

1. Open [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **SQL Editor**
4. Copy the contents of `supabase/migrations/20260105024519_add_stale_image_cleanup.sql`
5. Paste into SQL Editor
6. Click **Run**

### Option B: Via Supabase CLI

```bash
npx supabase db push
```

## Step 2: Deploy Edge Function

The edge function is already updated in:
`supabase/functions/monitor_image_timeouts/index.ts`

Deploy it with:

```bash
npx supabase functions deploy monitor_image_timeouts
```

## Step 3: Test the Implementation

### Test Manual Clear

1. Navigate to a device with stale images (images in "receiving" status for 1+ hours)
2. Go to **Images** tab
3. Find the "In Progress" section
4. Click **Clear Stale Images** button
5. Confirm the action in the dialog
6. Verify:
   - Toast shows "Cleared X stale images"
   - Images moved from "In Progress" to "Failed Images" section
   - Failed images show timeout_reason: "Manually cleared by user"

### Test Auto-Clear

1. Create a test image in "receiving" status with `updated_at` > 1 hour ago:

```sql
-- Create test stale image
INSERT INTO device_images (
  device_id,
  image_name,
  status,
  captured_at,
  updated_at,
  total_chunks,
  received_chunks
)
SELECT
  device_id,
  'test_stale_image.jpg',
  'receiving',
  now() - interval '2 hours',
  now() - interval '2 hours',
  73,
  0
FROM devices
WHERE provisioning_status = 'active'
LIMIT 1;
```

2. Trigger the monitor function manually or wait for scheduled run
3. Verify image is marked as 'failed' with timeout_reason: "Stale receiving state - no progress after 1 hour"

### Test RPC Functions Directly

```sql
-- Test clear_stale_receiving_images
SELECT * FROM clear_stale_receiving_images();

-- Test manually_clear_stale_images for specific device
SELECT * FROM manually_clear_stale_images(
  'your-device-id-here'::uuid,
  1 -- age in hours
);
```

## Verification Checklist

- [ ] Database functions created successfully
- [ ] Edge function deployed
- [ ] Manual clear button appears in UI
- [ ] Manual clear works and shows toast
- [ ] Auto-clear runs and marks stale images as failed
- [ ] Device history events created for cleared images
- [ ] Cleared images appear in "Failed Images" section

## Rollback (If Needed)

To rollback the changes:

```sql
-- Drop the functions
DROP FUNCTION IF EXISTS clear_stale_receiving_images();
DROP FUNCTION IF EXISTS manually_clear_stale_images(uuid, integer);
```

Note: This doesn't revert images already marked as failed. Those remain in their current state for audit purposes.

## Support

If you encounter issues:

1. Check Supabase logs for function errors
2. Verify RPC functions exist: `SELECT * FROM pg_proc WHERE proname LIKE '%stale%';`
3. Check device_history for cleanup events
4. Review browser console for frontend errors
