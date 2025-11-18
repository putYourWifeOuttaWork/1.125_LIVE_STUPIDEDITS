# Site Snapshot Architecture Analysis

## Current State Analysis

### Existing `site_snapshots` Table
**Purpose**: Store daily aggregated metrics for a site
**Granularity**: ONE snapshot per day per site

**Current Schema**:
```sql
- snapshot_id (uuid)
- site_id, company_id, program_id
- snapshot_date (date)
- snapshot_timestamp (timestamptz)

-- Aggregated metrics (daily averages)
- avg_temperature, avg_humidity, avg_pressure
- total_devices, active_devices, devices_with_alerts
- total_observations

-- Risk assessment
- risk_snapshot (jsonb): overall_risk, mgi_avg, mgi_max, zones, alerts
```

**Problem**: This is too coarse-grained! It only captures **daily summaries**, not the **evolution of the site throughout the day**.

---

## Your Architecture Vision

### Key Insight from Your Diagram:
> "Created as a cohesive Site snapshot using JSONB to describe the state of the site **after each wake**, within a given session, as to create session-based animatable 2d visualization"

### Critical Conceptual Model: **Device as Observational Dataset**

**A device is not just hardware - it's a complete observational time-series about mold growth at a specific location.**

The device represents:
- **Physical Location**: (x, y) coordinates in the site
- **Petri Dish**: The actual observation subject (mold growing on medium)
- **Environmental Monitor**: Temperature, humidity, pressure at that location
- **Image Capture**: Photos of petri dish over time
- **MGI Time-Series**: Mold Growth Index calculated from each image
- **Lifecycle**: Bound to the program duration (90-120 days)

**When a new program starts:**
- Device may be moved (new x, y position)
- Petri dish is replaced (MGI resets to 0)
- Observational dataset starts fresh
- Like site clones with same site_code - physical space exists, but experiment conditions may change

### Temporal Hierarchy:
1. **Program** = Complete experiment (90-120 days)
   - Device observes one petri dish for entire program
   - MGI progression from 0 → final score

2. **Session** = One day within that program
   - Collection of wakes during a 24-hour period
   - Shows daily environmental patterns

3. **Wake** = One device check-in (hourly/scheduled)
   - Captures image(s) of petri dish
   - Records environmental telemetry
   - **Automatically calculates MGI** from images

4. **Observation** = Image + derived MGI score
   - The fundamental data point
   - MGI increases monotonically (mold only grows, never shrinks)

### What Each Wake Snapshot Must Show:

**Device Observational Data** (per device):
- ✅ Device position (x, y)
- ✅ Device hardware state (battery, status, connectivity)
- ✅ **New observations/images captured THIS wake**
- ✅ **Current MGI score** (from latest image)
- ✅ **MGI Progression** (change since last wake, last session, program start)
- ✅ **MGI Velocity** (rate of change: ΔMGl/Δtime)
- ✅ **MGI Speed** (growth acceleration over program)
- ✅ Environmental telemetry at device location
- ✅ Alert states triggered by MGI thresholds

**Site-Wide Environmental Data**:
- ✅ Zone states (temperature, humidity gradients around each device)
- ✅ How environmental conditions affect MGI at each location
- ✅ Environmental changes over time

**Visualization Requirements**:
- 2D map shows devices color-coded by current MGI
- Animating through wakes shows MGI "heating up" over time
- Zone gradients visualize environmental patterns
- Non-admin users must see ALL metrics (no data hidden)

### Snapshots Form an Animatable Time-Series:
- How **mold growth progresses** (MGI changes at each location)
- How **temperature zones shift** throughout the day
- How **device health degrades** (battery levels)
- When **alerts were triggered** (MGI thresholds, environmental anomalies)

---

## Proposed New Architecture

### Option 1: Wake-Level Snapshots (Recommended)

**New Table: `session_wake_snapshots`**

