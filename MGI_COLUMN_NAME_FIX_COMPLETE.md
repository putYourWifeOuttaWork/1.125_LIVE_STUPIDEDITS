# MGI Column Name Fix - Complete

## Problem Identified

The lightbox was showing "N/A" for all environmental data (Temperature, Humidity, MGI Velocity) even though the data existed in the database.

### Root Cause
The SQL query and frontend TypeScript were using **outdated column names**:
- ❌ `mold_growth_velocity` (deprecated, always NULL)
- ❌ `mold_growth_speed` (deprecated, always NULL)

The **correct** column names are:
- ✅ `mgi_velocity` (contains actual data)
- ✅ `mgi_speed` (contains actual data)

## Files Fixed

### 1. SQL Migration Function
**File:** `supabase/migrations/20260104000000_add_mgi_to_session_images.sql`

**Changed:**
```sql
-- OLD (wrong column names):
di.mold_growth_velocity,
di.mold_growth_speed,

-- NEW (correct column names):
di.mgi_velocity,
di.mgi_speed,
```

**Changes made at:**
- Line 159-160: JSON field names in jsonb_build_object
- Line 176-177: Column selection in subquery
- Line 10: Comment documentation
- Line 232: Function comment

### 2. Frontend TypeScript Interface
**File:** `src/components/devices/DeviceImageLightbox.tsx`

**Changed:**
```typescript
// OLD interface:
interface DeviceImageData {
  mold_growth_velocity?: number | null;
  mold_growth_speed?: number | null;
  // ...
}

// NEW interface:
interface DeviceImageData {
  mgi_velocity?: number | null;
  mgi_speed?: number | null;
  // ...
}
```

**Changed all references:**
- Line 14-15: Interface definition
- Line 339-358: MGI Velocity display logic (all conditionals and formatting)

### 3. Session Detail Page
**File:** `src/pages/SiteDeviceSessionDetailPage.tsx`

**Changed all references:**
- Line 2677: Conditional check for showing MGI section
- Line 2680-2696: MGI Velocity display with all conditionals
- Line 2700-2708: MGI Speed display with all conditionals

## Database Schema Clarification

### Current Schema (CORRECT)
```sql
-- From APPLY_MGI_MIGRATION.sql:
ALTER TABLE device_images ADD COLUMN mgi_velocity NUMERIC(6,2);
ALTER TABLE device_images ADD COLUMN mgi_speed NUMERIC(6,3);
```

### Deprecated Columns (DO NOT USE)
```sql
-- From 20251116000005_phase2_device_analytics_infrastructure.sql:
ALTER TABLE device_images ADD COLUMN mold_growth_velocity NUMERIC;
ALTER TABLE device_images ADD COLUMN mold_growth_speed NUMERIC;
```

These old columns exist but are **always NULL** and should not be used.

## Data Verification

User provided actual data from database showing:
```json
{
  "mgi_score": "0.74",
  "mold_growth_velocity": null,  // ❌ Deprecated - always NULL
  "mold_growth_speed": null,     // ❌ Deprecated - always NULL
  "mgi_velocity": "0.04",        // ✅ Correct - has data
  "mgi_speed": "0.013",          // ✅ Correct - has data
  "temperature": "24.50594521",  // ✅ From computed column
  "humidity": "52.84191895"      // ✅ From computed column
}
```

## Temperature & Humidity Data Sources

**CORRECT** - Using device_images computed columns:
```sql
di.temperature  -- GENERATED column from metadata->>'temperature'
di.humidity     -- GENERATED column from metadata->>'humidity'
```

These are STORED computed columns that extract from the metadata JSONB field.

## Testing & Verification

### Build Status
✅ TypeScript compilation successful
✅ Production build completed in 19.09s
✅ No errors or warnings

### Expected Behavior After Fix
When viewing images in the lightbox carousel, users will now see:

1. **MGI Score**: Displays actual value (e.g., "74.0%")
2. **MGI Velocity**: Shows day-over-day change with trend arrow (e.g., "+4.0%")
3. **Temperature**: Converted from Celsius to Fahrenheit with color coding
4. **Humidity**: Displayed as percentage with color coding
5. **HIGH RISK Warning**: Shows when temp > 80°F AND humidity > 70%

### What Was Broken Before
All these fields showed "N/A" because:
- SQL was selecting from NULL columns (`mold_growth_velocity`, `mold_growth_speed`)
- Frontend interface expected those NULL column names
- Actual data in `mgi_velocity` and `mgi_speed` was never retrieved

## Migration Notes

### For Deployment
1. Apply updated SQL migration (recreates the function with correct column names)
2. No data migration needed (columns already exist with data)
3. Frontend will immediately start showing data once function is updated

### Database Changes Required
Run this SQL in Supabase SQL Editor:
```sql
-- Apply: /supabase/migrations/20260104000000_add_mgi_to_session_images.sql
-- This will replace the get_session_devices_with_wakes() function
-- with the corrected version using mgi_velocity and mgi_speed
```

### No Breaking Changes
- Existing functionality preserved
- Backward compatible (handles NULL values gracefully)
- No schema changes required (columns already exist)

## Optional Cleanup (Future)

Consider removing deprecated columns in a future migration:
```sql
-- OPTIONAL - Remove deprecated columns
ALTER TABLE device_images DROP COLUMN IF EXISTS mold_growth_velocity;
ALTER TABLE device_images DROP COLUMN IF EXISTS mold_growth_speed;
```

**Recommendation:** Don't remove yet - wait until we're 100% sure nothing else references them.

## Success Criteria

✅ SQL function uses correct column names (`mgi_velocity`, `mgi_speed`)
✅ Frontend TypeScript interface matches database schema
✅ All references updated in both files
✅ Build completes successfully with no errors
✅ Temperature and humidity pull from computed columns
✅ Data will display in lightbox after SQL function is redeployed

---

**Status:** ✅ COMPLETE AND READY TO DEPLOY
**Date:** January 4, 2026
**Build:** Successful (19.09s)
**Breaking Changes:** None
**Migration Required:** Yes (SQL function update only)
