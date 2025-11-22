# Device UI & Wake Payload System - Implementation Plan

**Date:** November 22, 2025
**Status:** Planning Phase
**Complexity:** Large Multi-Phase Project

---

## Executive Summary

This document outlines the comprehensive plan to fix Device UI data display issues and properly implement the wake payload consolidation system based on the ESP32-CAM architecture document.

### Critical Findings

1. **Device UI shows incorrect/missing data** due to incomplete queries and unpopulated columns
2. **Wake tracking is broken** - `device_wake_payloads` has only 76 records vs 500+ images/telemetry
3. **Roll-up counters are all zero** - no triggers updating device statistics
4. **Context propagation incomplete** - site_id/program_id not always inherited
5. **`device_wake_sessions` table is empty and unused** - should be removed

---

## Phase 1: Quick Wins - Device UI Fixes

**Timeline:** 1-2 hours
**Risk:** Low
**Dependencies:** None

### 1.1 Fix Zone & Placement Card

**Problem:** Shows "No zone or placement assigned" despite having placement data

**Root Cause:**
- UI checks `device.zone_label` which is NULL
- But device HAS `placement_json` (TEXT field containing JSON string)
- Also has `x_position` and `y_position` columns

**Solution:**
```typescript
// In DeviceDetailPage.tsx line 516
// Change from:
if (device.zone_label) { ... }

// To:
const hasPlacement = device.zone_label || device.placement_json || (device.x_position && device.y_position);
if (hasPlacement) {
  // Parse placement_json if it's a string
  const placement = typeof device.placement_json === 'string'
    ? JSON.parse(device.placement_json)
    : device.placement_json;

  // Display: x_position, y_position (map coords)
  // Display: placement.x, placement.y (detailed coords)
  // Display: placement.height, placement.notes
}
```

**Files to modify:**
- `src/pages/DeviceDetailPage.tsx` (lines 516-556)

---

### 1.2 Fix Assignment Card Source of Truth

**Problem:** Overview tab shows different site/program than Programs tab

**Decision Made:** `devices.site_id` and `devices.program_id` = SOURCE OF TRUTH
- Junction tables = history only
- UI always shows current device columns

**Solution:**
- Keep current implementation (already correct at line 67-68)
- Junction tables used only in Programs tab for history
- Verify all queries use `devices.site_id/program_id` not junction tables

**Files to verify:**
- `src/pages/DeviceDetailPage.tsx` (line 67-68) ✓ Already correct
- `src/hooks/useDevice.ts` (line 176-189) ✓ Already correct

---

## Phase 2: Wake Payload Consolidation Architecture

**Timeline:** 4-6 hours
**Risk:** Medium
**Dependencies:** Understanding PDF architecture, MQTT handler

### 2.1 Architectural Decision: Unified Wake Record

**Current State:**
- `device_wake_payloads` - 76 records (INCOMPLETE)
- `device_images` - 300+ records
- `device_telemetry` - 200+ records
- `device_wake_sessions` - 0 records (EMPTY, UNUSED)

**Target State:**
```
ONE wake = ONE record in device_wake_payloads with:
  - payload_id (unique wake identifier)
  - device_id
  - company_id, program_id, site_id (context)
  - site_device_session_id (links to daily session)
  - captured_at (timestamp from device)
  - received_at (server timestamp)
  - wake_window_index (which wake # in schedule)

  TELEMETRY DATA (always present):
  - temperature
  - humidity
  - pressure
  - gas_resistance
  - battery_voltage
  - wifi_rssi
  - telemetry_data (JSONB for additional fields)

  IMAGE DATA (if image was included):
  - image_id (FK to device_images)
  - image_status (pending/receiving/complete/failed)
  - resent_received_at (if retry occurred)

  METADATA:
  - payload_status (pending/complete/failed)
  - overage_flag (exceeded expected wake count)
```

### 2.2 Schema Changes Required

**Add missing columns to device_wake_payloads:**
```sql
ALTER TABLE device_wake_payloads
  ADD COLUMN IF NOT EXISTS telemetry_id UUID REFERENCES device_telemetry(telemetry_id),
  ADD COLUMN IF NOT EXISTS wake_type TEXT CHECK (wake_type IN ('image_wake', 'telemetry_only', 'hello', 'retry')),
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER,
  ADD COLUMN IF NOT EXISTS chunks_received INTEGER,
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE;
```

