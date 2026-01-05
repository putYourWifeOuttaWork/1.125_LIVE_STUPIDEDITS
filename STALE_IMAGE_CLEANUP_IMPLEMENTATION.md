# Stale Image Cleanup Implementation

## Overview

Implemented automatic and manual cleanup for stale images stuck in "receiving" or "pending" status. This fixes the issue where images with 0 chunks received remain in the "In Progress" section for days.

## Features Implemented

### 1. Automatic Cleanup (Background)
- **Trigger**: Runs automatically via `monitor_image_timeouts` edge function
- **Threshold**: Images older than 1 hour
- **Action**: Marks stale images as 'failed' with timeout_reason
- **Logging**: Creates device_history events for audit trail

### 2. Manual Cleanup (UI Button)
- **Location**: Device Detail Page > Images Tab > In Progress section
- **Button**: "Clear Stale Images" button with warning icon
- **Confirmation**: Shows dialog before clearing
- **Feedback**: Toast notification with count of cleared images

## Files Modified

### Database Migration
- **File**: `supabase/migrations/20260105024519_add_stale_image_cleanup.sql`
- **Functions Added**:
  - `clear_stale_receiving_images()` - Auto-clear images stuck 1+ hours
  - `manually_clear_stale_images(device_id, age_hours)` - Manual clear for specific device

### Backend
- **File**: `supabase/functions/monitor_image_timeouts/index.ts`
- **Changes**:
  - Added Step 1C to call `clear_stale_receiving_images()`
  - Creates device history events for cleared images
  - Updates response summary with `stale_images_cleared` count

### Frontend Hook
- **File**: `src/hooks/useDevice.ts`
- **Changes**:
  - Added `clearStaleImagesMutation`
  - Exported `clearStaleImages(ageHours)` function
  - Exported `isClearingStale` loading state

### Frontend UI
- **File**: `src/components/devices/DeviceImagesPanel.tsx`
- **Changes**:
  - Added "Clear Stale Images" button in "In Progress" section header
  - Added `handleClearStale` function with confirmation dialog
  - Integrated with `clearStaleImages` hook function

## How It Works

### Automatic Cleanup Flow
1. `monitor_image_timeouts` edge function runs (scheduled via cron)
2. Calls `clear_stale_receiving_images()` RPC function
3. Function finds images in 'receiving'/'pending' status older than 1 hour
4. Marks them as 'failed' with timeout_reason
5. Creates device_history events for audit trail
6. Returns list of cleared images

### Manual Cleanup Flow
1. User navigates to Device Detail > Images tab
2. Sees "Clear Stale Images" button in "In Progress" section
3. Clicks button
4. Confirms action in dialog
5. Calls `manually_clear_stale_images(device_id, 1)` RPC
6. Function clears images older than 1 hour for that device
7. Toast shows count of cleared images
8. UI refreshes automatically via React Query

## Database Functions

### clear_stale_receiving_images()
```sql
-- Auto-clear images stuck in receiving state for 1+ hours
-- Returns: list of cleared images with age in minutes
```

**Logic**:
- Finds images with status IN ('receiving', 'pending')
- Where updated_at < now() - interval '1 hour'
- Updates status to 'failed'
- Sets timeout_reason = 'Stale receiving state - no progress after 1 hour'
- Returns device_id, image_id, image_name, chunks info, age_minutes

### manually_clear_stale_images(device_id, age_hours)
```sql
-- Manually clear stale images for a specific device
-- Parameters:
--   p_device_id: Device UUID
--   p_age_hours: How old images must be (default 1)
-- Returns: count of cleared images and JSON list
```

**Logic**:
- Finds images for specific device_id
- Where status IN ('receiving', 'pending')
- Where updated_at < now() - age_hours
- Updates status to 'failed'
- Sets timeout_reason = 'Manually cleared by user'
- Returns count and JSONB array of cleared images

## User Experience

### Before
- Images stuck at "Started 1 day ago" with 0% progress
- Cluttered "In Progress" section
- No way to manually clear stale images

### After
- **Automatic**: Stale images auto-cleared after 1 hour
- **Manual**: "Clear Stale Images" button for immediate cleanup
- **Transparent**: Confirmation dialog before clearing
- **Feedback**: Toast shows "Cleared X stale images"
- **Audit**: Device history events track all cleanup operations

## Data Preservation

**Important**: Images are marked as 'failed', NOT deleted
- Preserves data for audit trail
- Can review timeout_reason field
- Device history events provide complete timeline

## Testing

### Build Status
- All TypeScript compilation successful
- No build errors
- Ready for deployment

### Next Steps to Test
1. **Database Migration**: Apply migration to add RPC functions
2. **Deploy Edge Function**: Push updated monitor_image_timeouts function
3. **Test Auto-Clear**: Wait for edge function to run or trigger manually
4. **Test Manual Clear**:
   - Navigate to device with stale images
   - Click "Clear Stale Images" button
   - Verify confirmation dialog
   - Verify toast notification
   - Check images moved to "Failed" section

## Migration Application

**IMPORTANT**: The database migration needs to be applied manually.

The migration SQL is ready in:
`supabase/migrations/20260105024519_add_stale_image_cleanup.sql`

Apply it via:
- Supabase Dashboard SQL Editor
- OR Supabase CLI: `npx supabase db push`

## Configuration

### Timeout Threshold
- **Current**: 1 hour
- **Configurable**: Can be adjusted in migration SQL or passed as parameter

### Auto-Clear Frequency
- Depends on `monitor_image_timeouts` edge function schedule
- Typically runs every 15-30 minutes

## Benefits

1. **Clean UI**: No more clutter from 1-day-old stuck images
2. **User Control**: Manual button for immediate cleanup
3. **Transparency**: Clear feedback and confirmation
4. **Audit Trail**: Complete history in device_history table
5. **Data Safety**: Images marked failed, not deleted
6. **Performance**: Indexed queries, fast execution
