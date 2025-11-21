# Next Phase: Alert & Connectivity Visualization System

## Quick Start Commands

### 1. Run Snapshot Backfill (Required First!)
```bash
node backfill-snapshots-locf.mjs
```
This will fix all existing snapshots to have complete device data.

## Implementation Plan

### Phase 1: Connectivity Status Indicators (2-3 hours)

**Files to Modify:**
- `src/components/lab/SiteMapAnalyticsViewer.tsx` - Add connectivity badges
- `src/pages/SiteDeviceSessionDetailPage.tsx` - Pass connectivity data
- `src/utils/wakeScheduleHelpers.ts` - New file for cron parsing

**Logic:**
```typescript
// Parse wake schedule to get expected interval
function parseWakeSchedule(cron: string): number {
  // Examples:
  // "0 8,14,20 * * *" → 3 times/day → 8 hour intervals
  // "0 */4 * * *" → every 4 hours
  // "0 8 * * *" → daily → 24 hour intervals

  const parts = cron.split(' ');
  const hours = parts[1];

  if (hours.includes('/')) {
    // Every X hours: "*/4" → 4 hours
    return parseInt(hours.split('/')[1]) * 60 * 60;
  } else if (hours.includes(',')) {
    // Specific times: "8,14,20" → avg 6 hours between
    const times = hours.split(',').map(Number);
    return (24 / times.length) * 60 * 60;
  } else {
    // Once per day
    return 24 * 60 * 60;
  }
}

// Calculate connectivity status
function getConnectivityStatus(
  lastSeenAt: string,
  wakeScheduleCron: string,
  currentTime: Date = new Date()
): 'green' | 'yellow' | 'red' {
  const lastSeen = new Date(lastSeenAt);
  const expectedInterval = parseWakeSchedule(wakeScheduleCron);
  const timeSince = (currentTime.getTime() - lastSeen.getTime()) / 1000;
  const periodsLate = timeSince / expectedInterval;

  if (periodsLate <= 1.2) return 'green'; // On track (+20% buffer)
  if (periodsLate <= 2.5) return 'yellow'; // 1-2 missed
  return 'red'; // 3+ missed
}
```

**Visual Implementation:**
```tsx
// In SiteMapAnalyticsViewer.tsx, add badge above device node
<g transform={`translate(${x}, ${y})`}>
  {/* Connectivity Badge */}
  <circle
    cx={0}
    cy={-15}
    r={4}
    fill={getConnectivityColor(device)}
    stroke="white"
    strokeWidth={1}
    opacity={0.9}
  />

  {/* Device Node */}
  <circle
    cx={0}
    cy={0}
    r={8}
    fill={getDeviceColor(device, zoneMode)}
  />

  {/* Alert Badge (if exists) */}
  {device.hasActiveAlert && (
    <g transform="translate(8, -8)">
      <circle r={5} fill="white" />
      {device.alertSeverity === 'critical' ? (
        <polygon
          points="0,-4 3.5,2 -3.5,2"
          fill="#DC2626"
        />
      ) : (
        <polygon
          points="0,-3 2.5,1.5 -2.5,1.5"
          fill="#F59E0B"
        />
      )}
    </g>
  )}
</g>
```

### Phase 2: Fetch Active Alerts (1 hour)

**Add to SiteDeviceSessionDetailPage.tsx:**
```typescript
// Fetch active alerts for session
const fetchActiveAlerts = async () => {
  const { data, error } = await supabase
    .from('device_alerts')
    .select('alert_id, device_id, alert_type, severity, message, metadata')
    .eq('site_id', siteId)
    .gte('triggered_at', sessionStartDate)
    .lte('triggered_at', sessionEndDate)
    .is('resolved_at', null);

  if (error) {
    console.error('Error fetching alerts:', error);
    return;
  }

  // Group by device_id
  const alertsByDevice = new Map();
  data.forEach(alert => {
    if (!alertsByDevice.has(alert.device_id)) {
      alertsByDevice.set(alert.device_id, []);
    }
    alertsByDevice.get(alert.device_id).push(alert);
  });

  setDeviceAlerts(alertsByDevice);
};

// Enhance displayDevices with alert info
const displayDevices = useMemo(() => {
  // ... existing code ...
  return transformedDevices.map(d => ({
    ...d,
    hasActiveAlert: deviceAlerts.has(d.device_id),
    alertSeverity: deviceAlerts.has(d.device_id)
      ? Math.max(...deviceAlerts.get(d.device_id).map(a =>
          a.severity === 'critical' ? 3 : 2
        ))
      : 0,
    alerts: deviceAlerts.get(d.device_id) || [],
  }));
}, [processedSnapshots, currentSnapshotIndex, deviceAlerts]);
```

