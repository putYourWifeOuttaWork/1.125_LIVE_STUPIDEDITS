# TIMELINE PLAYBACK VISUALIZATION COMPLETE SPECIFICATION

**Date**: Nov 21, 2025  
**Status**: Ready for Implementation

---

## 🎨 COMPLETE VISUAL SYSTEM

### Data Architecture (from diagram)
```
Program (30-120 days)
  ↓
Session (1 day) ← site_device_sessions
  ↓
Snapshot Window (every 3 hours) ← session_wake_snapshots
  ↓
Wake Events (1-100+ per window) ← device_wake_payloads + device_images (MGI scored)
```

---

## 🗺️ MAP VISUALIZATION LAYERS

Each device node on the map has **MULTIPLE VISUAL ELEMENTS** that update per snapshot:

### 1. **Device Dot (Center Circle)**
- **Color**: Based on **MGI score** (absolute value)
  - 🟢 Green: MGI 0.0 - 0.4 (safe)
  - 🟠 Orange: MGI 0.4 - 0.6 (caution)
  - 🔴 Red: MGI 0.6+ (critical)
- **Position**: Fixed at device's (x, y) coordinates

### 2. **Temperature Zone (Surrounding Color)**
- **Gradient color** extending from device outward
- **Based on**: Device's latest temperature reading
- **Colors**:
  - 🔵 Cool Blue: < 32°F
  - ⚪ White/Gray: 32-70°F (normal)
  - 🟡 Yellow: 70-80°F (warm)
  - 🟠 Orange: 80-90°F (hot)
  - 🔴 Red: 90°F+ (critical)
- **Visual**: D3 Voronoi tesselation creates natural zones between devices

### 3. **Humidity Zone (Surrounding Color - Alternative Filter)**
- **Same Voronoi zones**, different color scale when "Humidity" filter selected
- **Based on**: Device's latest humidity reading
- **Colors**:
  - 🟤 Brown: < 30% RH (dry)
  - 🟢 Green: 30-60% RH (ideal)
  - 🔵 Blue: 60-75% RH (humid)
  - 🟣 Purple: 75-85% RH (very humid)
  - 🔴 Red: 85%+ RH (critical)

### 4. **Battery Floor Color (Under Device)**
- **Circular zone** directly under device dot
- **Based on**: Device's battery voltage at end of session
- **Colors**:
  - 🟢 Green: > 3.8V (healthy)
  - 🟡 Yellow: 3.6-3.8V (ok)
  - 🟠 Orange: 3.4-3.6V (low)
  - 🔴 Red: < 3.4V (critical)
- **Only visible** when "Battery" filter is selected

### 5. **MGI Velocity Pulse (Animated Circle)**
- **Expanding circle** emanating from device center
- **Based on**: MGI velocity (rate of change between snapshots)
- **Behavior**:
  - **Diameter**: Larger pulse = higher velocity
    - Small (20px): velocity 0.01-0.03
    - Medium (40px): velocity 0.03-0.05
    - Large (60px): velocity 0.05+
  - **Color**: Matches device dot color (green → orange → red)
  - **Animation**: Smooth pulse (fade in/out, 2s duration)
  - **Trigger**: Only pulses if velocity > 0.01 threshold
- **Visual**: Same as Live Mode pulsing behavior

---

## 📊 PER-DEVICE DATA IN EACH SNAPSHOT

Example for **IoT Test Site 2** with **5 devices**:

```json
{
  "snapshot_id": "...",
  "wake_number": 42,
  "wake_round_start": "2025-11-19 06:00:00",
  "wake_round_end": "2025-11-19 09:00:00",
  
  "avg_temperature": 23.5,
  "avg_humidity": 68.2,
  "avg_mgi": 0.45,
  "max_mgi": 0.72,
  "active_devices_count": 5,
  "new_images_this_round": 5,
  
  "site_state": {
    "devices": [
      {
        "device_id": "device-001",
        "device_name": "DEVICE-ESP32S3-001",
        "position": {"x": 50, "y": 50},
        "zone_label": "Zone A",
        
        "telemetry": {
          "latest_temperature": 86.2,
          "latest_humidity": 75.0,
          "latest_battery": 3.9,
          "latest_pressure": 1013.2,
          "avg_temperature": 85.8,
          "avg_humidity": 74.5,
          "temp_velocity": 2.1,           // Change from prev snapshot
          "humidity_velocity": 5.0,
          "battery_velocity": -0.05,
          "captured_at": "2025-11-19 08:45:23",
          "payloads_count": 2             // 2 wake events in this 3hr window
        },
        
        "mgi_state": {
          "latest_mgi_score": 0.72,       // For dot color
          "avg_mgi_score": 0.68,
          "mgi_velocity": 0.08,           // For pulse animation!
          "mgi_speed_per_day": 0.03,
          "images_count": 2,
          "scored_at": "2025-11-19 08:45:23"
        },
        
        "display": {
          "dot_color": "#EF4444",         // Red (high MGI)
          "temp_zone_color": "#EF4444",   // Red (hot 86°F)
          "humidity_zone_color": "#A855F7", // Purple (75% RH)
          "battery_floor_color": "#10B981", // Green (3.9V healthy)
          "pulse_enabled": true,          // MGI velocity 0.08 > threshold
          "pulse_diameter": 60,           // Large pulse (high velocity)
          "pulse_color": "#EF4444",       // Matches dot
          "opacity": 1.0
        }
      },
      
      {
        "device_id": "device-002",
        "device_name": "DEVICE-ESP32S3-004",
        "position": {"x": 75, "y": 30},
        "zone_label": "Zone B",
        
        "telemetry": {
          "latest_temperature": 41.5,     // Much cooler!
          "latest_humidity": 45.0,
          "latest_battery": 3.7,
          "avg_temperature": 40.8,
          "avg_humidity": 44.2,
          "temp_velocity": -0.5,          // Cooling down
          "humidity_velocity": -2.0,
          "battery_velocity": -0.02,
          "captured_at": "2025-11-19 08:42:15",
          "payloads_count": 1
        },
        
        "mgi_state": {
          "latest_mgi_score": 0.25,       // Low MGI
          "avg_mgi_score": 0.23,
          "mgi_velocity": 0.01,           // Slow growth
          "mgi_speed_per_day": 0.005,
          "images_count": 1,
          "scored_at": "2025-11-19 08:42:15"
        },
        
        "display": {
          "dot_color": "#10B981",         // Green (low MGI)
          "temp_zone_color": "#3B82F6",   // Cool blue (41°F)
          "humidity_zone_color": "#10B981", // Green (45% ideal)
          "battery_floor_color": "#EAB308", // Yellow (3.7V ok)
          "pulse_enabled": true,          // Still pulses (velocity 0.01)
          "pulse_diameter": 20,           // Small pulse (low velocity)
          "pulse_color": "#10B981",       // Green
          "opacity": 1.0
        }
      }
      // ... 3 more devices
    ]
  }
}
```

