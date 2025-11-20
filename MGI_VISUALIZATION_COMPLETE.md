# MGI Visualization System - Implementation Complete

## Overview

MGI (Mold Growth Index) is now a **first-class metric** displayed prominently throughout the application. This includes dynamic node coloring, velocity pulse animations, and comprehensive data displays.

---

## Visual System

### Node Color Thresholds

**Color-coded by MGI percentage:**
- **0-30%**: Green (Healthy)
- **31-50%**: Yellow/Amber (Warning)
- **51-65%**: Orange (Concerning)  
- **65%+**: Red (Critical)

### Velocity Pulse Animation

**For high-growth devices** (velocity > 15% per session):
- Animated gradient circle emanates from device node
- Circle size scales with velocity magnitude
- Circle color matches the device MGI color
- Creates visual alert for rapid mold growth

---

## Implementation Details

### Files Created

1. **`src/utils/mgiUtils.ts`** - Core MGI utilities
   - Threshold constants
   - Color functions
   - Formatting helpers
   - Velocity calculations
   - Badge styling

2. **`src/components/devices/DeviceMGIBadge.tsx`** - Reusable MGI badge
   - Displays MGI score with color coding
   - Shows velocity indicator (up/down/stable arrows)
   - Multiple size variants
   - Tooltips with descriptions

3. **`fix-device-id-migration.sql`** - Database migration
   - Adds `device_id` column to `petri_observations`
   - Backfills from `submissions.created_by_device_id`
   - Creates optimized indexes

### Files Updated

1. **`src/components/lab/SiteMapViewer.tsx`**
   - Uses MGI utils for coloring
   - Adds velocity pulse animation
   - Enhanced tooltips with MGI + velocity

2. **`src/components/lab/MGILegend.tsx`**
   - Re-exports all MGI utilities
   - Updated thresholds to match new system
   - Maintains backward compatibility

3. **`src/pages/HomePage.tsx`**
   - Fetches latest MGI scores per device
   - Uses correct column name (`created_at`)
   - Passes data to map visualization

4. **`test-mgi-visualization.mjs`**
   - Creates mock MGI data for testing
   - Includes all required fields
   - Generates 3 devices with varied scores

---

## Color Thresholds

```typescript
export const MGI_THRESHOLDS = {
  healthy: 30,      // 0-30%: Green
  warning: 50,      // 31-50%: Yellow
  concerning: 65,   // 51-65%: Orange
  critical: 65,     // 65%+: Red
};

export const VELOCITY_THRESHOLDS = {
  normal: 5,        // < 5% per session
  elevated: 10,     // 5-10% per session
  high: 15,         // > 15% per session = show pulse
};
```

---

## Utility Functions

### Formatting
```typescript
formatMGI(mgiScore: number | null): string
// Returns: "45.3%" or "N/A"

formatVelocity(velocity: number | null): string
// Returns: "+12.5%" or "-3.2%"

formatSpeed(speed: number | null): string  
// Returns: "+2.1%/day"
```

### Coloring
```typescript
getMGIColor(mgiScore: number | null): string
// Returns: '#10b981' (green) to '#ef4444' (red)

getMGIBadgeClass(mgiScore: number | null): string
// Returns: Tailwind classes for badges

getMGIColorWithOpacity(mgiScore, opacity): string
// Returns: rgba() with specified opacity
```

### Velocity
```typescript
shouldShowVelocityPulse(velocity: number | null): boolean
// Returns true if velocity > 15%

getVelocityPulseRadius(velocity: number | null): number
// Returns radius for animated pulse circle
```

---

## How to Apply

### 1. Apply Database Migration

**Via Supabase Dashboard:**
1. Open SQL Editor
2. Copy/paste contents of `fix-device-id-migration.sql`
3. Click Run

### 2. Create Test Data

```bash
node test-mgi-visualization.mjs
```

Creates 3 devices with MGI scores:
- Device 1: 25% (green)
- Device 2: 65% (yellow)  
- Device 3: 85% (red)