**Populate telemetry_data JSONB:**
- Currently NULL for all 76 records
- Should contain full sensor reading + metadata

**Remove device_wake_sessions table:**
```sql
-- Verify it's empty first
SELECT COUNT(*) FROM device_wake_sessions; -- Should be 0

-- Drop table
DROP TABLE IF EXISTS device_wake_sessions CASCADE;
```

### 2.3 MQTT Handler Updates

**File:** `supabase/functions/mqtt_device_handler/index.ts`

**Current Flow (from PDF):**
1. Device wakes → sends HELLO
2. Server sends `capture_image` command
3. Device sends metadata
4. Server sends `send_image` command
5. Device sends chunks
6. Server sends ACK_OK or MISSING_CHUNKS

**Required Changes:**

**On HELLO message:**
```typescript
// Create wake payload record IMMEDIATELY
const { data: wakePayload } = await supabase
  .from('device_wake_payloads')
  .insert({
    device_id,
    company_id, program_id, site_id, // inherited from device
    site_device_session_id, // from active session
    captured_at: payload.capture_timestamp,
    received_at: new Date().toISOString(),
    temperature: payload.temperature,
    humidity: payload.humidity,
    pressure: payload.pressure,
    gas_resistance: payload.gas_resistance,
    battery_voltage: payload.battery_voltage,
    wifi_rssi: payload.wifi_rssi,
    telemetry_data: payload, // full payload as JSONB
    wake_type: payload.image_name ? 'image_wake' : 'telemetry_only',
    payload_status: 'pending'
  })
  .select('payload_id')
  .single();
```

**On metadata received:**
```typescript
// Link image to wake payload
await supabase
  .from('device_images')
  .update({
    wake_payload_id: wakePayload.payload_id
  })
  .eq('image_id', imageId);

// Update wake payload with image reference
await supabase
  .from('device_wake_payloads')
  .update({
    image_id: imageId,
    image_status: 'receiving',
    total_chunks: payload.total_chunks_count
  })
  .eq('payload_id', wakePayload.payload_id);
```

**On ACK_OK:**
```typescript
// Mark wake as complete
await supabase
  .from('device_wake_payloads')
  .update({
    payload_status: 'complete',
    image_status: 'complete',
    is_complete: true
  })
  .eq('payload_id', wakePayload.payload_id);

// This will trigger roll-up counters (see Phase 3)
```

---

## Phase 3: Database Triggers for Roll-Up Counters

**Timeline:** 2-3 hours
**Risk:** Low
**Dependencies:** Phase 2 wake payload consolidation

### 3.1 Trigger: Update total_wakes

**Table:** `device_wake_payloads`
**Event:** INSERT
**Action:** Increment `devices.total_wakes`

```sql
CREATE OR REPLACE FUNCTION increment_device_wake_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devices
  SET
    total_wakes = total_wakes + 1,
    last_wake_at = NEW.captured_at,
    updated_at = NOW()
  WHERE device_id = NEW.device_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_wake_count
  AFTER INSERT ON device_wake_payloads
  FOR EACH ROW
  EXECUTE FUNCTION increment_device_wake_count();
```

### 3.2 Trigger: Update total_images_taken

**Table:** `device_images`
**Event:** UPDATE (when status changes to 'complete')
**Action:** Increment `devices.total_images_taken`

```sql
CREATE OR REPLACE FUNCTION increment_device_image_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Only count when image completes (not retries)
  IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
    UPDATE devices
    SET
      total_images_taken = total_images_taken + 1,
      latest_mgi_score = NEW.mgi_score,
      latest_mgi_velocity = NEW.mgi_velocity,
      latest_mgi_at = NEW.scored_at,
      updated_at = NOW()
    WHERE device_id = NEW.device_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_image_count
  AFTER UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION increment_device_image_count();
```

### 3.3 Trigger: Update total_alerts

**Table:** `device_alerts`
**Event:** INSERT
**Action:** Increment `devices.total_alerts` and specific alert type counters