---

## 🎬 TIMELINE PLAYBACK BEHAVIOR

### As User Scrubs Through Snapshots:

**Snapshot #1 (00:00-03:00)**
```
Device-001: 22°F, 45% RH, MGI 0.30
  → 🟢 Green dot
  → 🔵 Cool blue temperature zone
  → 🟢 Green humidity zone  
  → 🟢 Green battery floor
  → Small green pulse (velocity 0.02)

Device-002: 21°F, 50% RH, MGI 0.25
  → 🟢 Green dot
  → 🔵 Cool blue temperature zone
  → 🟢 Green humidity zone
  → 🟢 Green battery floor
  → Tiny green pulse (velocity 0.01)
```

**Snapshot #2 (03:00-06:00)** - Things heating up!
```
Device-001: 24°F, 55% RH, MGI 0.35
  → 🟢 Green dot (MGI still safe)
  → ⚪ White temperature zone (warming)
  → 🟢 Green humidity zone
  → 🟢 Green battery floor
  → Medium green pulse (velocity 0.05)

Device-002: 23°F, 60% RH, MGI 0.40
  → 🟠 Orange dot (MGI increasing!)
  → ⚪ White temperature zone
  → 🔵 Blue humidity zone (60% humid)
  → 🟡 Yellow battery floor (draining)
  → Medium orange pulse (velocity 0.05)
```

**Snapshot #3 (06:00-09:00)** - Critical zone!
```
Device-001: 86°F, 75% RH, MGI 0.72
  → 🔴 Red dot (high MGI!)
  → 🔴 Red temperature zone (HOT!)
  → 🟣 Purple humidity zone (very humid!)
  → 🟢 Green battery floor (still ok)
  → LARGE red pulse (velocity 0.08 spike!)

Device-002: 41°F, 45% RH, MGI 0.25
  → 🟢 Green dot (still safe)
  → 🔵 Cool blue zone
  → 🟢 Green humidity zone
  → 🟡 Yellow battery floor
  → Small green pulse (velocity 0.01)
```

### Visual Changes Between Snapshots:
- ✅ **Device dots** change color (green → orange → red)
- ✅ **Temperature zones** shift colors smoothly (blue → white → yellow → orange → red)
- ✅ **Humidity zones** shift colors when filter selected
- ✅ **Battery floor** colors update
- ✅ **Pulse animations** change size and frequency based on velocity
- ✅ **Smooth D3 transitions** (300ms ease) between states
- ✅ **Zone boundaries** recalculate via Voronoi as data changes

---

## 🔧 IMPLEMENTATION REQUIREMENTS

### 1. Snapshot Data Generation
- Query `device_wake_payloads` + `device_images` per 3-hour window
- Calculate per-device metrics (latest, avg, velocities)
- Store in `session_wake_snapshots.site_state` JSONB

### 2. Timeline Playback UI
- Render each snapshot with all visual layers
- Apply D3 transitions between snapshots
- Calculate colors based on thresholds
- Animate pulses based on velocity

### 3. Filter System
- Temperature filter → Show temp zones
- Humidity filter → Show humidity zones  
- Battery filter → Show battery floor circles
- MGI filter → Always show (primary metric)

---

## ✅ READY TO IMPLEMENT

**All requirements documented. Proceeding with:**
1. Fix `generate_session_wake_snapshot()` function
2. Generate test data with varying metrics
3. Regenerate snapshots
4. Verify Timeline Playback shows all visual elements