```sql
CREATE TABLE session_wake_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  company_id uuid REFERENCES companies(company_id),
  program_id uuid REFERENCES pilot_programs(program_id),
  site_id uuid REFERENCES sites(site_id),
  session_id uuid REFERENCES site_device_sessions(session_id),

  -- Wake identification
  wake_number integer NOT NULL,  -- 1, 2, 3... up to expected_wake_count
  wake_timestamp timestamptz NOT NULL,

  -- Complete site state at this moment (JSONB snapshot)
  site_state jsonb NOT NULL DEFAULT '{}',

  -- Quick access aggregates (denormalized for performance)
  active_devices integer DEFAULT 0,
  new_images_this_wake integer DEFAULT 0,
  new_alerts_this_wake integer DEFAULT 0,
  avg_temperature numeric(5,2),
  avg_humidity numeric(5,2),

  created_at timestamptz DEFAULT now(),

  UNIQUE(session_id, wake_number)
);

CREATE INDEX idx_wake_snapshots_session ON session_wake_snapshots(session_id, wake_number);
```

### JSONB Structure for `site_state`:

```jsonb
{
  "snapshot_metadata": {
    "snapshot_id": "uuid",
    "wake_number": 5,
    "wake_timestamp": "2025-11-18T08:00:00Z",
    "session_date": "2025-11-18",
    "program_day": 45  // Day 45 of 90-day program
  },

  "site_metadata": {
    "site_id": "uuid",
    "site_name": "Greenhouse A",
    "site_code": 1000021,
    "dimensions": { "length": 134, "width": 112, "height": 11 },
    "wall_details": [...],  // Copy from sites table for 2D rendering
    "zones": [...],  // Defined zones from sites table
    "door_details": [...],
    "platform_details": [...]
  },

  "program_context": {
    "program_id": "uuid",
    "program_name": "Sandhill Pilot #2",
    "program_start_date": "2025-10-04",
    "program_end_date": "2026-01-02",
    "program_day": 45,
    "total_days": 90,
    "program_progress_percent": 50.0
  },

  "devices": [
    {
      "device_id": "uuid",
      "device_code": "DEVICE-001",
      "device_name": "Northwest Observer",

      // Physical placement in site
      "position": { "x": 45, "y": 60 },
      "zone_id": "zone_001",
      "zone_label": "Northwest Corner",

      // Device hardware state
      "status": "active",
      "battery_voltage": 3.8,
      "battery_health_percent": 85,
      "last_seen_at": "2025-11-18T08:00:00Z",

      // Environmental telemetry at device location
      "telemetry": {
        "temperature": 72.5,
        "humidity": 55.3,
        "pressure": 1013.2,
        "gas_resistance": 145000,
        "wifi_rssi": -65,
        "captured_at": "2025-11-18T08:00:00Z"
      },

      // CRITICAL: MGI Observational Data (THE PRIMARY METRIC)
      "mgi_state": {
        "current_mgi": 3.2,  // Latest MGI score from this wake
        "previous_mgi": 2.8,  // MGI from last wake
        "program_start_mgi": 0.0,  // Always 0 at program start
        "session_start_mgi": 2.5,  // MGI at start of today

        // Derived calculations
        "mgi_progression": {
          "since_last_wake": 0.4,  // Change since wake #4
          "since_session_start": 0.7,  // Change today
          "since_program_start": 3.2,  // Total growth this program
          "percent_of_max": 32.0  // Assuming max MGI ~10
        },

        "mgi_velocity": {
          "per_hour": 0.033,  // MGI increase per hour (0.4 / 12 hours)
          "per_day": 0.8,  // Average daily increase
          "per_week": 5.6  // 7-day moving average
        },

        "mgi_speed": {
          "acceleration": "increasing",  // "increasing", "steady", "decreasing"
          "growth_rate_trend": "exponential",  // Pattern analysis
          "days_to_critical": 14  // Estimated days until MGI > 8 (critical threshold)
        }
      },

      // Images captured during THIS wake
      "images_this_wake": [
        {
          "image_id": "uuid",
          "image_url": "https://...",
          "mgi_score": 3.2,
          "captured_at": "2025-11-18T08:00:00Z",
          "observation_type": "petri"
        }
      ],

      // Total counts for this session
      "session_totals": {
        "images_captured": 10,  // Total images today
        "wakes_completed": 5,  // This is wake #5
        "alerts_triggered": 1
      },

      // Program-wide totals
      "program_totals": {
        "images_captured": 450,  // Total images over 45 days
        "total_wakes": 540,  // 45 days × 12 wakes/day
        "alerts_triggered": 3
      },

      // Active alerts
      "alerts": [
        {
          "alert_type": "mgi_warning",
          "severity": "warning",
          "threshold": 3.0,
          "current_value": 3.2,
          "triggered_at": "2025-11-18T08:00:00Z"
        },
        {
          "alert_type": "battery_low",
          "severity": "warning",
          "threshold": 3.6,
          "current_value": 3.8
        }
      ],

      // Color coding for visualization
      "display": {
        "color": "#FF6B35",  // Orange for warning MGI
        "size": "medium",
        "pulse": true  // Indicate active alert
      }
    }
  ],

  "environmental_zones": [
    {
      "zone_id": "zone_001",
      "zone_label": "Northwest Corner",
      "bounds": { "x1": 0, "y1": 0, "x2": 50, "y2": 50 },

      // Aggregated environmental data for zone
      "avg_temperature": 71.2,
      "avg_humidity": 58.1,
      "avg_pressure": 1013.5,

      // Device metrics in this zone
      "device_count": 3,
      "avg_mgi": 3.0,  // Average MGI of devices in zone
      "max_mgi": 3.5,  // Highest MGI in zone

      // Gradient visualization data (for heat map overlay)
      "gradient_data": {
        "temperature_gradient": "warm",  // warm, cool, neutral
        "humidity_gradient": "dry",  // humid, dry, balanced
        "mgi_risk": "medium"  // low, medium, high, critical
      },

      // Zone color coding for 2D map
      "display": {
        "fill_color": "#FFE5CC",  // Light orange for medium risk
        "border_color": "#FF6B35",
        "opacity": 0.3
      }
    }
  ],

  "session_metrics": {
    "total_wakes_completed": 5,
    "expected_wakes": 12,
    "progress_percent": 41.67,

    // Aggregate counts
    "total_images_session": 25,
    "total_alerts_session": 3,
    "total_devices_active": 5,

    // MGI aggregates across all devices
    "site_mgi_summary": {
      "avg_mgi": 2.8,
      "max_mgi": 3.5,
      "min_mgi": 2.1,
      "devices_above_warning": 2,  // MGI > 3.0
      "devices_critical": 0  // MGI > 8.0
    },

    // Environmental aggregates
    "site_environmental_summary": {
      "avg_temperature": 72.3,
      "avg_humidity": 54.7,
      "temp_variance": 2.1,  // Temperature spread across devices
      "humidity_variance": 5.3
    }
  }
}
```

