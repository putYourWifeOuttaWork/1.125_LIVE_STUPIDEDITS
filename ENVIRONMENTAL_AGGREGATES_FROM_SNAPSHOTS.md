# ✅ Environmental & MGI Aggregates - Now Using Snapshots

## Summary
The environmental and MGI aggregate panels now calculate from **snapshot data** instead of waiting for new wake payloads.

---

## The Problem

Previously, the aggregates were calculated from `device.wake_payloads`:
- Shows "0 samples" on first load
- Only updates when NEW wakes come in during the session
- Doesn't reflect the actual current state of devices on the map

```typescript
// OLD - waiting for new data
devices.forEach(device => {
  device.wake_payloads?.forEach((wake: any) => {
    if (wake.temperature != null) allTemps.push(wake.temperature);
    // ...
  });
});
```

---

## The Solution

Now aggregates are calculated from `allSiteSnapshots`:
- Uses the same data source as the map visualization
- Shows data immediately on page load
- Updates automatically as new snapshots are generated
- Reflects the TRUE current state of all devices

```typescript
// NEW - using snapshot data
allSiteSnapshots.forEach(snapshot => {
  snapshot.site_state?.devices?.forEach((device) => {
    if (device.temperature != null) allTemps.push(device.temperature);
    if (device.humidity != null) allHumidity.push(device.humidity);
    if (device.battery_voltage != null) {
      const batteryPercent = Math.max(0, Math.min(100,
        ((device.battery_voltage - 3.0) / 1.2) * 100
      ));
      allBattery.push(batteryPercent);
    }
    if (device.mgi_score != null) allMGI.push(device.mgi_score);
  });
});
```

---

## Data Sources

### Snapshot Structure
Each `SessionWakeSnapshot` contains:
```typescript
{
  snapshot_id: string,
  session_id: string,
  wake_number: number,
  wake_time: string,
  site_state: {
    devices: [
      {
        device_id: string,
        device_name: string,
        x_position: number,
        y_position: number,
        temperature: number | null,      // ← Used for temp aggregates
        humidity: number | null,          // ← Used for humidity aggregates
        battery_voltage: number | null,   // ← Converted to % for battery aggregates
        mgi_score: number | null,         // ← Used for MGI aggregates
        mgi_velocity: number | null,
        status: string,
        // ... other fields
      }
    ],
    session_summary: {
      avg_mgi: number | null,
      avg_temperature: number | null,
      avg_humidity: number | null,
      // ... other summary stats
    }
  }
}
```

### Battery Conversion
Battery voltage is converted to percentage:
- **3.0V = 0%** (minimum)
- **4.2V = 100%** (maximum)
- Formula: `((voltage - 3.0) / 1.2) * 100`

---

## What Now Works

### Environmental Aggregates Panel
Shows real-time data from snapshots:

**Temperature:**
- Avg, Max, Min
- Number of samples
- All in °F

**Humidity:**
- Avg, Max, Min
- Number of samples
- All in %

**Battery Health:**
- Avg, Max, Min
- Number of samples
- All in %

### MGI Aggregates Panel
Shows real-time MGI data:

**Average MGI Score:**
- Large display of average
- Number of samples

**Maximum MGI:**
- Highest score observed
- With trend indicator

**Minimum MGI:**
- Lowest score observed
- With trend indicator

---

## Expected Behavior

1. **On Page Load:**
   - Aggregates populate immediately (if snapshots exist)
   - Shows actual device readings from last snapshot
   - Matches what you see on the map

2. **As Session Progresses:**
   - Updates automatically when new snapshots are generated
   - Aggregates reflect ALL snapshots, not just latest
   - Sample count increases with each snapshot

3. **With No Snapshots:**
   - Shows "N/A" or empty state
   - No errors or crashes
   - Gracefully handles missing data

---

## Technical Changes

**File:** `src/pages/SiteDeviceSessionDetailPage.tsx`

**Changed:**
- Line 457-516: `environmentalAggregates` calculation
- Now uses `allSiteSnapshots` instead of `devices.wake_payloads`
- Dependency changed from `[devices]` to `[allSiteSnapshots]`

**Benefits:**
- ✅ Data available immediately
- ✅ Matches map visualization
- ✅ Reflects true device state
- ✅ Updates automatically with snapshots
- ✅ More accurate aggregates across all snapshots

---

## Testing

To verify the fix:

1. Navigate to a device session detail page
2. Environmental Aggregates should show data immediately:
   - Temperature: Numbers for Avg/Max/Min
   - Humidity: Numbers for Avg/Max/Min
   - Battery: Numbers for Avg/Max/Min
   - Sample counts should be > 0
3. MGI Aggregates should show:
   - Average MGI score
   - Maximum and Minimum values
   - Sample count

If you see "0 samples" or all "N/A", check:
- Are there snapshots for this site? (Check `session_wake_snapshots` table)
- Do devices have position data? (Snapshots only include positioned devices)
- Are devices assigned to the site?

🎉 **Aggregates now show live data from snapshots!**