```sql
CREATE OR REPLACE FUNCTION increment_device_alert_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devices
  SET
    total_alerts = total_alerts + 1,
    total_battery_health_alerts = CASE
      WHEN NEW.alert_type = 'battery_health'
      THEN total_battery_health_alerts + 1
      ELSE total_battery_health_alerts
    END,
    updated_at = NOW()
  WHERE device_id = NEW.device_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_alert_count
  AFTER INSERT ON device_alerts
  FOR EACH ROW
  EXECUTE FUNCTION increment_device_alert_count();
```

### 3.4 Scheduled Job: Recalculate Expected Images

**Frequency:** Daily at midnight (site timezone)
**Purpose:** Calculate `total_images_expected_to_date` from cron schedule

```sql
CREATE OR REPLACE FUNCTION recalculate_expected_images()
RETURNS void AS $$
BEGIN
  UPDATE devices d
  SET total_images_expected_to_date = (
    -- Parse cron schedule to get wakes per day
    CASE
      WHEN wake_schedule_cron ~ '0 \*/(\d+) \* \* \*' THEN
        -- Every X hours format
        24 / CAST(substring(wake_schedule_cron FROM '\*/(\d+)') AS INTEGER)
      WHEN wake_schedule_cron ~ '0 (\d+,)+ \* \* \*' THEN
        -- Specific hours format (e.g., "0 8,16 * * *")
        array_length(string_to_array(
          substring(wake_schedule_cron FROM '0 ([0-9,]+)'),
          ','
        ), 1)
      ELSE 0
    END
    *
    -- Days since mapped (or provisioned)
    EXTRACT(DAY FROM (NOW() - COALESCE(d.mapped_at, d.provisioned_at)))
  )
  WHERE wake_schedule_cron IS NOT NULL
    AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron
SELECT cron.schedule(
  'recalculate-expected-images',
  '0 0 * * *', -- Daily at midnight
  $$SELECT recalculate_expected_images()$$
);
```

---

## Phase 4: Next Wake Calculation

**Timeline:** 2 hours
**Risk:** Low
**Dependencies:** None

### 4.1 Update last_wake_at on Every Wake

**Already implemented in trigger from Phase 3.1** ✓

### 4.2 Calculate next_wake_at After Every Wake

**Add to MQTT handler ACK_OK flow:**

```typescript
// After wake completes successfully
const { data: device } = await supabase
  .from('devices')
  .select('wake_schedule_cron, site_id, sites(timezone)')
  .eq('device_id', deviceId)
  .single();

// Calculate next wake using RPC function
const { data: nextWake } = await supabase.rpc(
  'fn_calculate_next_wake_time',
  {
    p_last_wake_at: new Date().toISOString(),
    p_cron_expression: device.wake_schedule_cron,
    p_timezone: device.sites.timezone || 'America/New_York'
  }
);

// Update device
await supabase
  .from('devices')
  .update({
    next_wake_at: nextWake,
    last_wake_at: new Date().toISOString()
  })
  .eq('device_id', deviceId);
```

**Function already exists:** `fn_calculate_next_wake_time` ✓

---

## Phase 5: UI Updates

**Timeline:** 1-2 hours
**Risk:** Low
**Dependencies:** Phases 1-4 complete

### 5.1 Device Statistics Card

**Current:** Shows all zeros
**After Phase 3:** Will show real-time counts

**Enhancement:** Add loading states and better formatting

### 5.2 Next Wake Display

**Current:** "Scheduled (activate device to calculate)"
**After Phase 4:** Shows actual timestamp

**Enhancement:**
```typescript
const getNextWakeDisplay = () => {
  if (device.next_wake_at) {
    return formatDistanceToNow(new Date(device.next_wake_at), { addSuffix: true });
  }
  if (device.wake_schedule_cron && !device.is_active) {
    return 'Activate device to calculate next wake';
  }
  return 'Not scheduled';
};
```

---

## Phase 6: Data Backfill (Optional)

**Timeline:** 1 hour
**Risk:** Low
**Dependencies:** All phases complete

### 6.1 Backfill Existing Wake Payloads

**Problem:** 76 existing wake_payload records are incomplete