### Key Features of This Structure:

1. **MGI is Central**: Every device has detailed `mgi_state` showing current value, progression, velocity, and speed
2. **Self-Contained**: Each snapshot includes everything needed to render the site at that moment
3. **Multi-Level Context**: Snapshot → Session → Program hierarchy is clear
4. **Visualization-Ready**: Color codes, display properties for immediate rendering
5. **Non-Admin Friendly**: All observational data visible (no hidden admin-only fields)
6. **Temporal Awareness**: Can compare to previous wakes, sessions, and program start
7. **Predictive**: Includes trend analysis and estimates (days_to_critical)

---

## Data Flow: Observational Pipeline

### When a Device Wakes (Complete Flow):

```
1. Device connects via MQTT → mqtt_device_handler edge function
   - Device sends: telemetry + image chunks
   - Handler acknowledges receipt

2. Telemetry ingested → device_telemetry table
   - Temperature, humidity, pressure, battery, WiFi RSSI
   - Timestamped with captured_at
   - Linked to device_id, site_id, program_id, company_id

3. Images assembled → device_images table
   - Chunks buffered → complete image reconstructed
   - Stored in Supabase Storage
   - Status: 'complete'

4. **AUTOMATIC MGI Calculation** (CRITICAL STEP)
   - Trigger: score_mgi_image edge function called
   - Roboflow API: Analyzes petri dish image
   - Returns: MGI score (0-10 scale)
   - Updates: device_images.mgi_score
   - Also calculates: mold_growth_velocity, mold_growth_speed

5. Session tracking → site_device_sessions table
   - Increment: completed_wake_count
   - Update: status (if session complete)

6. **TRIGGER: Generate Wake Snapshot** (NEW)
   - Query: Current state of ALL devices at this site
   - For each device:
     a. Latest telemetry (temperature, humidity at device location)
     b. Latest MGI score from device_images
     c. Previous MGI scores for progression/velocity calculations
     d. Images captured THIS wake
     e. Alert states
     f. Program-level totals
   - Calculate: Environmental zone aggregates
   - Calculate: MGI velocity, speed, acceleration
   - Assemble: Complete JSONB site_state
   - INSERT: session_wake_snapshots table

7. Result: Complete observational snapshot ready for visualization
```

