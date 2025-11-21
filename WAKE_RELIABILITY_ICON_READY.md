# Wake Reliability Icon - Complete Solution ✅

## Problem

The wake reliability/connectivity indicator wasn't working because there was no calculation of:
- Last N expected wake times based on device's cron schedule
- Actual wakes received vs expected
- Reliability percentage and status

## Solution Created

### Database Function: `fn_calculate_wake_reliability`

**File**: `fix-wake-reliability-calculation.sql`

Calculates wake reliability for any device:

```sql
SELECT fn_calculate_wake_reliability(
  'device-uuid-here',  -- device_id
  3,                   -- last 3 expected wakes (default)
  'America/New_York'   -- timezone (optional, defaults to site timezone)
);
```

**Returns**:
```json
{
  "status": "excellent",           // excellent | good | poor | offline | unknown
  "color": "#10B981",             // CSS color for indicator
  "trailing_wakes_expected": 3,
  "trailing_wakes_actual": 3,
  "reliability_percent": 100.0,
  "last_expected_wakes": ["2025-11-21T18:00:00Z", "2025-11-21T15:00:00Z", "2025-11-21T12:00:00Z"]
}
```

### Status Levels

- **Excellent** (90-100%): Green (#10B981) - Full WiFi bars
- **Good** (66-89%): Blue (#3B82F6) - 2/3 WiFi bars
- **Poor** (33-65%): Orange (#F59E0B) - 1/3 WiFi bars
- **Offline** (<33%): Red (#EF4444) - WiFi-Off icon
- **Unknown**: Gray (#9CA3AF) - No schedule configured

### How It Works

1. **Gets device's cron schedule** (e.g., `0 */3 * * *` = every 3 hours)
2. **Calculates last N expected wake times** working backwards from now
3. **Checks for actual wakes** within ±1 hour tolerance of each expected time
4. **Calculates reliability** = (actual / expected) × 100%
5. **Assigns status and color** based on percentage

## Deployment Steps

### Step 1: Apply SQL Migration

Open Supabase SQL Editor and run the entire contents of:
```
fix-wake-reliability-calculation.sql
```

This creates:
- `fn_get_cron_wake_hours()` - Helper to parse cron schedules
- `fn_calculate_wake_reliability()` - Main calculation function

### Step 2: Test the Function

```sql
-- Test with your device
SELECT fn_calculate_wake_reliability('15207d5d-1c32-4559-a3e8-216cee867527');

-- Should return something like:
-- {
--   "status": "good",
--   "color": "#3B82F6",
--   "trailing_wakes_expected": 3,
--   "trailing_wakes_actual": 2,
--   "reliability_percent": 66.7
-- }
```

### Step 3: Update Frontend (Next Step)

The frontend needs to be updated to call this function when fetching device data. Options:

**Option A**: Add RPC call in snapshot generation
```typescript
// When building snapshot device data
const { data: connectivity } = await supabase.rpc(
  'fn_calculate_wake_reliability',
  { p_device_id: device.device_id }
);
device.connectivity = connectivity;
```

**Option B**: Create a view that includes connectivity
```sql
CREATE VIEW devices_with_connectivity AS
SELECT
  d.*,
  fn_calculate_wake_reliability(d.device_id) as connectivity
FROM devices d;
```

**Option C**: Calculate on-demand in frontend hook
```typescript
const calculateConnectivity = async (deviceId: string) => {
  const { data } = await supabase.rpc('fn_calculate_wake_reliability', {
    p_device_id: deviceId
  });
  return data;
};
```

## Testing

After applying the SQL migration, test with:

```bash
node << 'EOF'
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const deviceId = '15207d5d-1c32-4559-a3e8-216cee867527';

const { data, error } = await supabase.rpc('fn_calculate_wake_reliability', {
  p_device_id: deviceId,
  p_lookback_wakes: 3
});

console.log('Wake Reliability:', data);
EOF
```

Expected output:
```
Wake Reliability: {
  status: 'good',
  color: '#3B82F6',
  trailing_wakes_expected: 3,
  trailing_wakes_actual: 2,
  reliability_percent: 66.7,
  last_expected_wakes: [...]
}
```

## UI Integration

The `DeviceConnectivityIndicator` component is already built and ready:

```tsx
<DeviceConnectivityIndicator
  connectivity={{
    status: 'excellent',
    color: '#10B981',
    trailing_wakes_expected: 3,
    trailing_wakes_actual: 3,
    reliability_percent: 100
  }}
  size="small"
  showTooltip={true}
/>
```

It just needs the `connectivity` data from this new function!

## Visual Appearance

The icon appears above each device on the site map:

- **WiFi icon** with colored bars (1-3 bars based on reliability)
- **WifiOff icon** for poor/offline devices
- **Small colored dot** in bottom-right corner
- **Tooltip** showing: "Wake Reliability: 2/3 (67%) - Last 3 expected wakes"

## Status

✅ **SQL function created and ready**
⏳ **Needs deployment to database**
⏳ **Needs frontend integration**

---

**Priority**: High (user-visible feature)
**Complexity**: Low (function ready, just needs deployment + wiring)
**Files**:
- `fix-wake-reliability-calculation.sql` (ready to apply)
- `DeviceConnectivityIndicator.tsx` (already exists)
