# Quick Start: Fix Session Visualization

## 2-Minute Fix

Your January 4, 2026 session has data but the map is blank because snapshots are missing metadata. Here's how to fix it:

### Step 1: Apply SQL (2 minutes)
1. Open https://supabase.com/dashboard → Your Project → SQL Editor
2. Copy all contents of: **`fix-comprehensive-snapshot-function.sql`**
3. Paste → Click "Run" → Wait for success

### Step 2: Regenerate Snapshots (30 seconds)
```bash
node regenerate-jan4-snapshots.mjs
```

### Step 3: View Results
- Refresh your session detail page
- Map should now display with device positions
- Timeline should show 13 wake periods with data

## What This Does

**Problem:** Snapshots have simplified structure missing site layout and zones

**Solution:** Updates database function to generate complete snapshots with:
- Site dimensions and layout (walls, doors, platforms)
- Device positions and states
- Environmental zones for heat maps
- Full telemetry data with LOCF (carries forward last readings)

**No Code Changes Needed:** TypeScript types already updated, UI already ready

## Files You Need

| File | What For |
|------|----------|
| `fix-comprehensive-snapshot-function.sql` | Apply in Supabase SQL Editor |
| `regenerate-jan4-snapshots.mjs` | Run after SQL applied |
| `SNAPSHOT_FIX_COMPLETE_SUMMARY.md` | Detailed explanation |

## Status

✅ TypeScript types updated
✅ Build successful
✅ Frontend ready
⏳ **Waiting: Apply SQL function** (manual step)
⏳ **Then: Run regeneration script**
⏳ **Finally: Test in UI**

## Session Details

- **Date:** January 4, 2026 (shows as Jan 3 in UI - date display issue separate from visualization)
- **Session ID:** `4889eee2-6836-4f52-bbe4-9391e0930f88`
- **Completed Wakes:** 23 / 36
- **Images:** 22
- **Current Snapshots:** 13 (incomplete)
- **After Fix:** 13 (complete with all metadata)

---

**Start here:** Open `fix-comprehensive-snapshot-function.sql` in Supabase SQL Editor