**Solution:**
```sql
-- Link existing telemetry to payloads
UPDATE device_wake_payloads wp
SET
  telemetry_data = (
    SELECT row_to_json(dt)
    FROM device_telemetry dt
    WHERE dt.device_id = wp.device_id
      AND dt.captured_at = wp.captured_at
    LIMIT 1
  ),
  telemetry_id = (
    SELECT dt.telemetry_id
    FROM device_telemetry dt
    WHERE dt.device_id = wp.device_id
      AND dt.captured_at = wp.captured_at
    LIMIT 1
  )
WHERE telemetry_data IS NULL;

-- Recalculate all device counters
UPDATE devices d
SET
  total_wakes = (SELECT COUNT(*) FROM device_wake_payloads WHERE device_id = d.device_id),
  total_images_taken = (SELECT COUNT(*) FROM device_images WHERE device_id = d.device_id AND status = 'complete'),
  total_alerts = (SELECT COUNT(*) FROM device_alerts WHERE device_id = d.device_id);
```

---

## Implementation Order

### Week 1: Foundation
1. ✅ **Phase 1.1** - Fix Zone & Placement Card (30 min)
2. ✅ **Phase 1.2** - Verify Assignment Card (15 min)
3. **Phase 2.1** - Schema changes to device_wake_payloads (1 hour)
4. **Phase 2.2** - Remove device_wake_sessions table (15 min)

### Week 2: Core Logic
5. **Phase 2.3** - Update MQTT handler for wake consolidation (3 hours)
6. **Phase 3** - Create all database triggers (2 hours)
7. **Phase 4** - Implement next_wake calculation (1 hour)

### Week 3: Testing & Polish
8. **Phase 5** - UI updates and enhancements (2 hours)
9. **Phase 6** - Data backfill (optional) (1 hour)
10. **Testing** - End-to-end verification (2 hours)

**Total Estimated Time:** 15-18 hours

---

## Risk Mitigation

### High-Risk Areas

1. **MQTT Handler Changes**
   - Risk: Breaking existing wake flow
   - Mitigation: Deploy to test environment first, extensive logging

2. **Database Triggers**
   - Risk: Performance impact on high-volume inserts
   - Mitigation: Test with load, add indexes if needed

3. **Data Consolidation**
   - Risk: Missing edge cases in wake types
   - Mitigation: Review PDF architecture thoroughly

### Rollback Plan

Each phase has independent rollback:
- **Phase 1**: Revert UI changes
- **Phase 2**: Keep old tables until verified
- **Phase 3**: Drop triggers easily
- **Phase 4**: Function already exists, low risk

---

## Testing Strategy

### Unit Tests
- Trigger functions (increment counters)
- Wake payload consolidation logic
- Expected images calculation

### Integration Tests
- Full wake cycle: HELLO → metadata → chunks → ACK_OK
- Counter updates propagate correctly
- Context inheritance works

### E2E Tests
- Use device simulator (from PDF E2E tests)
- Verify UI displays correct counts
- Test offline → online recovery

---

## Success Criteria

✅ **Phase 1 Complete When:**
- Zone & Placement card shows placement data
- Assignment card shows correct site/program

✅ **Phase 2 Complete When:**
- Every wake creates ONE device_wake_payloads record
- telemetry_data JSONB is fully populated
- image_id links to device_images when applicable

✅ **Phase 3 Complete When:**
- total_wakes increments on every wake
- total_images_taken increments on image completion
- total_alerts increments on alert creation

✅ **Phase 4 Complete When:**
- last_wake_at updates on every wake
- next_wake_at calculates from cron + timezone
- UI shows "in X hours" instead of "not calculated"

✅ **Project Complete When:**
- All device statistics show real data
- Wake payload table is source of truth
- UI accurately reflects database state
- No orphaned or duplicate records

---

## Questions Resolved

| Question | Answer | Impact |
|----------|--------|--------|
| Source of truth for assignment? | `devices.site_id/program_id` | UI already correct |
| Wake counting source? | `device_wake_payloads` | Need consolidation |
| Count failed images? | Yes, track status separately | Schema change |
| Roll-up method? | Database triggers | Real-time updates |
| Expected images calculation? | Parse cron, calc days active | Daily job |
| placement_json type? | Keep as TEXT, parse in UI | No migration needed |

---

## Next Steps

1. Review this plan with stakeholders
2. Get approval for schema changes
3. Start with Phase 1 (quick wins)
4. Move to Phase 2 after testing Phase 1

**Current Status:** ✅ Ready to begin Phase 1

