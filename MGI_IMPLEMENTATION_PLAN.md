# MGI System - Complete Implementation Plan

## 📋 Context & Current State

### What We're Working With:
1. **MGI System**: Database schema complete with `device_images` as source of truth
2. **Existing Maps**: 
   - `SiteMapViewer` (D3, read-only with pulse animations)
   - `SiteMapEditor` (Canvas, drag-drop editing)  
   - `SiteMapAnalyticsViewer` (Canvas, analytics zones)
3. **Pages That Need MGI**:
   - HomePage (already uses map but wrong data source)
   - Site detail pages (need timeline snapshots)
   - Device detail pages (missing MGI & site map)
   - Device-session pages (missing MGI & site map)

### Critical Issues:
- ❌ HomePage fetches from `petri_observations` (line 129)
- ❌ Wrong thresholds for MGI colors (0-30, 31-50, 51-65, 65+)
- ❌ Wrong thresholds for velocity pulses (1-3, 4-7, 8-12, 12+)
- ❌ No critical velocity indicator (17+)
- ❌ Device pages lack MGI data
- ❌ Device-session pages lack MGI data

---

## 🎯 Implementation Phases

### **PHASE 1: Fix MGI Foundation (PRIORITY 1)**
**Goal**: Get MGI working correctly everywhere with proper thresholds and data sources

#### 1.1 Fix mgiUtils.ts Thresholds
**File**: `src/utils/mgiUtils.ts`

**Changes:**
```typescript
// BEFORE:
export const MGI_THRESHOLDS: MGIThresholds = {
  healthy: 30,      // 0-30%: Green
  warning: 50,      // 31-50%: Yellow
  concerning: 65,   // 51-65%: Orange
  critical: 65,     // 65%+: Red
};

export const VELOCITY_THRESHOLDS: VelocityThresholds = {
  normal: 3,        // 1-3% per session
  elevated: 7,      // 4-7% per session
  high: 12,         // 8-12% per session
};

// AFTER:
export const MGI_THRESHOLDS: MGIThresholds = {
  healthy: 10,      // 0-10: Green
  warning: 25,      // 11-25: Yellow
  concerning: 40,   // 26-40: Orange
  critical: 40,     // 41+: Red
};

export const VELOCITY_THRESHOLDS: VelocityThresholds = {
  normal: 5,        // 1-5: Green, small pulse
  elevated: 8,      // 6-8: Yellow, medium-small pulse
  high: 12,         // 9-12: Orange, medium pulse
  veryHigh: 16,     // 13-16: Red, large pulse
  critical: 16,     // 17+: Critical (red + SVG icon)
};
```

**Add:**
```typescript
/**
 * Check if velocity is critical (requires warning icon)
 */
export function isCriticalVelocity(velocity: number | null): boolean {
  if (velocity === null) return false;
  return Math.abs(velocity * 100) > 16;
}

/**
 * Get velocity color based on level
 */
export function getVelocityColor(velocity: number | null): string {
  if (velocity === null) return '#10b981'; // default green
  
  const velocityPercent = Math.abs(velocity * 100);
  
  if (velocityPercent <= 5) return '#10b981'; // Green
  if (velocityPercent <= 8) return '#f59e0b'; // Yellow
  if (velocityPercent <= 12) return '#f97316'; // Orange
  return '#ef4444'; // Red (13+)
}
```

**Outcome**: ✅ All MGI colors and pulse sizes now match requirements

#### 1.2 Fix HomePage Data Source
**File**: `src/pages/HomePage.tsx` (lines 116-135)

**Change FROM:**
```typescript
// Fetch latest MGI score
const { data: mgiData } = await supabase
  .from('petri_observations')
  .select('mgi_score')
  .eq('device_id', device.device_id)
  .not('mgi_score', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

return {
  // ...
  mgi_score: mgiData?.mgi_score || null,
};
```

**Change TO:**
```typescript
// Fetch latest MGI score and velocity from device record (faster)
// Falls back to device_images if not available
const mgi_score = device.latest_mgi_score;
const mgi_velocity = device.latest_mgi_velocity;

// If device table doesn't have it, fetch from device_images
let finalMgiScore = mgi_score;
let finalMgiVelocity = mgi_velocity;

if (mgi_score === null) {
  const { data: mgiData } = await supabase
    .from('device_images')
    .select('mgi_score, mgi_velocity')
    .eq('device_id', device.device_id)
    .not('mgi_score', 'is', null)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  finalMgiScore = mgiData?.mgi_score || null;
  finalMgiVelocity = mgiData?.mgi_velocity || null;
}

return {
  // ...
  mgi_score: finalMgiScore,
  mgi_velocity: finalMgiVelocity,
};
```

**Also Update Query (lines 92-107):**
```typescript
const { data, error } = await supabase
  .from('devices')
  .select(`
    device_id,
    device_code,
    device_name,
    x_position,
    y_position,
    battery_health_percent,
    is_active,
    provisioning_status,
    last_seen_at,
    latest_mgi_score,
    latest_mgi_velocity,
    latest_mgi_at
  `)
  .eq('site_id', selectedSiteId)
  .not('x_position', 'is', null)
  .not('y_position', 'is', null)
  .order('device_code');
```

