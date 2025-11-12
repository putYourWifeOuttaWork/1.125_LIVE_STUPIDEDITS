# Session Device View - Design Document

## Current Issues

### 1. Expected Wake Count Calculation
**Problem**: Session's `expected_wake_count` is calculated based on ALL active devices at session creation time, not accounting for when devices were actually added during the day.

**Example**:
- Session: Nov 10, 2025, 7pm-6:59pm (24 hours)
- Device A: Added at 7pm, schedule "0 8,16 * * *" (2 wakes/day)
- Device B: Added at 2pm, schedule "0 9-17 * * *" (business hours, 8 wakes/day)

**Current Behavior**:
- Expected: 10 wakes (2 + 8)
- **WRONG**: Counts full day for Device B even though added mid-day

**Correct Behavior**:
- Device A: 2 wakes (participated whole session)
- Device B: Should only count wakes AFTER 2pm
  - Schedule: 9am-5pm hourly
  - Device added: 2pm
  - Remaining wakes: 3pm, 4pm, 5pm = 3 wakes
- **Corrected Expected**: 5 wakes (2 + 3)

### 2. Missing Device-Centric View
**Problem**: Session detail page shows wake payloads as a flat list. No device grouping, no device metadata, no management controls.

**What's needed**:
- Individual device cards showing:
  - Device metadata (name, code, hardware, status)
  - Device schedule and settings
  - Wake payloads FROM THIS DEVICE
  - Images captured BY THIS DEVICE
  - Device telemetry trends
  - Edit/manage controls (admin/maintenance only)

### 3. Missing Telemetry Tracking
**Problem**: Can't see temperature/humidity trends per device, can't track battery degradation, can't identify failing devices easily.

**What's needed**:
- Per-device telemetry charts
- Battery health tracking
- Environmental trends
- Anomaly detection

## Proposed Solution

### Part 1: Fix Expected Wake Calculation

Create new function `fn_calculate_device_expected_wakes()` that accounts for:
1. Device assignment time (when device was mapped to site)
2. Session time window
3. Device schedule (cron expression)
4. Only count wakes AFTER device was added

### Part 2: Create Device-Session Query

New RPC function: `get_session_devices_with_wakes(session_id UUID)`

Returns:
```sql
{
  device_id,
  device_code,
  device_name,
  hardware_version,
  firmware_version,
  wake_schedule_cron,
  battery_voltage,
  battery_health_percent,
  assigned_at, -- When device was mapped to this site

  -- Calculated fields
  expected_wakes_in_session, -- Based on assignment time + schedule
  actual_wakes, -- Count of wake payloads
  completed_wakes,
  failed_wakes,
  extra_wakes,

  -- Arrays of nested data
  wake_payloads: [
    {
      payload_id,
      wake_window_index,
      captured_at,
      payload_status,
      temperature,
      humidity,
      battery_voltage,
      wifi_rssi,
      image_id,
      overage_flag
    }
  ],

  images: [
    {
      image_id,
      captured_at,
      storage_path,
      wake_window_index
    }
  ]
}
```

### Part 3: Device Session Card Component

Create `src/components/devices/DeviceSessionCard.tsx`:

**Features**:
- Card layout similar to DeviceCard but session-specific
- Shows device metadata + session participation
- Expandable sections:
  - Wake Payloads (with telemetry)
  - Images Gallery
  - Telemetry Charts
  - Device Settings (edit for admin/maintenance)
- Status indicators:
  - Expected vs Actual wakes
  - Success rate
  - Battery health trend
  - Environmental conditions

### Part 4: Update Session Detail Page

Modify `src/pages/SiteDeviceSessionDetailPage.tsx`:

**Layout**:
```
┌─────────────────────────────────────────┐
│ Header: Back | Session Info | Refresh  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Session Overview Cards                   │
│ Status | Completion | Total Wakes       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Devices in This Session (3)             │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ Device A - MOCK-DEV-9142            │ │
│ │ ESP32-S3 | 2 wakes | 100% success   │ │
│ │ [View Wakes] [View Images] [Edit]   │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ Device B - TEST-1762873982609       │ │
│ │ ESP32 | 3/8 wakes | 100% success    │ │
│ │ ⚠️ Only 3 wakes (added mid-session) │ │
│ │ [View Wakes] [View Images] [Edit]   │ │
│ └─────────────────────────────────────┘ │
│                                          │
└─────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Database Functions
1. Create `fn_calculate_device_expected_wakes(device_id, assignment_time, session_start, session_end, cron_schedule)`
2. Create `get_session_devices_with_wakes(session_id)`
3. Update `fn_orchestrate_daily_sessions` to use new expected wake calculation

### Step 2: Frontend Components
1. Create `DeviceSessionCard` component
2. Create `DeviceTelemetryChart` component
3. Create `DeviceWakePayloadList` component
4. Create `DeviceImageGallery` component

### Step 3: Update Session Detail Page
1. Query `get_session_devices_with_wakes()`
2. Render device cards instead of flat wake list
3. Add device management controls
4. Add filtering/sorting by device

### Step 4: Permission Checks
- View: All authenticated users with access to program
- Edit Device Settings: `user_role IN ('company_admin', 'maintenance', 'super_admin')`
- Reassign Device: `user_role IN ('company_admin', 'super_admin')`

## Benefits

1. **Accurate Metrics**: Expected wakes match reality
2. **Device Focus**: Easy to see which device is performing/failing
3. **Troubleshooting**: Quick identification of device issues
4. **Management**: Edit schedules and settings in context
5. **Analytics**: Per-device trends and patterns
6. **Data Integrity**: Clear audit trail of device participation

## Edge Cases

1. **Device Added Mid-Session**: Calculate expected wakes from assignment time
2. **Device Removed Mid-Session**: Mark in UI, don't count future wakes
3. **Schedule Changed Mid-Session**: Show config_changed flag, explain discrepancy
4. **Device Wakes Outside Schedule**: Mark as "extra", show overage warning
5. **Multiple Devices Same Code**: Show device_id to disambiguate

---

**Next**: Implement database functions, then build UI components.
