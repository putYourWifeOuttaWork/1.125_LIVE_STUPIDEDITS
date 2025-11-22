# LOCF (Last Observation Carried Forward) Testing Guide

**Migration Applied:** `20251121235745_fix_snapshot_locf.sql`
**Function Updated:** `generate_session_wake_snapshot()`
**Testing Method:** Web MQTT client + SQL verification

---

## Test Scenario Overview

We'll simulate a device that:
1. Wakes and sends telemetry at 9:00 AM (baseline data)
2. Skips the 12:00 PM wake (missed wake)
3. We generate a snapshot at 12:00 PM and verify LOCF kicks in
4. Device wakes again at 3:00 PM with new data

---

## Prerequisites

**Required Data:**
- Active site with device configured
- Active site_device_session
- Web MQTT client access

**Get Your Context:**
```sql
-- Find your test site
SELECT site_id, name, length, width 
FROM sites 
WHERE company_id = (SELECT company_id FROM users WHERE email = 'your-email@example.com')
LIMIT 1;

-- Find or create active session
SELECT session_id, site_id, session_date, session_status
FROM site_device_sessions
WHERE site_id = 'YOUR_SITE_ID'
  AND session_status = 'active'
ORDER BY created_at DESC
LIMIT 1;

-- Find test device
SELECT device_id, device_code, device_name
FROM devices
WHERE site_id = 'YOUR_SITE_ID'
  AND is_active = true
LIMIT 1;
```

---

## Step 1: Send Initial Telemetry (9:00 AM Baseline)

**MQTT Topic:** `device/YOUR_DEVICE_CODE/telemetry`

**Payload:**
```json
{
  "device_code": "YOUR_DEVICE_CODE",
  "temperature": 22.5,
  "humidity": 65.3,
  "pressure": 1013.2,
  "gas_resistance": 85000,
  "wifi_rssi": -45,
  "captured_at": "2024-11-22T09:00:00Z"
}
```

**Verify Data Inserted:**
```sql
SELECT 
  device_id,
  temperature,
  humidity,
  captured_at,
  captured_at AT TIME ZONE 'America/New_York' as captured_local
FROM device_telemetry
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY captured_at DESC
LIMIT 1;
```

**Expected:** Row with temperature=22.5, humidity=65.3 at 9:00 AM

---

## Step 2: Generate Snapshot for 9:00 AM Wake (Baseline)

**SQL:**
```sql
SELECT generate_session_wake_snapshot(
  'YOUR_SESSION_ID'::uuid,
  1, -- wake number
  '2024-11-22 09:00:00'::timestamptz, -- wake start
  '2024-11-22 09:15:00'::timestamptz  -- wake end (15 min window)
);
```

**Verify Snapshot Created:**
```sql
SELECT 
  snapshot_id,
  wake_number,
  wake_round_start,
  wake_round_end,
  site_state->'device_data'->0->'telemetry' as device_telemetry,
  site_state->'device_data'->0->'telemetry'->>'is_current' as is_current,
  site_state->'device_data'->0->'telemetry'->>'data_freshness' as freshness
FROM session_wake_snapshots
WHERE session_id = 'YOUR_SESSION_ID'
  AND wake_number = 1
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- `is_current`: "true"
- `data_freshness`: "current_wake"
- `temperature`: 22.5
- `humidity`: 65.3

---

## Step 3: Skip 12:00 PM Wake (DO NOTHING)

**Do NOT send any telemetry for this time period.**

This simulates a missed wake - the device didn't wake up at 12:00 PM.

---

## Step 4: Generate Snapshot for 12:00 PM (LOCF Test)

**SQL:**
```sql
SELECT generate_session_wake_snapshot(
  'YOUR_SESSION_ID'::uuid,
  2, -- wake number
  '2024-11-22 12:00:00'::timestamptz, -- wake start
  '2024-11-22 12:15:00'::timestamptz  -- wake end (15 min window)
);
```

**Verify LOCF Snapshot:**
```sql
SELECT 
  snapshot_id,
  wake_number,
  wake_round_start,
  wake_round_end,
  site_state->'device_data'->0->'telemetry' as device_telemetry,
  site_state->'device_data'->0->'telemetry'->>'is_current' as is_current,
  site_state->'device_data'->0->'telemetry'->>'data_freshness' as freshness,
  site_state->'device_data'->0->'telemetry'->>'hours_since_last' as hours_since
FROM session_wake_snapshots
WHERE session_id = 'YOUR_SESSION_ID'
  AND wake_number = 2
ORDER BY created_at DESC
LIMIT 1;
```

**✅ Expected LOCF Behavior:**
- `is_current`: "false" (not fresh data)
- `data_freshness`: "carried_forward" (LOCF activated)
- `hours_since_last`: "3.00" (3 hours since 9:00 AM reading)
- `temperature`: 22.5 (same as 9:00 AM - carried forward)
- `humidity`: 65.3 (same as 9:00 AM - carried forward)
- `captured_at`: "2024-11-22T09:00:00Z" (original timestamp preserved)

**❌ Old Behavior (Before LOCF):**
- Telemetry would be NULL
- No temperature/humidity data
- Gap in timeline

---

## Step 5: Send New Telemetry (3:00 PM Fresh Data)

**MQTT Topic:** `device/YOUR_DEVICE_CODE/telemetry`

**Payload:**
```json
{
  "device_code": "YOUR_DEVICE_CODE",
  "temperature": 24.8,
  "humidity": 58.1,
  "pressure": 1012.5,
  "gas_resistance": 87000,
  "wifi_rssi": -48,
  "captured_at": "2024-11-22T15:00:00Z"
}
```

**Verify New Data:**
```sql
SELECT 
  temperature,
  humidity,
  captured_at