### Phase 3: Automated Missed Wake Alerts (2-3 hours)

**Create Migration:**
```sql
-- supabase/migrations/YYYYMMDDHHMMSS_auto_missed_wake_alerts.sql

-- Function to check and generate missed wake alerts
CREATE OR REPLACE FUNCTION check_and_alert_missed_wakes()
RETURNS void AS $$
DECLARE
  v_device RECORD;
  v_expected_interval_seconds integer;
  v_time_since_last_wake integer;
  v_periods_late numeric;
  v_existing_alert_id uuid;
BEGIN
  FOR v_device IN
    SELECT
      d.device_id,
      d.device_code,
      d.wake_schedule_cron,
      d.last_seen_at,
      d.company_id,
      dsa.site_id,
      s.program_id
    FROM devices d
    LEFT JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    LEFT JOIN sites s ON dsa.site_id = s.site_id
    WHERE d.status = 'active'
      AND d.wake_schedule_cron IS NOT NULL
      AND d.last_seen_at IS NOT NULL
  LOOP
    -- Parse cron to get interval (simplified for common patterns)
    v_expected_interval_seconds := CASE
      WHEN v_device.wake_schedule_cron LIKE '%*/4%' THEN 4 * 3600
      WHEN v_device.wake_schedule_cron LIKE '%*/6%' THEN 6 * 3600
      WHEN v_device.wake_schedule_cron LIKE '%*/8%' THEN 8 * 3600
      WHEN v_device.wake_schedule_cron LIKE '%8,14,20%' THEN 6 * 3600
      ELSE 24 * 3600
    END;

    v_time_since_last_wake := EXTRACT(EPOCH FROM (now() - v_device.last_seen_at))::integer;
    v_periods_late := v_time_since_last_wake::numeric / v_expected_interval_seconds::numeric;

    -- Check if alert already exists
    SELECT alert_id INTO v_existing_alert_id
    FROM device_alerts
    WHERE device_id = v_device.device_id
      AND alert_type = 'missed_wake'
      AND resolved_at IS NULL
    LIMIT 1;

    -- Generate or update alert if 2+ periods late
    IF v_periods_late >= 2.0 THEN
      IF v_existing_alert_id IS NULL THEN
        -- Create new alert
        INSERT INTO device_alerts (
          device_id,
          alert_type,
          severity,
          message,
          metadata,
          company_id,
          program_id,
          site_id,
          alert_category
        )
        VALUES (
          v_device.device_id,
          'missed_wake',
          CASE
            WHEN v_periods_late >= 3.0 THEN 'critical'
            ELSE 'warning'
          END,
          format(
            'Device %s has missed %s wake cycles (last seen: %s)',
            v_device.device_code,
            FLOOR(v_periods_late),
            to_char(v_device.last_seen_at, 'YYYY-MM-DD HH24:MI')
          ),
          jsonb_build_object(
            'periods_late', FLOOR(v_periods_late),
            'expected_interval_hours', v_expected_interval_seconds / 3600,
            'last_seen_at', v_device.last_seen_at,
            'checked_at', now()
          ),
          v_device.company_id,
          v_device.program_id,
          v_device.site_id,
          'system'
        );
      ELSE
        -- Update existing alert severity if worse
        UPDATE device_alerts
        SET
          severity = CASE
            WHEN v_periods_late >= 3.0 THEN 'critical'
            ELSE 'warning'
          END,
          message = format(
            'Device %s has missed %s wake cycles (last seen: %s)',
            v_device.device_code,
            FLOOR(v_periods_late),
            to_char(v_device.last_seen_at, 'YYYY-MM-DD HH24:MI')
          ),
          metadata = jsonb_build_object(
            'periods_late', FLOOR(v_periods_late),
            'expected_interval_hours', v_expected_interval_seconds / 3600,
            'last_seen_at', v_device.last_seen_at,
            'checked_at', now()
          )
        WHERE alert_id = v_existing_alert_id;
      END IF;
    ELSIF v_existing_alert_id IS NOT NULL THEN
      -- Auto-resolve if back on track
      UPDATE device_alerts
      SET
        resolved_at = now(),
        resolution_notes = 'Auto-resolved: device back online'
      WHERE alert_id = v_existing_alert_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule to run every hour
SELECT cron.schedule(
  'check_missed_wakes',
  '0 * * * *',
  $$SELECT check_and_alert_missed_wakes();$$
);
```