**Outcome**: ✅ HomePage now uses correct data source (device_images via devices table)

#### 1.3 Update SiteMapViewer to Show Critical Indicator
**File**: `src/components/lab/SiteMapViewer.tsx`

**Add after device circle (around line 220):**
```typescript
// Critical velocity warning icon
if (device.mgi_velocity && Math.abs(device.mgi_velocity * 100) > 16) {
  // Add critical warning triangle
  deviceGroup
    .append('path')
    .attr('d', 'M 0,-8 L 7,8 L -7,8 Z') // Triangle path
    .attr('transform', `translate(${cx}, ${cy - 20})`)
    .attr('fill', '#ef4444')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1);
  
  // Add exclamation mark inside triangle
  deviceGroup
    .append('text')
    .attr('x', cx)
    .attr('y', cy - 16)
    .attr('text-anchor', 'middle')
    .attr('font-size', 8)
    .attr('font-weight', 'bold')
    .attr('fill', '#fff')
    .text('!');
}
```

**Outcome**: ✅ Critical velocity (17+) now shows red triangle with exclamation

#### 1.4 Test All Maps
- Test HomePage map with new data source
- Verify pulse animations use correct velocity thresholds
- Verify MGI colors match requirements
- Verify critical indicator appears at 17+

**Outcome**: ✅ All existing maps show correct MGI data

---

### **PHASE 2: Snapshot System (PRIORITY 2)**
**Goal**: Get timeline animation working for site detail pages

#### 2.1 Check SessionSnapshotViewer Component
**File**: `src/pages/lab/SessionSnapshotViewer.tsx`

- Read existing implementation
- Determine what's already built
- Identify gaps

#### 2.2 Build/Enhance Timeline Controls
**Add to SessionSnapshotViewer:**
- Play/Pause button
- Scrubber (slider) for manual navigation
- Date picker for jump-to-date
- Speed control (1x, 2x, 4x)
- Auto-loop toggle
- Current snapshot timestamp display

#### 2.3 Load Snapshot Data
**Add query:**
```typescript
const { data: snapshots } = await supabase
  .from('site_snapshots')
  .select('*')
  .eq('site_id', siteId)
  .gte('snapshot_time', startDate)
  .lte('snapshot_time', endDate)
  .order('snapshot_time', { ascending: true });
```

#### 2.4 Render Snapshot Frames
**Integration with SiteMapViewer:**
- Pass current snapshot device states to SiteMapViewer
- Extract MGI and velocity from snapshot JSONB
- Update SiteMapViewer props to accept snapshot mode

#### 2.5 Add to Site Detail Page
**Location**: Site detail view (need to determine exact route)
- Add "Timeline" tab or section
- Embed SessionSnapshotViewer
- Pass site layout and snapshot data

**Outcome**: ✅ Timeline animation system working on site pages

---

### **PHASE 3: Device Detail Pages (PRIORITY 3)**
**Goal**: Add MGI data and site map to device detail pages

#### 3.1 Add MGI Data Panel
**File**: `src/pages/DeviceDetailPage.tsx`

**Add new card in overview tab:**
```tsx
<Card>
  <CardHeader>
    <h3>MGI Monitoring</h3>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label>Current MGI</label>
        <div className={getMGIBadgeClass(device.latest_mgi_score)}>
          {formatMGI(device.latest_mgi_score)}
        </div>
      </div>
      <div>
        <label>Velocity</label>
        <div className={getVelocityColor(device.latest_mgi_velocity)}>
          {formatVelocity(device.latest_mgi_velocity)}
        </div>
      </div>
      <div>
        <label>Last Scored</label>
        <div>{device.latest_mgi_at ? format(...) : 'N/A'}</div>
      </div>
    </div>
    
    {/* MGI History Chart */}
    <div className="mt-4">
      <MGIHistoryChart deviceId={device.device_id} />
    </div>
  </CardContent>
</Card>
```

#### 3.2 Add Site Map Section
**Add to device detail page:**
```tsx
{device.site_id && (
  <Card>
    <CardHeader>
      <h3>Device Location</h3>
    </CardHeader>
    <CardContent>
      <SiteMapViewer
        siteLayout={siteLayout}
        devices={[{
          device_id: device.device_id,
          device_name: device.device_name,
          x_position: device.x_position,
          y_position: device.y_position,
          mgi_score: device.latest_mgi_score,
          mgi_velocity: device.latest_mgi_velocity,
          // ... other fields
        }]}
        selectedDeviceId={device.device_id}
      />
    </CardContent>
  </Card>
)}
```

#### 3.3 Query Updates
**Add to useDevice hook:**
```typescript
const { data: device } = await supabase
  .from('devices')
  .select(`
    *,
    sites (
      site_id,
      name,
      length,
      width,
      wall_details
    )
  `)
  .eq('device_id', deviceId)
  .single();
```

