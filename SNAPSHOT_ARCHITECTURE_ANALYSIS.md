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

### What This Means:
1. **Session** = One day at one site
2. **Multiple Wakes** occur during that session (e.g., 12 wakes/day, hourly)
3. **Each wake** should produce a **site snapshot** showing:
   - Device positions (x, y)
   - Device states (battery, status, last reading)
   - Zone states (temperature, humidity gradients around each device)
   - New observations/images captured
   - Alert states
   - Environmental changes
   - Mold Growth Index changes and derived calculations changed with each image which should be automatically observed.
   -   as MGI increases, we must see this on the interface as well, in the 2d but also in the device data for the session (e.g. MGI Progression, Velocity, Speed this Program e.g...)

4. **Snapshots form a time-series** that can be animated to show:
   - How temperature zones shift throughout the day
   - How mold growth progresses (MGI changes)
   - How device health degrades (battery levels)
   - When alerts were triggered

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
  "site_metadata": {
    "site_id": "uuid",
    "site_name": "Greenhouse A",
    "site_code": 1000021,
    "dimensions": { "length": 134, "width": 112, "height": 11 },
    "wall_details": [...],  // Copy from sites table
    "zones": [...]  // Copy from sites table
  },

  "devices": [
    {
      "device_id": "uuid",
      "device_code": "DEVICE-001",
      "position": { "x": 45, "y": 60 },
      "zone_id": "zone_001",
      "zone_label": "Northwest Corner",
      "status": "active",
      "battery_voltage": 3.8,
      "battery_health_percent": 85,
      "telemetry": {
        "temperature": 72.5,
        "humidity": 55.3,
        "pressure": 1013.2,
        "wifi_rssi": -65
      },
      "images_captured_this_wake": 2,
      "alerts": [
        { "alert_type": "battery_low", "severity": "warning" }
      ]
    }
  ],

  "environmental_zones": [
    {
      "zone_id": "zone_001",
      "zone_label": "Northwest Corner",
      "bounds": { "x1": 0, "y1": 0, "x2": 50, "y2": 50 },
      "avg_temperature": 71.2,
      "avg_humidity": 58.1,
      "device_count": 3,
      "gradient_data": {
        // Color-coded temperature/humidity for visualization
      }
    }
  ],

  "observations": [
    {
      "observation_id": "uuid",
      "observation_type": "petri",
      "device_id": "uuid",
      "image_id": "uuid",
      "mgi_score": 2.5,
      "captured_at": "2025-11-18T08:00:00Z"
    }
  ],

  "session_metrics": {
    "total_wakes_completed": 5,
    "expected_wakes": 12,
    "progress_percent": 41.67,
    "total_images_session": 25,
    "total_alerts_session": 3
  }
}
```

---

## Data Flow

### When a Device Wakes:

```
1. Device connects via MQTT → mqtt_device_handler
2. Telemetry ingested → device_telemetry table
3. Images ingested → device_images table
4. Session updated → site_device_sessions (increment completed_wake_count)

5. **TRIGGER: Generate Wake Snapshot**
   - Query current state of ALL devices at this site
   - Query latest telemetry for each device
   - Query images captured during this wake
   - Query site zones from sites table
   - Calculate environmental aggregates per zone
   - Assemble JSONB site_state
   - INSERT into session_wake_snapshots
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

## My Recommendation

**YES, this architecture makes perfect sense!**

The wake-level snapshot approach:
- Aligns perfectly with your visualization goals
- Provides the granularity needed for animation
- Maintains complete audit trail
- Enables deep analytics
- Is flexible for future features

**Next Step**: Should I create the migration to implement this `session_wake_snapshots` table and the snapshot generation system?
