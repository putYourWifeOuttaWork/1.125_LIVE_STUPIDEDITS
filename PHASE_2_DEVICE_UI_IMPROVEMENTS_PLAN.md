# Phase 2: Device UI/UX Improvements - Implementation Plan

**Date:** November 16, 2025
**Status:** 📋 Planning Phase
**Prerequisites:** ✅ Phase 1 Complete (Device Data Flow & Tracking validated)

---

## Executive Summary

Based on comprehensive schema audit and current UI analysis, this document outlines missing features and UI/UX improvements needed for the Device Detail page. The device data infrastructure is solid - now we need to **surface all this rich data** to users.

---

## Schema Audit Findings

### ✅ What We Have (Database)

**Excellent data capture in database:**

1. **devices** table (18 devices)
   - ✅ Battery voltage & health % (auto-calculated)
   - ✅ WiFi RSSI
   - ✅ MQTT client ID
   - ✅ Wake schedule & next wake time
   - ✅ Last seen/wake timestamps
   - ✅ Zone & placement data
   - ✅ Hardware/firmware versions
   - ✅ Assignment tracking (who/when)

2. **device_telemetry** table (6 records)
   - ✅ Temperature, humidity, pressure, gas resistance
   - ✅ Battery voltage snapshots
   - ✅ WiFi RSSI history
   - ✅ Timestamp for each reading

3. **device_history** table (78 events)
   - ✅ Event categories: Assignment, Communication, Status, etc.
   - ✅ Severity levels: info, warning, error
   - ✅ Full event metadata
   - ✅ User tracking

4. **device_images** table (30 images)
   - ✅ Image status tracking (pending, complete, failed)
   - ✅ Chunk progress (148/148)
   - ✅ Retry counts
   - ✅ Timestamps (captured, received)

5. **device_commands** table (4 commands)
   - ✅ Command type & payload
   - ✅ Status tracking (pending, sent, acknowledged)
   - ✅ Timestamps (issued, delivered, acknowledged)
   - ✅ Priority & expiration

### ❌ What's Missing (UI)

**Critical gaps between database and UI:**

1. **No Telemetry Visualization**
   - Database has temp, humidity, pressure, gas resistance
   - UI shows NONE of this historical data
   - No graphs, no trends, no analytics

2. **No Activity Timeline**
   - 78 history events in database
   - UI only shows static current state
   - No event stream, no audit trail visible

3. **Limited Battery Info**
   - UI shows battery health % bar (good!)
   - Missing: voltage history over time
   - Missing: degradation trend analysis
   - Missing: low battery alerts

4. **No WiFi Signal Tracking**
   - Database tracks WiFi RSSI over time
   - UI shows nothing about WiFi
   - Missing: signal strength history
   - Missing: connectivity quality indicators

5. **No Command Queue Visibility**
   - 4 commands in database with full lifecycle
   - UI shows nothing about pending/sent commands
   - Users have no idea what device will do next

6. **Limited Image Analytics**
   - UI shows counts (total, pending, failed)
   - Missing: image timeline/gallery
   - Missing: success rate over time
   - Missing: chunk failure patterns

7. **No Wake Schedule Visualization**
   - Wake schedule exists in database
   - UI shows cron string (confusing)
   - Missing: calendar view of wake times
   - Missing: "device wakes in X hours"

---

## Phase 2 Goals

### 🎯 Primary Objectives

1. **Visualize Historical Data** - Surface telemetry, history, and trends
2. **Improve Monitoring** - Real-time status with historical context
3. **Enhance Diagnostics** - Help users troubleshoot device issues
4. **Better Expectations** - Show what device is doing/will do next

### 📊 Success Metrics

- Users can see device health trends over time
- Users can diagnose connectivity issues
- Users understand device wake schedule at a glance
- Users can see command queue and status
- Device activity is transparent and auditable

---

## Detailed Implementation Plan

### 🔵 Feature 1: Device Activity Timeline

**Purpose:** Show chronological event stream for device