### Phase 4: Site-Level Click Handlers (1 hour)

**Modify SessionSnapshotViewer component:**
```typescript
// In src/pages/lab/SessionSnapshotViewer.tsx
<SiteMapAnalyticsViewer
  devices={displayDevices}
  onDeviceClick={(deviceId) => {
    // Create hash with device and snapshot info
    const hash = `#device-${deviceId}&snapshot-${currentSnapshotIndex}`;

    // Navigate to device session detail
    navigate(
      `/programs/${programId}/sessions/${sessionId}/device/${deviceId}${hash}`
    );
  }}
/>

// In SiteDeviceSessionDetailPage.tsx, handle hash routing
useEffect(() => {
  const hash = window.location.hash;
  if (hash.includes('snapshot-')) {
    const snapshotMatch = hash.match(/snapshot-(\d+)/);
    if (snapshotMatch) {
      setCurrentSnapshotIndex(parseInt(snapshotMatch[1]));
    }
  }
}, []);
```

## Testing Plan

### Test 1: Connectivity Indicators
1. Navigate to session with devices at different wake stages
2. Verify color coding:
   - Green: Device woke in last period
   - Yellow: Device missed 1 wake
   - Red: Device missed 3+ wakes

### Test 2: Alert Indicators
1. Manually create test alert in `device_alerts`
2. Navigate to session
3. Verify alert icon appears on correct device
4. Click device → verify navigation works

### Test 3: Auto-Generated Alerts
1. Take device offline (stop mqtt)
2. Wait for alert generation (run manually: `SELECT check_and_alert_missed_wakes();`)
3. Verify alert appears in `device_alerts` table
4. Verify alert shows on map
5. Bring device back online
6. Verify alert auto-resolves

### Test 4: Backfilled Snapshots
1. Run: `node backfill-snapshots-locf.mjs`
2. Query old session
3. Verify all devices visible in all snapshots
4. Verify environmental aggregates populated

## Success Criteria

- [ ] Connectivity status shows correctly for all devices
- [ ] Alert badges appear on devices with active alerts
- [ ] Missed wake alerts auto-generate after 2+ missed cycles
- [ ] Alerts auto-resolve when device comes back
- [ ] Device clicks navigate to correct detail pages
- [ ] Historical snapshots show complete data
- [ ] No performance degradation with 20+ devices

## Files to Create/Modify

**New Files:**
- `src/utils/wakeScheduleHelpers.ts` - Cron parsing utilities
- `backfill-snapshots-locf.mjs` - ✅ Already created
- Migration: `auto_missed_wake_alerts.sql`

**Modified Files:**
- `src/components/lab/SiteMapAnalyticsViewer.tsx` - Add badges
- `src/pages/SiteDeviceSessionDetailPage.tsx` - ✅ Already modified
- `src/pages/lab/SessionSnapshotViewer.tsx` - Add click handlers

## Estimated Time

- **Phase 1:** 2-3 hours (connectivity indicators)
- **Phase 2:** 1 hour (fetch alerts)
- **Phase 3:** 2-3 hours (auto-alerts)
- **Phase 4:** 1 hour (click handlers)

**Total:** 6-8 hours of focused development

## Priority Order

1. **Run backfill script** ← Do this NOW
2. Connectivity indicators (high user value)
3. Alert indicators (safety-critical)
4. Auto-alert generation (automation)
5. Click handlers (nice-to-have)
