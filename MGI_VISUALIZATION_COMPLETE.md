# MGI Visualization System - Current State & Requirements

## ✅ What Already Exists

### 1. **MGI Utilities** (`src/utils/mgiUtils.ts`)
Complete set of utility functions for MGI scoring and visualization:
- **MGI Color Coding**: 
  - 0-30%: Green (healthy)
  - 31-50%: Yellow/Amber (warning)
  - 51-65%: Orange (concerning)
  - 65%+: Red (critical)
- **Velocity Thresholds**: 1-3% (small), 4-7% (medium), 8-12% (large), 12%+ (very large)
- **Pulse Sizing & Duration**: Dynamically calculated based on velocity
- **Formatting Functions**: `formatMGI()`, `formatVelocity()`, `formatSpeed()`

### 2. **SiteMapViewer Component** (`src/components/lab/SiteMapViewer.tsx`)
**READ-ONLY** D3-based map viewer with:
- ✅ Device positioning from site coordinates
- ✅ MGI color coding on device circles
- ✅ Velocity pulse animations (continuous, growing circles)
- ✅ Pulse radius scales with velocity (small → very large)
- ✅ Pulse duration speeds up with higher velocity
- ✅ Wall/obstacle rendering
- ✅ Grid overlay with 10ft reference
- ✅ Device tooltips on hover
- ✅ Responsive sizing based on site dimensions
- ✅ Device click handler for navigation

**Status**: This is your SNAPSHOT VIEWER for read-only display

### 3. **SiteMapEditor Component** (`src/components/sites/SiteMapEditor.tsx`)
**INTERACTIVE** Canvas-based editor with:
- ✅ Drag-and-drop device positioning
- ✅ Grid snapping
- ✅ Device status color coding (active=green, offline=red)
- ✅ Right-click context menu support
- ✅ Double-click for device details
- ✅ Grid toggle
- ✅ Real-time coordinate display
- ✅ Battery level indicators

**Status**: This is your WORKING MAP for device placement

### 4. **SiteMapAnalyticsViewer Component** (`src/components/lab/SiteMapAnalyticsViewer.tsx`)
Canvas-based viewer with:
- ✅ Voronoi zone visualization (temperature, humidity, battery, MGI)
- ✅ Delaunay triangulation for heat mapping
- ✅ D3 color scales for gradient zones
- ✅ Zone mode switching
- ✅ Device click handlers

**Status**: Analytics-focused viewer with zone overlays

### 5. **Current Usage**

**HomePage** (`src/pages/HomePage.tsx`):
- Uses `SiteMapAnalyticsViewer`
- Shows current state of selected site
- Displays devices with latest MGI from `petri_observations` ⚠️

**SitesPage** (`src/pages/SitesPage.tsx`):
- Shows site cards/list
- No map visualization currently

**SiteTemplateManagementPage** (`src/pages/SiteTemplateManagementPage.tsx`):
- Uses `DeviceSetupStep` component
- Contains `SiteMapEditor` for device placement
- This is where devices are positioned on the working map

---

## 🚨 Critical Issues Found

### 1. **HomePage Still Using `petri_observations`**
Location: `src/pages/HomePage.tsx:129`