**Data Source:** `device_history` table

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ Activity Timeline                    [Filter ▾] │
├─────────────────────────────────────────────────┤
│                                                  │
│ ●─── 2 hours ago                                │
│  │   Device woke up and sent HELLO              │
│  │   ℹ️  Battery: 3.8V (67%), WiFi: -65dBm      │
│  │                                               │
│ ●─── 5 hours ago                                │
│  │   Command sent: set_wake_schedule            │
│  │   Status: Acknowledged ✅                     │
│  │                                               │
│ ●─── 8 hours ago                                │
│  │   Image received: IMG_2025-11-15_001.jpg     │
│  │   Status: Complete (148/148 chunks)          │
│  │                                               │
│ ●─── 1 day ago                                  │
│  │   Device assigned to site "Greenhouse #1"    │
│  │   ℹ️  By: John Doe                           │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Components to Build:**
- `DeviceActivityTimeline.tsx` - Main timeline component
- Event type badges (color-coded by severity)
- Event detail expansion
- Filtering by event category/severity
- Pagination or infinite scroll

**Event Categories to Display:**
- Assignment changes
- Communication (HELLO, metadata)
- Status changes (online/offline)
- Image transfers
- Command lifecycle
- Configuration updates
- Alerts/warnings/errors

**Implementation:**
```tsx
// Fetch device history
const { data: history } = await supabase
  .from('device_history')
  .select('*')
  .eq('device_id', deviceId)
  .order('event_timestamp', { ascending: false })
  .limit(50);

// Group by date, render timeline
```

---

### 🔵 Feature 2: Telemetry Analytics Dashboard

**Purpose:** Visualize environmental & device metrics over time

**Data Sources:**
- `device_telemetry` table (temp, humidity, pressure, battery, WiFi)
- `devices` table (current values)

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ Telemetry Analytics          [24h ▾] [Refresh] │
├─────────────────────────────────────────────────┤
│                                                  │
│  Temperature                                     │
│  ┌──────────────────────────────────────┐      │
│  │  75°F ┌───────────┬────┐             │      │
│  │       │           │    │             │      │
│  │  70°F │     ┌─────┘    └───┐         │      │
│  │       │     │              └──┐       │      │
│  │  65°F └─────┘                 └─      │      │
│  │  ────────────────────────────────>    │      │
│  │  6AM    10AM    2PM    6PM   Now      │      │
│  └──────────────────────────────────────┘      │
│  Current: 72°F | Avg: 70°F | Range: 65-75°F   │
│                                                  │
│  Battery Voltage                                 │
│  [Similar line chart: 3.6V - 4.2V range]       │
│  Current: 3.8V (67%) | Trend: ↘ Declining      │
│                                                  │
│  WiFi Signal                                     │
│  [Similar line chart: -80 to -40 dBm]          │
│  Current: -65 dBm (Good) | Stable ✅            │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Chart Types:**
1. **Line Charts** for continuous metrics:
   - Temperature (°F/°C)
   - Humidity (%)
   - Pressure (hPa)
   - Battery voltage (V)
   - WiFi RSSI (dBm)

2. **Multi-line Chart** showing all metrics normalized (0-100%)
   - Blue line: Temperature
   - Green line: Humidity
   - Red line: Battery
   - Orange line: WiFi signal

3. **Time Range Selector:**
   - Last 6 hours
   - Last 24 hours
   - Last 7 days
   - Last 30 days
   - Custom range

**Components to Build:**
- `DeviceTelemetryChart.tsx` - Individual metric chart
- `DeviceTelemetryDashboard.tsx` - All charts container
- `TelemetryMetricCard.tsx` - Current value + sparkline
- Use `chart.js` + `react-chartjs-2` (already in package.json)

**Implementation:**
```tsx
// Fetch telemetry data
const { data: telemetry } = await supabase
  .from('device_telemetry')
  .select('captured_at, temperature, humidity, pressure, battery_voltage, wifi_rssi')
  .eq('device_id', deviceId)
  .gte('captured_at', startDate)
  .lte('captured_at', endDate)
  .order('captured_at', { ascending: true });

// Format for Chart.js
const chartData = {
  labels: telemetry.map(t => formatTime(t.captured_at)),
  datasets: [{
    label: 'Temperature',
    data: telemetry.map(t => t.temperature),
    borderColor: 'rgb(59, 130, 246)', // blue
    tension: 0.4
  }]
};
```