**Outcome**: ✅ Device detail pages show MGI data and site map

---

### **PHASE 4: Device-Session Pages (PRIORITY 4)**
**Goal**: Add MGI data and site map to device-session pages

#### 4.1 Add MGI to Session Summary
**File**: `src/pages/SiteDeviceSessionDetailPage.tsx`

**Add MGI stats to session header:**
```tsx
<div className="grid grid-cols-4 gap-4">
  <div>
    <label>Devices</label>
    <div>{devices.length}</div>
  </div>
  <div>
    <label>Avg MGI</label>
    <div className={getMGIBadgeClass(avgMGI)}>
      {formatMGI(avgMGI)}
    </div>
  </div>
  <div>
    <label>Max Velocity</label>
    <div>{formatVelocity(maxVelocity)}</div>
  </div>
  <div>
    <label>Critical Devices</label>
    <div className="text-red-600">{criticalCount}</div>
  </div>
</div>
```

#### 4.2 Add Site Map to Session
**Show all devices in session on site map:**
```tsx
<Card>
  <CardHeader>
    <h3>Session Device Positions</h3>
  </CardHeader>
  <CardContent>
    <SiteMapViewer
      siteLayout={siteLayout}
      devices={devicesWithMGI}
      onDeviceClick={(device) => navigate(`/devices/${device.device_id}`)}
    />
  </CardContent>
</Card>
```

#### 4.3 Query Device MGI for Session
**Fetch MGI data for all devices in session:**
```typescript
const devicesWithMGI = await Promise.all(
  devices.map(async (device) => {
    const { data: mgiData } = await supabase
      .from('device_images')
      .select('mgi_score, mgi_velocity, captured_at')
      .eq('device_id', device.device_id)
      .gte('captured_at', session.start_time)
      .lte('captured_at', session.end_time || new Date())
      .not('mgi_score', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return {
      ...device,
      mgi_score: mgiData?.mgi_score || null,
      mgi_velocity: mgiData?.mgi_velocity || null,
    };
  })
);
```

#### 4.4 UI/UX Alignment
- Match card styling with rest of app
- Use consistent button styles
- Align spacing and typography
- Use same color palette
- Add loading states
- Add error handling

**Outcome**: ✅ Device-session pages show MGI and site map

---

## 📊 Component Reuse Strategy

### SiteMapViewer (D3)
**Use for:**
- ✅ HomePage (current state)
- ✅ Site timeline (snapshot playback)
- ✅ Device detail (single device highlight)
- ✅ Device-session (all session devices)

### SiteMapEditor (Canvas)
**Use for:**
- ✅ Template management (device placement)
- ✅ Admin device positioning

### SiteMapAnalyticsViewer (Canvas)
**Use for:**
- ✅ HomePage (analytics zones)
- ✅ Advanced analytics pages

**Key**: Keep using what exists, just fix data sources and add MGI/velocity

---

## 🧪 Testing Checklist

### Phase 1 Tests:
- [ ] HomePage shows correct MGI colors (0-10 green, 11-25 yellow, 26-40 orange, 41+ red)
- [ ] Pulse animations match velocity (1-5 small, 6-8 medium-small, 9-12 medium, 13-16 large, 17+ critical)
- [ ] Critical indicator appears at velocity 17+
- [ ] No console errors
- [ ] MGI data fetches from device_images

### Phase 2 Tests:
- [ ] Timeline loads snapshots
- [ ] Play/pause works
- [ ] Scrubber navigates correctly
- [ ] Devices show correct MGI for each snapshot time
- [ ] Pulse animations update with snapshot

### Phase 3 Tests:
- [ ] Device detail shows latest MGI
- [ ] Site map appears if device is assigned
- [ ] Device highlights on map
- [ ] MGI history chart loads

### Phase 4 Tests:
- [ ] Session shows MGI stats
- [ ] Site map displays all session devices
- [ ] Device click navigation works
- [ ] UI matches rest of app

---

## 🚀 Execution Order

1. **Start**: Phase 1.1 (Fix mgiUtils.ts) - 10 min
2. **Next**: Phase 1.2 (Fix HomePage) - 20 min
3. **Next**: Phase 1.3 (Critical indicator) - 15 min
4. **Test**: Phase 1.4 (Verify maps) - 10 min
5. **Build**: `npm run build` - 5 min

**After Phase 1 works**, continue to Phase 2, 3, 4 in order.

---

## 📝 Summary

**Total Work:**
- Fix thresholds ✓
- Fix data sources ✓
- Add critical indicator ✓
- Build timeline system
- Enhance device pages
- Enhance device-session pages
- Align all UI/UX

**Estimated Time:**
- Phase 1: ~1 hour
- Phase 2: ~3 hours  
- Phase 3: ~2 hours
- Phase 4: ~2 hours
**Total: ~8 hours**

**Current Priority**: Phase 1 (Foundation fixes) - Start NOW!