FROM device_telemetry
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY captured_at DESC
LIMIT 2;
```

**Expected:** Two rows - 9:00 AM (22.5°) and 3:00 PM (24.8°)

---

## Step 6: Generate Snapshot for 3:00 PM (Fresh Data Resume)

**SQL:**
```sql
SELECT generate_session_wake_snapshot(
  'YOUR_SESSION_ID'::uuid,
  3, -- wake number
  '2024-11-22 15:00:00'::timestamptz,
  '2024-11-22 15:15:00'::timestamptz
);
```

**Verify Fresh Data Snapshot:**
```sql
SELECT 
  wake_number,
  site_state->'device_data'->0->'telemetry'->>'is_current' as is_current,
  site_state->'device_data'->0->'telemetry'->>'data_freshness' as freshness,
  site_state->'device_data'->0->'telemetry'->>'temperature' as temp,
  site_state->'device_data'->0->'telemetry'->>'captured_at' as captured
FROM session_wake_snapshots
WHERE session_id = 'YOUR_SESSION_ID'
  AND wake_number = 3
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- `is_current`: "true" (back to fresh data)
- `data_freshness`: "current_wake"
- `temperature`: 24.8 (new reading)
- No `hours_since_last` field (not needed for fresh data)

---

## Step 7: Compare All Three Snapshots

**SQL:**
```sql
SELECT 
  wake_number,
  wake_round_start,
  site_state->'device_data'->0->'telemetry'->>'is_current' as is_current,
  site_state->'device_data'->0->'telemetry'->>'data_freshness' as freshness,
  site_state->'device_data'->0->'telemetry'->>'temperature' as temp,
  site_state->'device_data'->0->'telemetry'->>'hours_since_last' as hours_since,
  site_state->'device_data'->0->'telemetry'->>'captured_at' as data_timestamp
FROM session_wake_snapshots
WHERE session_id = 'YOUR_SESSION_ID'
  AND wake_number IN (1, 2, 3)
ORDER BY wake_number;
```

**Expected Timeline:**

| wake | time | is_current | freshness | temp | hours_since | data_timestamp |
|------|------|-----------|-----------|------|-------------|----------------|
| 1 | 09:00 | true | current_wake | 22.5 | null | 09:00 |
| 2 | 12:00 | false | carried_forward | 22.5 | 3.00 | 09:00 |
| 3 | 15:00 | true | current_wake | 24.8 | null | 15:00 |

**✅ Success Criteria:**
- Wake 1: Fresh baseline data
- Wake 2: LOCF activated, data carried forward with flags
- Wake 3: Fresh data resumes
- No NULL telemetry in any snapshot
- Timeline shows continuous data

---

## Testing MGI LOCF (Optional - Requires Image)

If you want to test MGI LOCF as well:

**Send Image at 9:00 AM:**
```json
{
  "device_code": "YOUR_DEVICE_CODE",
  "image_data": "base64_encoded_image_string",
  "captured_at": "2024-11-22T09:00:00Z"
}
```

**Skip 12:00 PM image**

**Generate snapshots and verify:**
```sql
SELECT 
  wake_number,
  site_state->'device_data'->0->'mgi_state'->>'is_current' as mgi_current,
  site_state->'device_data'->0->'mgi_state'->>'data_freshness' as mgi_freshness,
  site_state->'device_data'->0->'mgi_state'->>'current_mgi' as mgi_score,
  site_state->'device_data'->0->'mgi_state'->>'hours_since_last' as mgi_hours_since
FROM session_wake_snapshots
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY wake_number;
```

**Expected:** Same LOCF pattern for MGI as telemetry

---

## Troubleshooting

**Issue:** Telemetry not showing in snapshot
- Check device_id matches between telemetry and devices table
- Verify timestamp is within wake window (start to end)
- Check company_id is set correctly on telemetry

**Issue:** LOCF not activating (still getting NULL)
- Ensure migration was applied successfully
- Verify there IS historical data before the wake window
- Check function `generate_session_wake_snapshot` was replaced

**Issue:** hours_since_last calculation wrong
- Verify timestamps are in same timezone
- Check EXTRACT(EPOCH...) calculation in function

---

## Success Metrics

✅ **LOCF Working Correctly When:**
1. Snapshot with missed wake shows `is_current: false`
2. `data_freshness` shows "carried_forward"
3. `hours_since_last` shows correct elapsed time
4. Telemetry values match previous reading
5. No NULL telemetry when historical data exists
6. Timeline visualization has no gaps

---

**Next Step After Testing:**
Update IOT_ARCHITECTURE_OPTIMIZATION.md with test results and proceed to Phase 2 (Missed Wake Detection).
