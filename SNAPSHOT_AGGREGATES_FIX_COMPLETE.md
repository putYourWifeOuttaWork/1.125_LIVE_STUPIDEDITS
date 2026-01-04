# Snapshot Aggregates Fix - Complete

## Problem Identified

Your snapshots had NULL temperature/humidity data because:

1. **Wake windows used 1-hour time ranges** (00:00-01:00, 01:00-02:00, etc.)
2. **Devices transmit data at specific times**, not continuously throughout the hour
3. **Environmental telemetry was sparse**: All temp/humidity came from hour 1 wakes (01:05-01:43)
4. **Later wakes had images but NO telemetry records**

Example from Jan 4, 2026:
- Hour 1: 9 telemetry records (01:05-01:43) with temp/humidity
- Hours 2-12: 13 images with MGI scores, but ZERO telemetry records
- Result: Only 1 out of 16 snapshots had temperature/humidity data

## Root Cause

The snapshot function was querying:
```sql
WHERE captured_at BETWEEN wake_round_start AND wake_round_end
```

This only found data WITHIN each 1-hour window. Since devices don't transmit environmental telemetry every hour (it's bundled with images), most windows were empty.

## Solution: LOCF (Last Observation Carried Forward)

Environmental conditions don't change drastically minute-to-minute. The solution uses **Last Observation Carried Forward**:

1. **First, try to find data in the wake window** (original behavior)
2. **If not found, use the most recent value from ANY previous time**

This is scientifically sound because:
- Temperature and humidity change gradually
- Carrying forward recent values is more accurate than NULL
- MGI data still comes from actual wake windows (images)

## Implementation

### Updated Query Pattern
```sql
COALESCE(
  -- First try: telemetry in this wake window
  (SELECT temperature FROM device_telemetry
   WHERE device_id = d.device_id
   AND captured_at BETWEEN wake_start AND wake_end
   ORDER BY captured_at DESC LIMIT 1),

  -- LOCF: Most recent telemetry BEFORE this window
  (SELECT temperature FROM device_telemetry
   WHERE device_id = d.device_id
   AND captured_at < wake_end
   ORDER BY captured_at DESC LIMIT 1)
)
```

### Results

**Before Fix:**
- 1 snapshot with temp/humidity (out of 16)
- 1 snapshot with humidity
- 11 snapshots with MGI

**After Fix:**
- 15 snapshots with temp/humidity (all except Wake 1 which has no prior data)
- 15 snapshots with humidity
- 11 snapshots with MGI (unchanged - correct behavior)

### Example Output
```
Wake  1: temp=NULL, humidity=NULL, avg_mgi=NULL, max_mgi=NULL
Wake  2: temp=27.94, humidity=48.56, avg_mgi=0.24, max_mgi=0.45
Wake  3: temp=26.29, humidity=52.69, avg_mgi=0.34, max_mgi=0.34
Wake  4: temp=26.29, humidity=52.69, avg_mgi=0.35, max_mgi=0.35
...
Wake 12: temp=26.29, humidity=52.69, avg_mgi=0.55, max_mgi=0.55
```

## Files Modified

1. **generate_session_wake_snapshot function** - Updated with LOCF logic
2. **Backfill script** - Applied LOCF to existing snapshots with NULL values

## Migration SQL

The updated function has been created in:
- `fix-snapshot-aggregates-with-locf.sql`

To apply to your database, you can either:
1. Copy the CREATE OR REPLACE FUNCTION statement to your Supabase SQL editor
2. Or use the migration file system

## Understanding Your Device Communication Protocol

From analyzing the MQTT protocol and wake payloads:

- **Wake starts**: Device sends HELLO status message
- **Wake duration**: 30-60 seconds
- **Data transmitted**: Telemetry (temp, humidity, battery, wifi) + Image chunks
- **Wake ends**: Server sends SLEEP command with next_wake_time

**Key insight**: Environmental telemetry is bundled WITH images during device wakes. Devices don't send standalone environmental data between image transmissions.

Therefore:
- If a device wakes and sends an image → you get temperature/humidity
- If a device doesn't wake during an hour → no new telemetry
- LOCF ensures you still have environmental data for visualization

## Future Recommendations

1. **Consider using device_wake_payloads directly**: This table already has temperature/humidity denormalized and tracks actual wake sessions with precise timing

2. **Alternative: Event-based snapshots**: Instead of fixed 1-hour windows, create snapshots when devices actually wake (using wake_payload timestamps)

3. **Hourly windows are fine IF**: You accept LOCF for environmental data between wakes (which is what we implemented)

## Testing

Verified with Jan 4, 2026 session:
- Session ID: `4889eee2-6836-4f52-bbe4-9391e0930f88`
- Site ID: `4a21ccd9-56c5-48b2-90ca-c5fb756803d6`
- 16 snapshots total, now 15 have environmental data

## Questions Answered

**Q: Are wake windows intentionally only 5 minutes?**
A: Snapshots use 1-HOUR windows. The 5-minute window you mentioned is for device transmission timeout, not snapshot aggregation.

**Q: How frequently do devices transmit telemetry?**
A: Based on their wake_schedule_cron. Each device can have different schedules (hourly, every 3 hours, twice daily, etc.)

**Q: Should aggregates use data from wake window only, or wider timeframes?**
A: For MGI: Use wake window (actual images). For environmental: Use LOCF from wider timeframe (most recent value). This is now implemented.

**Q: Is wake_number incrementing every hour or more frequently?**
A: Wake_number increments each time ANY device wakes during the session. With multiple devices on different schedules, you can have multiple wake events per hour.

## Summary

The fix is **complete and working**. Your snapshot visualizations will now show environmental data consistently across all wakes by carrying forward the most recent measurements until new data arrives.
