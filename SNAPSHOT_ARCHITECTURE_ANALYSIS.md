# SNAPSHOT ARCHITECTURE ANALYSIS & FIX PLAN

**Date**: Nov 21, 2025  
**Issue**: Timeline Playback shows static data with no animations or color changes

---

## 🔍 CURRENT STATE - WHAT I FOUND

### The Schema Has These Key Tables:

#### **1. Raw MQTT Data** (per device, per capture)
- `device_telemetry` - Individual telemetry readings
- `device_images` - Individual images with MGI scores

#### **2. Wake Aggregation** (per device, per wake event)  
- **`device_wake_payloads`** ← THE KEY TABLE
  - Should have ONE row per device, per wake
  - Contains: temp, RH, pressure, image_id, wake_window_index, captured_at
  - FK to `site_device_session_id`

#### **3. Site Session Rollup** (all devices, per wake number)
- `session_wake_snapshots` ← Timeline Playback data source
  - Should aggregate ALL devices for each wake_number
  - Contains: avg_temperature, avg_humidity, avg_mgi, site_state JSONB

---

## 🚨 THE PROBLEM

Your snapshots show:
- ✅ **Temp/humidity data EXISTS** in site_state.devices[].telemetry
- ❌ **But it's the SAME data** for all 180 snapshots (22.5°F, 45%)
- ❌ **No MGI data** (all null)
- ❌ **No new_images_this_round** (all 0)
- ❌ **Timeline shows static green dots** (no color changes, no animations)

### Root Cause:
The `generate_session_wake_snapshot()` function is querying raw `device_telemetry` and `device_images` tables and getting the SAME static row every time (the one from Nov 15 at 17:15:23).

It's NOT using `device_wake_payloads` which should aggregate data per-wake!

---

## ✅ THE SOLUTION

### Use `device_wake_payloads` as your single source of truth

**This matches your ERD architecture:**
```
Device wakes → MQTT → Creates wake_payload row
  ↓
device_wake_payloads (one per device, per wake)
  ↓
session_wake_snapshots (rolls up all devices for that wake#)
  ↓
Timeline Playback UI (shows changing data with animations)
```

**Benefits:**
- ✅ Historical context preserved
- ✅ Each wake has its own data
- ✅ Can correlate telemetry + images from same wake
- ✅ Easy to calculate deltas/velocities
- ✅ Single source of truth

---

## 🎯 WHAT WE NEED TO DO

### 1. Check if `device_wake_payloads` is being populated
- Does MQTT handler write to this table?
- Should have rows for each device wake event

### 2. Fix snapshot generation function
- Query `device_wake_payloads` filtered by wake timeframe
- Join to `device_images` for MGI scores
- Calculate averages across all devices

### 3. Generate realistic test data
- Multiple wake events with DIFFERENT data:
  - Temps: 10°F → 15°F → 20°F → 25°F
  - Humidity: 30% → 50% → 70% → 85%
  - MGI: 0.1 → 0.3 → 0.5 → 0.7 (with velocity calculations)

### 4. Verify Timeline Playback shows:
- ✅ Device dots change color per wake
- ✅ Pulse animations when MGI velocity > threshold
- ✅ "Avg: X.X°F" updates correctly
- ✅ Smooth scrubbing through time

---

**Ready to proceed?** Let me know and I'll start implementing the fix!