---

### 🔵 Feature 3: Enhanced Battery Health Card

**Purpose:** Show battery health trends and alerts

**Data Sources:**
- `devices.battery_voltage`, `devices.battery_health_percent`
- `device_telemetry.battery_voltage` (history)

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ 🔋 Battery Health                               │
├─────────────────────────────────────────────────┤
│                                                  │
│  Current: 3.8V (67%)                            │
│  ████████████████░░░░░░░░░░                    │
│                                                  │
│  7-Day Trend:                                   │
│  4.2V ┌──┐                                      │
│       │  └───┐                                  │
│  3.8V │      └─────●  ← You are here           │
│       │                                          │
│  3.4V ├─────────────────────────── Critical    │
│  ────────────────────────────────>              │
│  Nov 9    Nov 11    Nov 13    Now               │
│                                                  │
│  Status: Good ✅                                │
│  Estimated time to critical: 45 days            │
│  Average drain: 0.01V/day                       │
│                                                  │
│  Thresholds:                                     │
│  • Warning: 3.6V (50%)                          │
│  • Critical: 3.4V (33%)                         │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- Battery voltage graph over last 7/30 days
- Health % indicator with color coding:
  - 🟢 Green: >60% (good)
  - 🟡 Yellow: 40-60% (warning)
  - 🔴 Red: <40% (critical)
- Estimated time until battery replacement needed
- Voltage drain rate calculation
- Alert history (if battery warnings triggered)

**Components to Build:**
- `BatteryHealthCard.tsx` - Enhanced battery card
- `BatteryTrendChart.tsx` - Mini sparkline chart
- `BatteryAlertHistory.tsx` - Past battery alerts

---

### 🔵 Feature 4: WiFi Signal Quality Card

**Purpose:** Show WiFi connectivity health and history

**Data Sources:**
- `devices.wifi_rssi` (current)
- `device_telemetry.wifi_rssi` (history)

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ 📶 WiFi Signal Quality                          │
├─────────────────────────────────────────────────┤
│                                                  │
│  Current: -65 dBm                               │
│  ████████████████████░░░░░ Good                │
│                                                  │
│  24-Hour Signal History:                        │
│  -40 dBm ────────────────────────── Excellent  │
│  -50 dBm ──────────────                         │
│  -60 dBm ──┌──────┬────────┬─────●            │
│  -70 dBm   │      │        │                    │
│  -80 dBm ──┘      └────────┘                    │
│  -90 dBm ────────────────────────── Poor       │
│  ────────────────────────────────>              │
│  12AM   6AM   12PM   6PM   Now                  │
│                                                  │
│  Connection Quality:                            │
│  • Average: -68 dBm (Good)                      │
│  • Best: -55 dBm                                │
│  • Worst: -78 dBm                               │
│  • Disconnections: 0 in last 24h ✅             │
│                                                  │
│  RSSI Scale:                                    │
│  -50 dBm or higher: Excellent                   │
│  -50 to -60: Good                               │
│  -60 to -70: Fair                               │
│  -70 or lower: Poor                             │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- Current WiFi RSSI with visual indicator
- Signal strength graph (last 24h/7d)
- Connection quality metrics
- Disconnection events highlighted
- RSSI interpretation guide

**Components to Build:**
- `WiFiSignalCard.tsx` - Main card
- `WiFiSignalChart.tsx` - Signal history chart
- `WiFiQualityIndicator.tsx` - Visual bar/gauge

---

### 🔵 Feature 5: Command Queue & Status

**Purpose:** Show pending/sent/completed commands

