# Device-Site Mapping Implementation - Phase 1 Complete

## Overview

We've built the foundational infrastructure for visual device pool management and spatial site mapping. This enables:
- Assigning IoT devices to sites with precise x,y coordinates
- Visual drag-and-drop device positioning
- Foundation for session analytics and snapshot visualization

## What Was Built

### 1. Database Layer (Migration: 20251118200000)

**New RPC Functions:**

```sql
fn_get_available_devices_for_site(p_site_id UUID)
```
- Returns devices available for assignment
- Shows devices in same company that are unassigned OR already assigned to THIS site
- Includes current position data for editing

```sql
fn_assign_device_to_site(p_device_id UUID, p_site_id UUID, p_x_position INT, p_y_position INT)
```
- Assigns device to site with spatial coordinates
- Auto-inherits program_id via existing trigger
- Logs assignment to audit trail
- Returns success/failure with details

```sql
fn_update_device_position(p_device_id UUID, p_x_position INT, p_y_position INT)
```
- Updates device position for drag-and-drop
- Validates device is assigned to a site
- Real-time position updates

```sql
fn_remove_device_from_site(p_device_id UUID)
```
- Returns device to company pool
- Clears site_id, program_id, and position
- Preserves company_id
- Logs removal to audit trail

### 2. React Components

#### DevicePoolSelector Component
**Location:** `src/components/sites/DevicePoolSelector.tsx`

**Features:**
- Displays available devices with rich metadata
- Search and filter by device type (physical/virtual)
- Shows assignment status (available vs already positioned)
- Displays device health metrics (battery, last_seen)
- Visual selection state
- Responsive design with scrollable list

**Props:**
```typescript
{
  devices: AvailableDevice[];
  onDeviceSelect: (device) => void;
  selectedDeviceIds: string[];
  loading?: boolean;
  className?: string;
}
```

#### SiteMapEditor Component
**Location:** `src/components/sites/SiteMapEditor.tsx`

**Features:**
- Interactive HTML5 canvas rendering
- Real-time drag-and-drop device repositioning
- Grid overlay with snap-to-grid option
- Visual device representation with status colors:
  - Green = Active
  - Red = Offline
  - Blue = Dragging
  - Gray = Unknown
- Device labels with code and battery level
- Coordinate system: (0,0) = top-left, x = length, y = width
- Responsive canvas that maintains aspect ratio
- Legend and dimension display

**Props:**
```typescript
{
  siteLength: number;
  siteWidth: number;
  devices: DevicePosition[];
  onDevicePositionUpdate: (deviceId, x, y) => void;
  onDeviceRemove?: (deviceId) => void;
  selectedDevice: AvailableDevice | null;
  onMapClick?: (x, y) => void;
  className?: string;
}
```

#### DeviceSetupStep Component
**Location:** `src/components/sites/DeviceSetupStep.tsx`

**Features:**
- Combines DevicePoolSelector and SiteMapEditor
- Manages device assignment state
- Calls RPC functions for database updates
- Real-time feedback with toasts
- Validates site dimensions
- Shows assignment statistics
- Skip option for optional device setup

**Props:**
```typescript
{
  siteId: string;
  siteLength: number;
  siteWidth: number;
  onDevicesAssigned?: (assignments) => void;
  onSkip?: () => void;
}
```

## Architecture Benefits

### Session Analytics Foundation

This implementation provides the spatial foundation for:

1. **Session Wake Snapshots** - Each session wake captures device positions and states
2. **Heatmap Visualization** - Device activity can be visualized spatially over time
3. **Spatial Analytics** - Analyze patterns by location (e.g., which zones have most issues)
4. **Device Clustering** - Group devices by spatial proximity
5. **Environmental Correlation** - Link device readings to physical location

### Data Flow Architecture

```
Company Pool (unassigned devices)
    ↓
Site Assignment (with x,y coordinates)
    ↓
Program Inheritance (automatic via trigger)
    ↓
Session Creation (devices participate in daily sessions)
    ↓
Wake Events (captured in session_wake_snapshots with positions)
    ↓
Analytics & Visualization
```

### Multi-Tenancy Compliance

- Devices scoped to company level
- RLS policies enforce company isolation
- Audit trail for all assignments
- Program inheritance maintains hierarchy

## Integration Points

### Current State
Components are built and ready to integrate. Next steps:

1. **Site Creation Wizard** - Add DeviceSetupStep as new step
2. **Site Template Management** - Add device mapping tab
3. **Snapshot Viewer** - Connect to session_wake_snapshots

### Next Phase Requirements

To complete the full integration:

1. **NewSiteModal.tsx** - Add 'deviceSetup' step to wizard flow
2. **SiteTemplateManagementPage.tsx** - Add device mapping section
3. **SessionSnapshotViewer** - Enable "View Snapshot Map" button
4. **Hook Creation** - Create useDeviceMapping hook for reusable logic

## Testing Instructions

### Database Functions

Apply the migration in Supabase Dashboard:
```bash
# Copy contents of:
supabase/migrations/20251118200000_device_site_assignment_functions.sql

# Paste into Supabase Dashboard → SQL Editor → Execute
```

### Component Testing

Components can be tested independently:

```typescript
// Test DevicePoolSelector
import DevicePoolSelector from './components/sites/DevicePoolSelector';

<DevicePoolSelector
  devices={mockDevices}
  onDeviceSelect={(device) => console.log('Selected:', device)}
  selectedDeviceIds={[]}
  loading={false}
/>

// Test SiteMapEditor
import SiteMapEditor from './components/sites/SiteMapEditor';

<SiteMapEditor
  siteLength={100}
  siteWidth={50}
  devices={[]}
  onDevicePositionUpdate={(id, x, y) => console.log('Update:', id, x, y)}
  selectedDevice={null}
  onMapClick={(x, y) => console.log('Click:', x, y)}
/>

// Test DeviceSetupStep (requires real siteId)
import DeviceSetupStep from './components/sites/DeviceSetupStep';

<DeviceSetupStep
  siteId="your-site-id"
  siteLength={100}
  siteWidth={50}
  onDevicesAssigned={(devices) => console.log('Assigned:', devices)}
  onSkip={() => console.log('Skipped')}
/>
```

## Future Enhancements

### Zone Management
- Define named zones on site map
- Assign devices to zones
- Zone-based analytics and filtering

### Additional Visualizations
- Gasifier cloud visualization (from architecture diagram)
- Temperature heatmaps
- Activity timeline playback
- Device path tracking

### Advanced Features
- Device grouping and bulk operations
- Template-based positioning (copy from another site)
- Import/export device layouts
- 3D visualization option

## Files Created

```
supabase/migrations/
  └── 20251118200000_device_site_assignment_functions.sql

src/components/sites/
  ├── DevicePoolSelector.tsx
  ├── SiteMapEditor.tsx
  └── DeviceSetupStep.tsx
```

## Build Status

✅ **TypeScript compilation successful**
✅ **All components type-safe**
✅ **No breaking changes to existing code**
✅ **Ready for integration**

## Next Actions Required

1. **Apply Database Migration** - Execute SQL in Supabase Dashboard
2. **Integrate into NewSiteModal** - Add deviceSetup step to wizard
3. **Integrate into Template Management** - Add device mapping tab
4. **Fix Snapshot Viewer** - Connect View Snapshot Map button
5. **User Testing** - Test complete device assignment flow

This implementation provides a solid foundation for the session analytics architecture described in your vision document.
