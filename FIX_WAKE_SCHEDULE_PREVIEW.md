# Fix Wake Schedule Preview in Device Edit Modal

## Problem Found
When you select "Daily at noon" in the Device Edit Modal, it shows hourly wake times instead of daily at noon.

**Root Cause:** The preview was reading the device's **saved** cron expression from the database (`0 * * * *`) instead of using the **form's selected** cron expression (`0 12 * * *`).

## Solution Overview
1. Apply SQL to create `preview_next_wake_times()` function for previewing any cron expression
2. Update frontend to use form's selected cron instead of device's saved cron
3. Also apply wildcard fix from earlier (if not already done)

## Step-by-Step Fix

### Step 1: Apply Wildcard Fix (if not done already)

**Open Supabase SQL Editor:**
https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

**Copy and paste:**
Open `fix-next-wake-calculation-support-star.sql` and paste all contents.

**Click Run**

---

### Step 2: Apply Preview Function

**In same SQL Editor:**

**Copy and paste:**
Open `create-preview-wake-times-function.sql` and paste all contents.

**Click Run**

---

### Step 3: Restart Dev Server

```bash
# Stop current dev server (Ctrl+C)
# Then restart:
npm run dev
```

---

## What Was Changed

### Database (SQL)
✅ Created `preview_next_wake_times()` function
- Takes any cron expression as input
- Calculates next N wake times without requiring saved device
- Used for real-time preview in the edit modal

### Frontend (TypeScript)
✅ Updated `DeviceEditModal.tsx`
- Changed from reading device's saved cron
- Now uses form's current selected cron
- Preview updates immediately when you select a preset

✅ Added `DeviceService.previewNextWakeTimes()`
- New method to call preview function
- Used by Device Edit Modal for live preview

---

## Testing After Fix

1. Open any device
2. Click "Edit"
3. Try each preset:
   - **Every hour** → Should show 1-hour intervals
   - **Every 6 hours** → Should show 6-hour intervals
   - **Daily at noon** → Should show next noon, then tomorrow noon, etc.
   - **Twice daily** → Should show next 6am or 6pm occurrence

The preview should **instantly update** when you select a different preset, even before saving.

---

## Files Modified
- `src/components/devices/DeviceEditModal.tsx` - Updated to use form cron
- `src/services/deviceService.ts` - Added previewNextWakeTimes method
- `create-preview-wake-times-function.sql` - **← APPLY THIS IN SUPABASE**
- `fix-next-wake-calculation-support-star.sql` - **← APPLY THIS TOO (if not done)**

---

## Test Script (Optional)
```bash
node test-preview-wake-times.mjs
```

This will test the preview function with all cron patterns.