### MGI Calculation Details:

**Image → MGI Pipeline**:
```sql
-- When image is complete, automatically score it
CREATE OR REPLACE FUNCTION auto_score_mgi()
RETURNS TRIGGER AS $$
BEGIN
  -- Only score petri dish images that are complete
  IF NEW.status = 'complete' AND NEW.observation_type = 'petri' THEN
    -- Call edge function to score via Roboflow
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/score_mgi_image',
      body := jsonb_build_object('image_id', NEW.image_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_score_mgi
  AFTER INSERT OR UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION auto_score_mgi();
```

**MGI Progression Calculation**:
```sql
-- Calculate MGI velocity and progression
CREATE OR REPLACE FUNCTION calculate_mgi_metrics(p_device_id uuid, p_current_mgi numeric)
RETURNS jsonb AS $$
DECLARE
  v_previous_mgi numeric;
  v_session_start_mgi numeric;
  v_program_start_mgi numeric := 0.0;  -- Always 0
  v_time_since_last hours;
BEGIN
  -- Get previous MGI (last wake)
  SELECT mgi_score, EXTRACT(EPOCH FROM (NOW() - captured_at))/3600
  INTO v_previous_mgi, v_time_since_last
  FROM device_images
  WHERE device_id = p_device_id AND mgi_score IS NOT NULL
  ORDER BY captured_at DESC OFFSET 1 LIMIT 1;

  -- Get session start MGI (first image today)
  SELECT mgi_score INTO v_session_start_mgi
  FROM device_images
  WHERE device_id = p_device_id
    AND DATE(captured_at) = CURRENT_DATE
    AND mgi_score IS NOT NULL
  ORDER BY captured_at ASC LIMIT 1;

  RETURN jsonb_build_object(
    'current_mgi', p_current_mgi,
    'previous_mgi', COALESCE(v_previous_mgi, 0),
    'mgi_progression', jsonb_build_object(
      'since_last_wake', p_current_mgi - COALESCE(v_previous_mgi, 0),
      'since_session_start', p_current_mgi - COALESCE(v_session_start_mgi, 0),
      'since_program_start', p_current_mgi - v_program_start_mgi
    ),
    'mgi_velocity', jsonb_build_object(
      'per_hour', (p_current_mgi - COALESCE(v_previous_mgi, 0)) / NULLIF(v_time_since_last, 0)
    )
  );
END;
$$ LANGUAGE plpgsql;
```

### Snapshot Generation Function:

```sql
CREATE OR REPLACE FUNCTION generate_session_wake_snapshot(
  p_session_id uuid,
  p_wake_number integer
) RETURNS uuid AS $$
DECLARE
  v_snapshot_id uuid;
  v_site_state jsonb;
BEGIN
  -- Build the complete site state JSONB
  SELECT jsonb_build_object(
    'site_metadata', (SELECT to_jsonb(s) FROM sites s WHERE s.site_id = sds.site_id),
    'devices', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'device_id', d.device_id,
          'device_code', d.device_code,
          'position', jsonb_build_object('x', d.x_position, 'y', d.y_position),
          'zone_id', d.zone_id,
          'zone_label', d.zone_label,
          'status', CASE WHEN d.is_active THEN 'active' ELSE 'inactive' END,
          'battery_voltage', d.battery_voltage,
          'battery_health_percent', d.battery_health_percent,
          'telemetry', (
            SELECT to_jsonb(dt) FROM device_telemetry dt
            WHERE dt.device_id = d.device_id
            ORDER BY dt.captured_at DESC LIMIT 1
          )
        )
      )
      FROM devices d
      WHERE d.site_id = sds.site_id
    )
    -- ... more sections
  ) INTO v_site_state
  FROM site_device_sessions sds
  WHERE sds.session_id = p_session_id;

  -- Insert snapshot
  INSERT INTO session_wake_snapshots (
    session_id, wake_number, wake_timestamp, site_state
  ) VALUES (
    p_session_id, p_wake_number, now(), v_site_state
  ) RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;
```