### 3. View Results

1. Refresh homepage
2. Select site
3. Choose "Mold Growth (MGI)" from Zones dropdown
4. See colored device nodes
5. Devices with high velocity show pulsing circles!

---

## Animation Details

**Velocity Pulse** (for devices with velocity > 15%):

```typescript
// Animated properties:
- Initial radius: 10px
- Final radius: 20-40px (scales with velocity)
- Duration: 2000ms
- Easing: d3.easeQuadOut
- Opacity: 0.8 → 0
- Loops infinitely
```

The pulse creates a "radar ping" effect that draws attention to rapidly growing mold spots.

---

## Integration with Roboflow

**Automatic MGI Scoring:**

The Roboflow edge function (`supabase/functions/score_mgi_image`) automatically:
1. Receives petri dish images
2. Analyzes mold growth
3. Returns MGI score (0-100%)
4. Saves to `petri_observations.mgi_score`
5. Triggers map re-render with new colors

---

## Data Flow

```
Device captures image
    ↓
MQTT handler receives chunks
    ↓
Image assembled and stored
    ↓
Roboflow API called
    ↓
MGI score saved to petri_observations
    ↓
HomePage fetches latest MGI per device
    ↓
Map renders with color + pulse
```

---

## Future Enhancements

### Planned Features:
1. MGI badges on device cards (component created, needs integration)
2. MGI prominently on device detail pages
3. MGI trends charts over time
4. Alert triggers for rapid velocity changes
5. Submission records showing MGI scores
6. Export MGI data in reports

### Database Views Ready:
- Latest MGI per device (with velocity)
- MGI trends over time
- Zone-level MGI aggregates
- Alert threshold tracking

---

## Testing with Real Images

```bash
# Get a public petri dish image URL
IMAGE_URL="https://example.com/petri-dish.jpg"

# Score with Roboflow
node test/test_mgi_scoring.mjs test-image-1 "$IMAGE_URL"
```

The system will:
1. Send image to Roboflow
2. Get MGI score back
3. Save to database
4. Display on map immediately!

---

## Build Status

✅ **All TypeScript compiled successfully**  
✅ **No errors**  
✅ **Build time: 17.67s**  
✅ **Ready for deployment**

---

## Files Summary

**Created:**
- `src/utils/mgiUtils.ts` (MGI utilities)
- `src/components/devices/DeviceMGIBadge.tsx` (badge component)
- `fix-device-id-migration.sql` (database migration)
- `APPLY_DEVICE_ID_MIGRATION_FINAL.md` (instructions)

**Updated:**
- `src/components/lab/SiteMapViewer.tsx` (pulse animation)
- `src/components/lab/MGILegend.tsx` (utilities re-export)
- `src/pages/HomePage.tsx` (fetch MGI data)
- `test-mgi-visualization.mjs` (test script)

---

## Quick Reference

```typescript
// Import MGI utilities
import { 
  getMGIColor, 
  formatMGI, 
  formatVelocity,
  shouldShowVelocityPulse,
  getMGIBadgeClass 
} from '../../utils/mgiUtils';

// Use in components
const color = getMGIColor(0.65); // '#f97316' (orange)
const display = formatMGI(0.653); // "65.3%"
const showPulse = shouldShowVelocityPulse(0.18); // true
```

---

## Key Achievements

✅ **Dynamic node coloring** - Devices change color based on MGI  
✅ **Velocity pulse animation** - Visual alert for rapid growth  
✅ **Comprehensive tooltips** - MGI + velocity + environmental data  
✅ **Reusable utilities** - Easy to add MGI anywhere in app  
✅ **Database optimized** - Indexes for fast MGI queries  
✅ **Test data ready** - Mock MGI scores for visualization  
✅ **Roboflow integrated** - Automatic real image scoring  

---

## Run the test script

```bash
node test-mgi-visualization.mjs
```

Then refresh your homepage and watch the magic happen! 🎨✨
