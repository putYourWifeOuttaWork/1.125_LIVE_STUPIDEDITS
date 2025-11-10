# Lab UI Testing Guide

This guide explains how to use the Lab UI for testing device sessions and data flows.

## Lab Pages

### 1. Site Sessions (`/lab/sessions`)

View device sessions and wake events for a specific site over a date range.

**Features:**
- Date range selector to view multiple days of data
- Session summary cards showing:
  - Expected vs actual wake counts
  - Images received vs expected
  - Failed events
  - Active device count
- Device wake grid showing:
  - Device name and MAC address
  - Wake timestamps
  - Battery voltage and signal strength
  - Image status (pending/receiving/complete/failed)
  - Click any row to view image details

**Use Cases:**
- Monitor daily device activity
- Debug missing wake events
- Track image transfer success rates
- Check battery health trends
- Verify session completion

### 2. Ingest Feed (`/lab/ingest`)

Real-time feed of all device ingestion events.

**Event Types:**
- **Payloads** (Green) - Device wake-up events
- **Images** (Blue) - Image chunk transfers
- **Observations** (Purple) - Images linked to observations

**Use Cases:**
- Watch live device activity
- Debug data flow issues
- Monitor image transfer progress
- Verify observation creation

## Generating Mock Data

To populate the Lab UI with test data, run:

```bash
node generate-mock-lab-data.mjs
```

**What it creates:**
- Test site (if none exists)
- 3 test devices
- 7 days of sessions (today back to 6 days ago)
- 12 wake events per day per site
- 3-5 wakes per device per day
- Device images with realistic statuses:
  - 60% complete
  - 20% in progress (receiving)
  - 20% failed or pending
- Battery and telemetry data

**Script Requirements:**
- You must be logged in (have valid auth session)
- Your user must belong to a company
- Your company must have at least one pilot program

## Testing Workflow

### Initial Setup

1. **Create Test Data**
   ```bash
   node generate-mock-lab-data.mjs
   ```

2. **Navigate to Lab UI**
   - Go to "Lab" in main navigation
   - Choose "Site Sessions"

3. **Select Your Test Site**
   - Use the site dropdown
   - Select date range (last 7 days will have data)

### Testing Scenarios

#### Scenario 1: View Multi-Day Sessions
1. Select your test site
2. Set date range to last 7 days
3. Observe multiple session cards
4. Verify wake counts and image stats

#### Scenario 2: Inspect Device Activity
1. In the device wake grid, note different devices
2. Check battery voltages (should vary)
3. Look for failed image transfers
4. Click on a row to open image details

#### Scenario 3: Monitor Real-Time Activity
1. Go to "Ingest Feed"
2. Keep the page open
3. In another terminal, run the mock data script again
4. Watch events appear in real-time

#### Scenario 4: Test Image Status Flow
1. In Site Sessions, look for images with "receiving" status
2. Note the chunk progress (e.g., 45/100)
3. These represent in-progress transfers

#### Scenario 5: Verify Data Integrity
1. Check that session expected_wake_count matches reality
2. Verify image_count correlates with visible images
3. Confirm timezone displays correctly

## Mock Data Customization

Edit `generate-mock-lab-data.mjs` to customize:

```javascript
// Number of days to generate
const daysToGenerate = 7;

// Expected wakes per session
const expectedWakes = 12;

// Wakes per device per day
const wakesForDevice = randomInt(3, 5);

// Image success rate (80% have images)
const hasImage = Math.random() > 0.2;

// Image status distribution
const imageStatus = randomChoice([
  'complete', 'complete', 'complete', // 60% complete
  'receiving', // 20% receiving
  'failed' // 20% failed
]);
```

## Troubleshooting

**No sessions appear:**
- Verify you selected the correct date range
- Check that mock data script ran successfully
- Ensure you're viewing the correct site

**No real-time updates:**
- Check browser console for errors
- Verify Supabase connection
- Realtime is throttled to 250ms to prevent overload

**Date/Time looks wrong:**
- Site timezone is shown in the UI
- All times are converted to site's local timezone
- Check site.timezone field in database

**Images not loading:**
- Mock data creates image records without actual files
- Image URLs will be null for mock data
- This is expected behavior for testing

## Advanced Testing

### Test Specific Device Scenarios

Create custom device data:

```javascript
// In a node script
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

// Create a low-battery device
await supabase.from('devices').insert({
  device_mac: 'AA:BB:CC:DD:EE:99',
  device_name: 'Low Battery Device',
  site_id: 'your-site-id',
  battery_voltage: 3.2, // Low!
  battery_health_percent: 15
});
```

### Simulate Edge Cases

```javascript
// Create a session with all failed wakes
await supabase.from('device_wake_payloads').insert({
  // ... standard fields
  payload_status: 'failed',
  image_id: null
});

// Create an image stuck at 50%
await supabase.from('device_images').insert({
  // ... standard fields
  total_chunks: 100,
  received_chunks: 50,
  status: 'receiving'
});
```

## Next Steps

Once you're comfortable with the Lab UI:

1. Connect real IoT devices
2. Monitor actual device sessions
3. Use the data to debug issues
4. Build reports and analytics
5. Set up alerts for failed transfers

## Reference

- **Sessions Table:** `site_device_sessions`
- **Payloads Table:** `device_wake_payloads`
- **Images Table:** `device_images`
- **Views:**
  - `vw_site_day_sessions` - Session summaries
  - `vw_session_payloads` - Payload details
  - `vw_ingest_live` - Real-time feed