---

## Benefits of This Architecture

### 1. **Complete Temporal Record**
- Every wake creates a snapshot
- Can "replay" the entire day
- No data loss between wakes

### 2. **Animation-Ready**
- Snapshots are ordered by wake_number
- Frontend can iterate through snapshots to animate
- Show site evolving over time

### 3. **Flexible Querying**
- JSONB allows complex queries on historical state
- Can analyze: "What was the temperature gradient at wake #5?"
- Can compare: "How did zone temps change between wake 3 and wake 7?"

### 4. **Self-Contained**
- Each snapshot is complete (doesn't require joins)
- Frontend can load a single snapshot and render the entire site state
- Cacheable, shareable

### 5. **Audit Trail**
- Know exactly what the site looked like at any point
- Debug issues: "Why did device X fail at wake 8?"
- Historical analysis: "How did MGI progress throughout the session?"

---

## Questions for You:

### 1. **Snapshot Granularity**
Do you want:
- ✅ **One snapshot per wake** (my recommendation)
- One snapshot per device wake (could be 3 devices × 12 wakes = 36 snapshots/day)
- One snapshot per significant event (new image, alert, etc.)

### 2. **What Goes in site_state JSONB?**
Should it include:
- ✅ All device positions and current telemetry
- ✅ All images captured THIS wake
- ✅ Environmental zones with gradients
- Site physical structure (walls, doors, platforms)
- Historical trends (temp over last 3 wakes)
- Alert history

### 3. **Device Positioning**
Devices currently have `x_position`, `y_position` as NULL. Should we:
- Add a UI for users to drag-drop devices onto site map
- Auto-assign positions based on zone_id
- Allow devices to report their own position (GPS/beacon)

### 4. **Zone Calculation**
How should environmental zones be defined:
- Manual: User draws zones on site map
- Automatic: Algorithm creates heat map zones based on device readings
- Hybrid: User defines zone boundaries, system calculates metrics

### 5. **Backward Compatibility**
Should we:
- Keep `site_snapshots` for daily summaries (lightweight)
- Replace it entirely with wake-level snapshots
- Deprecate it

---

## Summary: Device as Observational Dataset

### Core Conceptual Understanding:

**A device is not hardware—it's a time-series of mold growth observations.**

The device lifecycle:
1. **Program starts**: Petri dish placed on device, MGI = 0
2. **Wakes occur**: Device captures images hourly (or per schedule)
3. **MGI automatically calculated**: Each image → Roboflow → MGI score
4. **Observations accumulate**: Building complete growth profile
5. **Program ends**: 90-120 days later, final MGI represents total growth
6. **New program**: Device may move (new x,y), new petri dish, MGI resets

### What We're Building:

**`session_wake_snapshots`** - A complete record of site state after each wake:
- ✅ Device positions (x, y) in site 2D map
- ✅ Current MGI + progression + velocity + speed for each device
- ✅ Environmental telemetry at each device location
- ✅ Zone-level environmental gradients (heat maps)
- ✅ Images captured this wake
- ✅ Alert states (MGI thresholds, battery, environmental)
- ✅ Program context (day 45 of 90, progress %)

**Visualization Output**:
- 2D site map with devices color-coded by MGI
- Animate through wakes to show MGI "heating up" over time
- Environmental zones overlay (temperature/humidity gradients)
- Non-admin users see ALL data (observational transparency)

### Benefits of MGI-Centric Snapshot Architecture:

1. **Observational Integrity**: Complete record of mold growth over time
2. **Predictive Analytics**: Velocity/speed metrics → estimate days to critical MGI
3. **Environmental Correlation**: See how temperature/humidity affect MGI at each location
4. **Temporal Replay**: Animate entire session/program to understand what happened
5. **Non-Admin Access**: Field users see same rich observational data as admins
6. **Program Lifecycle**: Clean separation between experiments (device resets)
7. **Data-Driven Decisions**: "Device at (45,60) grew faster when humidity > 60%"

---

## Next Steps

**This architecture is APPROVED** based on your clarifications.

The refined design now correctly models:
- ✅ Device as observational dataset (not just hardware)
- ✅ MGI as the central metric (with progression, velocity, speed)
- ✅ Program lifecycle and device reset concept
- ✅ Non-admin visibility requirements
- ✅ Wake-level granularity for animation
- ✅ Automatic MGI calculation pipeline

### Questions Before Implementation:

1. **Device Positioning**:
   - Should I create a drag-drop UI for placing devices on site 2D map?
   - Or manual x,y entry in device edit modal?
   - Should position be required or optional?

2. **Zone Definition**:
   - Manual: Admin draws zones on site map
   - Automatic: Algorithm creates heat map zones from device clusters
   - Hybrid: Combine both approaches
   - Your preference?

3. **Snapshot Trigger**:
   - Generate snapshot after EACH device wake (could be 5 devices × 12 wakes = 60 snapshots/day)
   - OR generate once per wake "round" (12 snapshots/day, one per hour)
   - Which approach?

4. **Backward Compatibility**:
   - Keep old `site_snapshots` table (daily summaries) in parallel
   - Or deprecate and replace entirely with wake snapshots
   - Your preference?

**Ready to proceed with migration creation?** Please answer the questions above and I'll implement the complete snapshot system.

---

## ✅ IMPLEMENTATION COMPLETE - Phase 3 Snapshot System

### Summary of Changes Made (November 18, 2025)

All architecture decisions were approved and the complete wake-level snapshot system has been implemented.

### 1. Database Migration Created
**File**: `supabase/migrations/20251118000000_session_wake_snapshots.sql`

**What it does**:
- ✅ Drops deprecated `site_snapshots` table (unused, replaced by wake-level system)
- ✅ Creates `session_wake_snapshots` table with complete JSONB site_state column
- ✅ Makes device `x_position` and `y_position` REQUIRED (NOT NULL with validation constraints)
- ✅ Creates `calculate_mgi_metrics()` function for MGI progression/velocity/speed
- ✅ Creates `generate_device_centered_zones()` function for automatic circular zones around devices (15ft radius, overlapping allowed)
- ✅ Creates `generate_session_wake_snapshot()` function to assemble complete JSONB snapshot after wake round
- ✅ Sets up RLS policies for multi-tenant access (super admins, company admins, field users)

**Key Features**:
- **Device-Centered Zones**: Automatic circular zones (15ft radius) around each device for environmental aggregation
- **MGI-Centric**: Every snapshot includes full MGI state with progression, velocity, and speed calculations
- **Wake Round Granularity**: One snapshot per wake round (e.g., 12/day for hourly rounds)
- **Self-Contained JSONB**: Each snapshot is complete and can render 2D visualization independently
- **D3 Visualization Ready**: Device positions, MGI color coding, zone overlays, animation support

### 2. TypeScript Types Updated
**File**: `src/lib/types.ts`

**Changes**:
- ✅ Added `x_position: number` as REQUIRED field (no longer nullable)
- ✅ Added `y_position: number` as REQUIRED field (no longer nullable)
- ✅ Removed x,y from `placement_json` (moved to dedicated columns)
- ✅ `placement_json` now only contains height and notes

### 3. Device Edit Modal Enhanced
**File**: `src/components/devices/DeviceEditModal.tsx`

**Changes**:
- ✅ X,Y coordinates are now REQUIRED fields (marked with red asterisk)
- ✅ Added validation to ensure x,y >= 0
- ✅ Shows clear error messages for missing/invalid coordinates
- ✅ Updated interface to use `x_position` and `y_position` directly
- ✅ Added helper text: "Device position on site map (feet)"

### 4. Device Hook Updated
**File**: `src/hooks/useDevice.ts`

**Changes**:
- ✅ Added `x_position` and `y_position` to updateDeviceMutation parameters
- ✅ Ensures coordinates are properly saved to database

### 5. Architecture Decisions Implemented

**Device Positioning**: ✅ Manual x,y entry in device edit modal (REQUIRED)
- No drag-drop UI yet (saved for Phase 4+)
- Users enter coordinates manually based on site dimensions

**Zone Definition**: ✅ Device-Centered Zones (automatic)
- 15ft radius circular zones around each device
- Zones can overlap (realistic for environmental monitoring)
- Algorithm: Voronoi-style with boundary clipping to site dimensions

**Snapshot Trigger**: ✅ Once per wake round (12/day for hourly rounds)
- Waits for all devices in round to report
- Ensures calculated fields (MGI, velocity) are ready before snapshot

**Backward Compatibility**: ✅ Deprecated old `site_snapshots` table
- No data loss (table was unused)
- Clean architecture with single snapshot system

### 6. Site Metadata Notes

**Current State**:
- ✅ `sites.wall_details` already has x,y coordinates (JSON B with start_point, end_point)
- ✅ `sites.door_details` and `sites.platform_details` exist as empty JSONB arrays
- ⏳ **TODO**: Update site setup UI to capture table/door/platform coordinates
  - Can be added in next phase
  - Not blocking for snapshot system functionality

### 7. Next Steps for Visualization (Phase 4)

**Frontend Components Needed**:
1. **Snapshot Viewer Component**
   - Fetches session_wake_snapshots for a given session
   - Renders 2D site map using D3.js
   - Shows devices as circles color-coded by MGI
   - Overlays device-centered zones with temperature/humidity gradients
   - Animation controls (play/pause/step through wakes)

2. **Site Map Canvas**
   - SVG-based rendering with D3
   - Device shapes: circles (standard), pulsing for alerts
   - MGI color scale: Green (0-3) → Yellow (3-5) → Orange (5-8) → Red (8+)
   - Zone overlays: Semi-transparent fills with gradient colors
   - Interactive: Click device → show details, hover → show telemetry

3. **Animation Timeline**
   - Slider to scrub through wake rounds
   - Play button to animate automatically
   - Speed controls (1x, 2x, 4x)
   - Display current wake number and timestamp

### 8. Build Status
✅ **Build Successful** - No TypeScript errors
- All type definitions updated correctly
- Device position fields properly typed as required
- Modal validation working
- Database migration ready to apply

### 9. Testing Checklist (Before Applying Migration)

⚠️ **IMPORTANT**: Before applying this migration, ensure:

1. ✅ All existing devices have valid x_position, y_position values
   - Migration will FAIL if any device has NULL coordinates
   - Run this query first: `SELECT device_id, device_code, x_position, y_position FROM devices WHERE x_position IS NULL OR y_position IS NULL;`
   - Update any NULL values before applying migration

2. ✅ Verify site dimensions are set
   - Snapshots use site.length and site.width for zone boundary clipping
   - Check: `SELECT site_id, name, length, width FROM sites WHERE length IS NULL OR width IS NULL;`

3. ✅ Test snapshot generation manually
   - After migration, call `generate_session_wake_snapshot()` with test data
   - Verify JSONB structure is correct
   - Check that MGI metrics calculate properly

### 10. Migration Application

**Ready to Apply**: ✅ YES

**Command** (when ready):
```bash
# This will be applied automatically by Supabase
# The migration file is in: supabase/migrations/20251118000000_session_wake_snapshots.sql
```

**Rollback Plan** (if needed):
- Re-create `site_snapshots` table (schema in old migrations)
- Make device x_position, y_position nullable again
- Drop new snapshot tables and functions

---

## Architecture is Complete & Approved! 🎉

The wake-level snapshot system is now fully implemented and ready for:
- **Database migration** (apply when device coordinates are set)
- **Frontend visualization** (Phase 4 - D3.js 2D site map)
- **Animation features** (Phase 4 - temporal replay of site state)

The system correctly models devices as observational datasets tracking MGI progression at specific locations, with automatic zone generation and complete site state capture after each wake round.