```typescript
// ❌ OLD: Fetching MGI from petri_observations
const { data: mgiData } = await supabase
  .from('petri_observations')
  .select('mgi_score')
  .eq('device_id', device.device_id)
  .not('mgi_score', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

**Should be:**
```typescript
// ✅ NEW: Fetch MGI from device_images
const { data: mgiData } = await supabase
  .from('device_images')
  .select('mgi_score, mgi_velocity')
  .eq('device_id', device.device_id)
  .not('mgi_score', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

### 2. **Missing Velocity Data on HomePage**
Current code only fetches `mgi_score`, but we also need `mgi_velocity` for pulse animations.

### 3. **MGI Thresholds Don't Match Requirements**
Current thresholds in `mgiUtils.ts`:
- 0-30%: Green
- 31-50%: Yellow
- 51-65%: Orange
- 65%+: Red

**Your Requirements:**
- 0-10: Green
- 11-25: Yellow
- 26-40: Orange
- 41+: Red

### 4. **Velocity Thresholds Don't Match Requirements**
Current thresholds:
- 1-3%: Small
- 4-7%: Medium
- 8-12%: Large
- 12%+: Very Large

**Your Requirements (MGIV = MGI Velocity):**
- 1-5: Green, small pulse
- 6-8: Yellow, medium-small pulse
- 9-12: Orange, medium pulse
- 13-16: Red, large pulse
- 17+: Critical (red with SVG icon)

---

## 📋 What Needs to Be Built

### 1. **Timeline Animation System**
**NEW Component**: `SessionSnapshotViewer` (already exists at `src/pages/lab/SessionSnapshotViewer.tsx`)

Requirements:
- Load all snapshots for a site since program start
- Show snapshots for selected day
- Animated playback with play/pause/scrub controls
- Timeline slider to navigate between snapshots
- Each snapshot shows:
  - Device positions (static)
  - Device MGI color at that snapshot time
  - Velocity pulse animation at that snapshot time
  - Critical indicator (SVG) if velocity > 16

### 2. **Fix HomePage MGI Data Source**
- Change from `petri_observations` to `device_images`
- Fetch both `mgi_score` and `mgi_velocity`
- Use `device.latest_mgi_score` and `device.latest_mgi_velocity` from devices table (faster)

### 3. **Update MGI Thresholds**
Update `src/utils/mgiUtils.ts`:
- Fix MGI_THRESHOLDS to match 0-10, 11-25, 26-40, 41+
- Fix VELOCITY_THRESHOLDS to match 1-5, 6-8, 9-12, 13-16, 17+
- Add critical velocity SVG indicator function

### 4. **Snapshot Generation Integration**
- Call `generate_site_snapshot(site_id)` periodically (every 3 hours default)
- Store in `site_snapshots` table
- Query snapshots for timeline playback

---

## 🎯 Implementation Plan

### Phase 1: Fix Existing Issues (URGENT)
1. Update `mgiUtils.ts` thresholds to match requirements
2. Fix HomePage to use `device_images` instead of `petri_observations`
3. Add `mgi_velocity` to device data fetching

### Phase 2: Snapshot Timeline Viewer
1. Check existing `SessionSnapshotViewer` component
2. Build timeline controls (play, pause, scrub, date picker)
3. Load snapshots from `site_snapshots` table
4. Render devices with snapshot-time MGI/velocity

### Phase 3: Critical Velocity Indicator
1. Add SVG icon for critical velocity (17+)
2. Update `SiteMapViewer` to show critical icon
3. Add to snapshot viewer

### Phase 4: Testing & Polish
1. Test with real snapshot data
2. Verify pulse animations match velocity
3. Ensure timeline scrubbing is smooth
4. Add loading states

---

## 🗺️ Map Component Decision Matrix

| Component | Type | Use Case | Location | Features |
|-----------|------|----------|----------|----------|
| `SiteMapViewer` | READ-ONLY | Snapshot viewing | Lab pages | D3, MGI colors, velocity pulses |
| `SiteMapEditor` | INTERACTIVE | Device placement | Template management | Drag-drop, grid snapping |
| `SiteMapAnalyticsViewer` | READ-ONLY | Current state | HomePage | Voronoi zones, analytics |
| `SessionSnapshotViewer` | READ-ONLY | Timeline playback | Site detail page | Animation, scrubbing |

---

## 📊 Data Architecture

**Current State (HomePage):**
```
Sites Page → Selected Site → SiteMapAnalyticsViewer
                           → Devices with latest MGI from petri_observations ❌
```

**Target State:**
```
Sites Page → Selected Site → SiteMapAnalyticsViewer
                           → Devices with latest_mgi_* from devices table ✅
           → Site Detail → SessionSnapshotViewer
                         → site_snapshots table (timeline data)
```

**Snapshot Structure:**
```typescript
site_snapshots {
  snapshot_id: UUID
  site_id: UUID
  snapshot_time: timestamp
  device_states: JSONB {
    device_id, device_name, x_position, y_position,
    latest_mgi_score, latest_mgi_velocity, battery_voltage
  }[]
  device_count: int
  active_device_count: int
}
```

---

## ✨ Summary

You have excellent foundations:
- ✅ MGI utilities with pulse animations
- ✅ Read-only and interactive map components
- ✅ Site snapshot table and functions
- ✅ D3-based visualization

**Critical fixes needed:**
1. Fix MGI thresholds (0-10, 11-25, 26-40, 41+)
2. Fix velocity thresholds (1-5, 6-8, 9-12, 13-16, 17+)
3. Update HomePage to use `device_images` not `petri_observations`
4. Add critical velocity indicator (SVG icon for 17+)

**New feature to build:**
- Timeline animation system using `site_snapshots`

Your architecture is solid - we just need to fix the thresholds, data sources, and add the timeline playback system!