**Data Source:** `device_commands` table

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ ⚡ Command Queue                    [All ▾]     │
├─────────────────────────────────────────────────┤
│                                                  │
│  Pending (1)                                    │
│  ┌───────────────────────────────────────┐     │
│  │ 📸 capture_image                      │     │
│  │ Scheduled for: Nov 16, 8:00 AM        │     │
│  │ Will be sent at next wake              │     │
│  │ Priority: High                         │     │
│  └───────────────────────────────────────┘     │
│                                                  │
│  Recently Sent (2)                              │
│  ┌───────────────────────────────────────┐     │
│  │ ⏰ set_wake_schedule            ✅ Ack │     │
│  │ Sent: 2 hours ago                      │     │
│  │ Acknowledged: 1 hour ago               │     │
│  └───────────────────────────────────────┘     │
│                                                  │
│  ┌───────────────────────────────────────┐     │
│  │ 🔄 update_config                🟡 Sent│     │
│  │ Sent: 5 hours ago                      │     │
│  │ Waiting for acknowledgment...          │     │
│  └───────────────────────────────────────┘     │
│                                                  │
│  Completed (15) [Show all →]                    │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- Grouped by status: Pending, Sent, Acknowledged, Failed
- Command details with payload preview
- Timestamps for full lifecycle
- Retry count and error messages (if failed)
- Priority indication
- Expiration warnings

**Components to Build:**
- `DeviceCommandQueue.tsx` - Main queue display
- `CommandCard.tsx` - Individual command
- `CommandStatusBadge.tsx` - Status indicator
- `CommandPayloadPreview.tsx` - JSON viewer

---

### 🔵 Feature 6: Wake Schedule Visualization

**Purpose:** Make wake schedule user-friendly and predictable

**Data Source:** `devices.wake_schedule_cron`, `devices.next_wake_at`, `devices.last_wake_at`

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ ⏰ Wake Schedule                                │
├─────────────────────────────────────────────────┤
│                                                  │
│  Schedule: Every 6 hours                        │
│  Pattern: 0 */6 * * * (6 AM, 12 PM, 6 PM, 12AM)│
│                                                  │
│  ┌───────────────────────────────────────┐     │
│  │  Last Wake:                            │     │
│  │  Nov 16, 12:15 PM (3 hours ago)        │     │
│  │                                         │     │
│  │  ● ──────────────────────────────● ──>  │     │
│  │  12:15 PM              Now      6:00 PM │     │
│  │                                         │     │
│  │  Next Wake:                             │     │
│  │  Nov 16, 6:00 PM (in 2 hours 45 min)   │     │
│  └───────────────────────────────────────┘     │
│                                                  │
│  Upcoming Wake Times (EST):                     │
│  • Today, 6:00 PM                               │
│  • Today, 12:00 AM                              │
│  • Tomorrow, 6:00 AM                            │
│  • Tomorrow, 12:00 PM                           │
│  • Tomorrow, 6:00 PM                            │
│                                                  │
│  Wake Reliability (Last 7 days):                │
│  ██████████████████░░ 96% (27/28 wakes)        │
│                                                  │
│  [Edit Schedule]                                │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- Human-readable schedule description
- Visual timeline showing last wake → now → next wake
- Countdown to next wake ("in 2 hours 45 minutes")
- List of next 5 wake times
- Wake reliability metric (% of expected wakes that occurred)
- Calendar view option (for weekly patterns)

**Components to Build:**
- `WakeScheduleCard.tsx` - Main card
- `WakeTimeline.tsx` - Visual timeline
- `NextWakeCountdown.tsx` - Live countdown
- `WakeReliabilityIndicator.tsx` - Success rate bar
- `WakeScheduleCalendar.tsx` - Optional calendar view

---

### 🔵 Feature 7: Image Transfer Analytics

**Purpose:** Visualize image success/failure patterns

**Data Source:** `device_images` table

