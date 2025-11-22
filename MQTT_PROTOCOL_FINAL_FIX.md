# MQTT Protocol - Final Time Format Fix

## Issues Fixed

### Issue 1: Missing Minutes in Time Format ❌
**Problem:** Function was omitting `:00` when minutes were zero
- Sent: `"12PM"`
- Should be: `"12:00PM"`

**Fix:** Always include minutes with leading zeros

### Issue 2: Using Local Time Instead of UTC ❌
**Problem:** Using `getHours()` and `getMinutes()` which return LOCAL time
- Server in ET (UTC-5) would convert times incorrectly
- Device expects UTC time per BrainlyTree protocol

**Fix:** Use `getUTCHours()` and `getUTCMinutes()` for UTC time

## Correct Implementation

### Time Formatting Function (Both Files)
```javascript
function formatTimeForDevice(isoTimestamp) {
  const date = new Date(isoTimestamp);

  // Use UTC methods to get UTC time (NOT local time)
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // Convert to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12

  // ALWAYS include minutes with leading zero
  const minuteStr = `:${minutes.toString().padStart(2, '0')}`;

  return `${hours}${minuteStr}${ampm}`;
}
```

## Examples

### UTC Time Formatting
```
"2025-11-22T12:00:00.000Z" -> "12:00PM" ✅
"2025-11-22T00:00:00.000Z" -> "12:00AM" ✅
"2025-11-22T20:00:00.000Z" -> "8:00PM"  ✅
"2025-11-22T08:30:00.000Z" -> "8:30AM"  ✅
"2025-11-22T17:00:00.000Z" -> "5:00PM"  ✅ (This is 12pm ET)
```

### ET to UTC Conversion Examples
When user in ET timezone changes schedule:
- **User sees:** "12:00 PM" (noon ET)
- **Database stores:** `"2025-11-22T17:00:00.000Z"` (UTC)
- **Device receives:** `"5:00PM"` (UTC)
- **Device calculates:** Sleep until 5:00 PM UTC = 12:00 PM ET ✅

- **User sees:** "8:00 PM" (evening ET)
- **Database stores:** `"2025-11-23T01:00:00.000Z"` (UTC, next day)
- **Device receives:** `"1:00AM"` (UTC)
- **Device calculates:** Sleep until 1:00 AM UTC = 8:00 PM ET ✅

## Protocol Message Format

**Correct format per BrainlyTree PDF (page 5):**
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "next_wake": "12:00PM"
}
```

**Rules:**
1. Only two fields: `device_id` and `next_wake`
2. Time format: `H:MMAM/PM` (12-hour format with leading zero for minutes)
3. Time is in **UTC** (not local time)
4. No cron expressions
5. No ISO timestamps
6. No extra fields

## Files Modified

### 1. `/mqtt-service/index.js`
- Fixed `formatTimeForDevice()` function
- Uses `getUTCHours()` and `getUTCMinutes()`
- Always includes minutes with `:00` format

### 2. `/mqtt-service/commandQueueProcessor.js`
- Fixed `formatTimeForDevice()` method
- Uses `getUTCHours()` and `getUTCMinutes()`
- Always includes minutes with `:00` format

## Testing

### Manual Test
```bash
node -e "
function formatTimeForDevice(isoTimestamp) {
  const date = new Date(isoTimestamp);
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minuteStr = ':' + minutes.toString().padStart(2, '0');
  return hours + minuteStr + ampm;
}

console.log('12:00 UTC:', formatTimeForDevice('2025-11-22T12:00:00Z'));
console.log('20:00 UTC:', formatTimeForDevice('2025-11-22T20:00:00Z'));
console.log('00:00 UTC:', formatTimeForDevice('2025-11-22T00:00:00Z'));
"
```

**Expected Output:**
```
12:00 UTC: 12:00PM ✅
20:00 UTC: 8:00PM  ✅
00:00 UTC: 12:00AM ✅
```

## Deployment

### Restart MQTT Service
```bash
cd /home/project/mqtt-service
pm2 restart mqtt-service

# Verify
pm2 logs mqtt-service --lines 20
```

### Test Device Command
1. Edit device 98A316F6FE18 wake schedule to "Every 1 hour"
2. Check MQTT logs for message:
   ```
   [CommandQueue] Converting wake time: 2025-11-22T17:00:00.000Z -> 5:00PM
   [CommandQueue] ✅ Sent set_wake_schedule to 98A316F6FE18
   ```
3. Verify device receives:
   ```json
   {"device_id":"98:A3:16:F6:FE:18","next_wake":"5:00PM"}
   ```

## Summary

✅ **Time format:** Always includes `:00` for zero minutes
✅ **UTC time:** Uses UTC methods, not local time
✅ **Protocol compliant:** Matches BrainlyTree spec exactly
✅ **Timezone aware:** Correctly handles ET to UTC conversion
✅ **Database:** Stores ISO timestamps in UTC
✅ **Device:** Receives simple time format in UTC

## Key Takeaways

1. **Database** stores ISO 8601 UTC timestamps: `"2025-11-22T17:00:00.000Z"`
2. **MQTT service** converts to simple UTC time: `"5:00PM"`
3. **Device** receives UTC time and calculates local sleep duration
4. **User** sees times in their local timezone (ET), but device works in UTC

This ensures the device wakes at the correct absolute time regardless of timezone.