**UI Design:**
```
┌─────────────────────────────────────────────────┐
│ 📷 Image Transfer Analytics          [7 days ▾]│
├─────────────────────────────────────────────────┤
│                                                  │
│  Success Rate: 87% (26/30 images)               │
│  ████████████████████░░░░░                     │
│                                                  │
│  Transfer Timeline:                             │
│  Nov 9  ✅✅❌✅✅                                │
│  Nov 10 ✅✅✅✅                                  │
│  Nov 11 ✅❌✅✅✅                                │
│  Nov 12 ✅✅✅✅✅✅                              │
│  Nov 13 ✅✅❌✅✅                                │
│  Nov 14 ✅✅✅✅                                  │
│  Nov 15 ✅✅✅❌                                  │
│                                                  │
│  Average Transfer Time: 45 seconds              │
│  Average Chunks: 148                            │
│                                                  │
│  Common Issues:                                 │
│  • Timeout (3 images) - Weak WiFi signal        │
│  • Missing chunks (1 image) - Connectivity      │
│                                                  │
│  [View All Images →]                            │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- Success rate over time
- Daily transfer calendar (✅❌ grid)
- Average transfer time & chunk count
- Failure pattern analysis
- Correlation with WiFi signal
- Link to full image gallery

**Components to Build:**
- `ImageAnalyticsCard.tsx` - Main card
- `ImageSuccessCalendar.tsx` - Calendar grid
- `ImageFailureAnalysis.tsx` - Common issues

---

## UI/UX Design Principles

### Visual Hierarchy

1. **Critical Now Info** (Top)
   - Current status (online/offline)
   - Battery level
   - Next wake time

2. **Recent Activity** (Upper middle)
   - Activity timeline (last 24h)
   - Recent images
   - Recent commands

3. **Historical Trends** (Lower middle)
   - Telemetry charts (7d/30d)
   - Battery degradation
   - WiFi quality

4. **Static Config** (Bottom)
   - Assignment details
   - Hardware info
   - Zone & placement

### Color Coding

**Status Colors:**
- 🟢 Green: Good/Online/Success
- 🟡 Yellow: Warning/Degraded
- 🔴 Red: Critical/Offline/Failed
- 🔵 Blue: Info/Neutral
- ⚪ Gray: Inactive/Unknown

**Metric Colors:**
- Temperature: 🔵 Blue
- Humidity: 💧 Cyan
- Battery: 🟢 Green
- WiFi: 📶 Purple
- Pressure: ⚪ Gray

### Responsive Design

**Desktop (1024px+):**
- 3-column grid layout
- All cards visible
- Full-size charts

**Tablet (768-1023px):**
- 2-column grid
- Scrollable sections
- Medium charts

**Mobile (<768px):**
- Single column
- Collapsible sections
- Compact sparklines instead of full charts

### Loading States

- Skeleton loaders for all data cards
- "No data yet" states for new devices
- Graceful degradation if telemetry missing

---

## Implementation Phases

### Phase 2A: Foundation (Week 1)
**Goal:** Set up chart infrastructure and basic timeline

1. ✅ Install/configure Chart.js (already in package.json)
2. Create base chart components:
   - `LineChart.tsx`
   - `SparklineChart.tsx`
   - `MultiLineChart.tsx`
3. Build `DeviceActivityTimeline.tsx`
4. Add timeline to Overview tab
5. Test with existing device_history data

**Deliverables:**
- Working activity timeline showing last 50 events
- Reusable chart components
- Event type badges and formatting

### Phase 2B: Telemetry Visualization (Week 2)
**Goal:** Surface all environmental and device metrics

1. Create `DeviceTelemetryDashboard.tsx`
2. Build individual metric charts:
   - Temperature chart
   - Battery voltage chart
   - WiFi RSSI chart
3. Add time range selector
4. Create new "Analytics" tab in device detail
5. Fetch and display historical telemetry

**Deliverables:**
- Full telemetry dashboard with 5 charts
- Time range filtering (6h, 24h, 7d, 30d)
- Current value cards with sparklines

### Phase 2C: Enhanced Status Cards (Week 3)
**Goal:** Improve battery, WiFi, and wake schedule cards

1. Build `BatteryHealthCard.tsx` (enhanced)
   - Battery trend chart
   - Drain rate calculation
   - Time to critical estimate
2. Build `WiFiSignalCard.tsx`
   - Signal history chart
   - Quality metrics
   - Connection reliability
3. Build `WakeScheduleCard.tsx`
   - Human-readable schedule
   - Visual timeline
   - Next wake countdown
   - Wake reliability metric

**Deliverables:**
- 3 enhanced cards replacing simple info displays
- Real-time countdown for next wake
- Historical trend visualization

### Phase 2D: Command & Image Analytics (Week 4)
**Goal:** Complete visibility into device operations

1. Build `DeviceCommandQueue.tsx`
   - Pending commands list
   - Sent/acknowledged status
   - Command history
2. Build `ImageAnalyticsCard.tsx`
   - Success rate over time
   - Transfer timeline calendar
   - Failure pattern analysis
3. Polish and integrate all components

**Deliverables:**
- Command queue with full lifecycle visibility
- Image analytics showing patterns
- Fully integrated device detail page

---

## Questions for Discussion

### Data & Schema

1. **Telemetry Retention:**
   - How long should we keep telemetry data?
   - Do we need aggregation (hourly/daily averages) for old data?

2. **History Events:**
   - Are all 78 history events relevant for timeline?
   - Should we filter certain event types by default?
   - Do we need different views (full vs. user-relevant)?

3. **Device Alerts Table:**
   - Currently 0 rows - is this table being populated?
   - Should battery/WiFi thresholds trigger alerts?
   - Who should receive alert notifications?

4. **Wake Reliability:**
   - How to calculate expected vs actual wakes?
   - Should we track missed wakes in device_history?

### UI/UX Design

5. **Tab Organization:**
   - Current: Overview, History, Images
   - Proposed: Overview, Activity, Analytics, Images, Commands
   - Or keep 3 tabs and nest features in Overview?

6. **Real-time Updates:**
   - Should telemetry charts update live as device wakes?
   - Polling interval for device status?
   - WebSocket for real-time events?

7. **Mobile Experience:**
   - Which features are most critical for mobile?
   - Should we have a simplified mobile view?
   - Charts vs. sparklines on small screens?

8. **Data Freshness:**
   - Show "Last updated X seconds ago" for all cards?
   - Refresh button on each card or page-level?

### Feature Priorities

9. **Must-Have vs. Nice-to-Have:**
   - Which features are MVP for Phase 2?
   - Which can be deferred to Phase 3?
   - User feedback on priorities?

10. **Performance:**
    - Chart rendering with 1000+ telemetry points?
    - Should we downsample for long time ranges?
    - Client-side or server-side aggregation?

11. **Permissions:**
    - Should all users see command queue?
    - Telemetry data access restrictions?
    - Company-level vs. site-level visibility?

### Technical Decisions

12. **Chart Library:**
    - Continue with Chart.js or switch to Recharts/Victory?
    - Chart.js already in package.json - stick with it?

13. **State Management:**
    - React Query for all data fetching?
    - Local state for chart time ranges?
    - Zustand for UI preferences (collapsed cards, etc.)?

14. **Testing:**
    - Unit tests for chart components?
    - E2E tests for critical flows?
    - Visual regression testing?

---

## Summary

### What We Found

✅ **Rich data in database** - telemetry, history, commands, images all tracked
❌ **Minimal UI exposure** - users can't see most of this valuable data

### What We're Building

📊 **7 Major Features:**
1. Activity Timeline
2. Telemetry Analytics Dashboard
3. Enhanced Battery Health Card
4. WiFi Signal Quality Card
5. Command Queue & Status
6. Wake Schedule Visualization
7. Image Transfer Analytics

### Why It Matters

**Current State:** Users see static snapshot - device is online/offline, that's it.

**Future State:** Users see full device lifecycle - what it's doing, what it did, what it will do, and trends over time.

**Business Impact:**
- ✅ Proactive device maintenance (battery low, WiFi weak)
- ✅ Faster troubleshooting (see exactly when/why device failed)
- ✅ Better capacity planning (wake schedule optimization)
- ✅ Data-driven decisions (telemetry trends inform site conditions)

---

**Next Steps:** Review this plan, answer questions, and approve Phase 2A start.

**Context:** All Phase 1 validation results preserved. Device data flow is solid foundation for UI improvements.
