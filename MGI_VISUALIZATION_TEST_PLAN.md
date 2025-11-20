# MGI Visualization & Testing Plan

## Current Setup Status

### ✅ What's Already Built

1. **Edge Function**: `score_mgi_image` - Fully implemented and ready
   - Calls Roboflow API with image URL
   - Parses MGI score (1-100%) and normalizes to 0.0-1.0
   - Updates `petri_observations` table with score

2. **Database Schema**: Complete
   - `petri_observations.mgi_score` (0.0-1.0)
   - `petri_observations.mgi_confidence` (0.0-1.0)
   - `petri_observations.mgi_scored_at` (timestamp)
   - Indexes for performance

3. **Database Functions**:
   - `fn_calculate_mgi_velocity()` - Track MGI change over time
   - `fn_get_zone_mgi_averages()` - Get average MGI by zone
   - `vw_mgi_trends` - Comprehensive view of MGI data

4. **Device-Site-Session Mapping**: Fully functional
   - Devices linked to sites with x/y positions
   - Sessions automatically created for device wakes
   - Images linked to observations via `device_images` table

5. **Map Visualization**: Partial
   - `SiteMapAnalyticsViewer` component supports temperature, humidity, battery zones
   - **NOT YET SUPPORTING MGI** - needs to be added

### ❌ What Needs to be Built

1. **Add MGI to Device Data Model** - DevicePosition interface needs `mgi_score`
2. **Add MGI Zone Mode** - Extend `ZoneMode` type to include 'mgi'
3. **Query MGI Data** - HomePage needs to fetch latest MGI scores for devices
4. **Color Scale for MGI** - Use green→yellow→red gradient (0.0 = good, 1.0 = bad)

---

## Testing Approach

### Phase 1: Manual Image Upload & Scoring Test

**Goal**: Verify Roboflow integration with a real petri dish image

**Steps**:

1. **Get a Real Petri Dish Image**
   - Use publicly accessible image URL (required for Roboflow)
   - Example: Upload to Supabase Storage and make it public
   - Or use an existing public petri dish image

2. **Create Test Device & Observation**
   ```sql
   -- Create a test observation
   INSERT INTO petri_observations (
     submission_id,
     slot_index,
     captured_at,
     image_path
   ) VALUES (
     (SELECT submission_id FROM submissions WHERE device_id = 'your-device-id' LIMIT 1),
     0,
     NOW(),
     'test-petri-image.jpg'
   ) RETURNING observation_id;
   ```

3. **Create device_images Record**
   ```sql
   INSERT INTO device_images (
     device_id,
     observation_id,
     image_url,
     chunk_index,
     total_chunks,
     status
   ) VALUES (
     'your-device-id',
     'observation-id-from-above',
     'https://public-image-url.jpg',
     0,
     1,
     'complete'
   ) RETURNING image_id;
   ```

4. **Call Edge Function**
   ```bash
   node test/test_mgi_scoring.mjs \
     "image-id-from-above" \
     "https://public-image-url.jpg"
   ```

5. **Verify MGI Score**
   ```sql
   SELECT
     observation_id,
     mgi_score,
     mgi_confidence,
     mgi_scored_at
   FROM petri_observations
   WHERE observation_id = 'observation-id';
   ```

### Phase 2: Add MGI to Map Visualization

**Goal**: Show MGI scores as colored zones on the site map

**Implementation Steps**:

1. **Update DevicePosition Interface** - Add `mgi_score` field
2. **Extend HomePage Query** - Fetch latest MGI score for each device
3. **Add MGI Zone Mode** - Update `ZoneMode` type and color scales
4. **Test with Mock Data** - Generate test MGI scores for devices

### Phase 3: End-to-End Device Flow Test

**Goal**: Test complete flow from device → image → MGI → visualization

**Requirements**:
- Device with position on site map
- Device wake session
- Image submission from device
- Automatic MGI scoring
- Map updates with MGI zones

---

## Implementation: Add MGI to Map Visualization

### Step 1: Update Type Definitions

```typescript
// In SiteMapAnalyticsViewer.tsx
interface DevicePosition {
  device_id: string;
  device_code: string;
  device_name: string;
  x: number;
  y: number;
  battery_level: number | null;
  status: string;
  last_seen: string | null;
  temperature: number | null;
  humidity: number | null;
  mgi_score: number | null;  // ADD THIS
}

type ZoneMode = 'none' | 'temperature' | 'humidity' | 'battery' | 'mgi';  // ADD 'mgi'
```

### Step 2: Update HomePage Data Fetching

```typescript
// In HomePage.tsx - loadSiteDevices function
const { data: telemetryData } = await supabase
  .from('device_telemetry')
  .select('temperature, humidity')
  .eq('device_id', device.device_id)
  .order('captured_at', { ascending: false })
  .limit(1)
  .maybeSingle();

// ADD THIS: Get latest MGI score
const { data: mgiData } = await supabase
  .from('petri_observations')
  .select('mgi_score')
  .eq('device_id', device.device_id)  // Need to add device_id to petri_observations!
  .not('mgi_score', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(1)
  .maybeSingle();

return {
  device_id: device.device_id,
  device_code: device.device_code,
  device_name: device.device_name,
  x: device.x_position,
  y: device.y_position,
  battery_level: device.battery_health_percent,
  status: device.is_active ? 'active' : 'inactive',
  last_seen: device.last_seen_at,
  temperature: telemetryData?.temperature || null,
  humidity: telemetryData?.humidity || null,
  mgi_score: mgiData?.mgi_score || null,  // ADD THIS
};
```

### Step 3: Add MGI Color Scale in SiteMapAnalyticsViewer

```typescript
// In drawVoronoiZones function
const getColorScale = (mode: ZoneMode) => {
  switch (mode) {
    case 'temperature':
      return scaleSequential(interpolateRdYlBu).domain([100, 60]); // Hot to cold
    case 'humidity':
      return scaleSequential(interpolateYlGnBu).domain([40, 100]); // Dry to wet
    case 'battery':
      return scaleSequential(interpolateRdYlBu).domain([20, 100]); // Low to high
    case 'mgi':
      // Green (good/low) to Red (bad/high)
      return scaleSequential(interpolateRdYlGn).domain([1.0, 0.0]); // Reverse: 0=green, 1=red
    default:
      return null;
  }
};
```

### Step 4: Update Dropdown Options

```typescript
<select
  value={zoneMode}
  onChange={(e) => setZoneMode(e.target.value as ZoneMode)}
  className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
>
  <option value="none">None</option>
  <option value="temperature">Temperature</option>
  <option value="humidity">Humidity</option>
  <option value="battery">Battery</option>
  <option value="mgi">Mold Growth (MGI)</option>  {/* ADD THIS */}
</select>
```

---

## Database Schema Note

**IMPORTANT**: We need to add `device_id` to `petri_observations` for efficient querying.

```sql
ALTER TABLE petri_observations
ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(device_id);

-- Backfill device_id from submissions
UPDATE petri_observations po
SET device_id = s.device_id
FROM submissions s
WHERE po.submission_id = s.submission_id
AND po.device_id IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_mgi
ON petri_observations(device_id, captured_at DESC)
WHERE mgi_score IS NOT NULL;
```

---

## Testing with Real Petri Dish Images

### Option 1: Use Public Test Image

You can use this public petri dish image for testing:
- **URL**: `https://images.unsplash.com/photo-1582719508461-905c673771fd` (generic lab/petri example)
- Or upload your own to Supabase Storage and make it public

### Option 2: Upload to Supabase Storage

```bash
# Upload image to Supabase Storage bucket
# Then get public URL
```

### Test Command

```bash
# Create observation and image record first (see Phase 1 above)
# Then run:
node test/test_mgi_scoring.mjs \
  "your-image-id" \
  "https://your-public-image-url.jpg"
```

---

## Next Steps Checklist

- [ ] Add `device_id` column to `petri_observations`
- [ ] Backfill existing observations with device_id
- [ ] Update `DevicePosition` interface to include `mgi_score`
- [ ] Update HomePage to fetch MGI data
- [ ] Add 'mgi' to `ZoneMode` type
- [ ] Add MGI color scale to map viewer
- [ ] Add "Mold Growth (MGI)" dropdown option
- [ ] Test with real petri dish image
- [ ] Verify map shows MGI zones correctly

---

## Expected Behavior

**When Complete:**
1. Devices on map show their latest MGI score
2. Dropdown has "Mold Growth (MGI)" option
3. Selecting MGI shows color zones:
   - **Green zones**: Low mold growth (MGI 0.0-0.3)
   - **Yellow zones**: Moderate growth (MGI 0.3-0.7)
   - **Red zones**: High growth (MGI 0.7-1.0)
4. Clicking device shows MGI score in detail view
5. Map updates in real-time as new images are scored

---

## Questions Answered

✅ **Do we have correct setup?**
- YES for Roboflow integration
- NO for map visualization (needs MGI support)

✅ **Can we test with real petri dish image?**
- YES - Use test script with any public image URL
- Edge function is ready to call Roboflow

✅ **Is device/site/snapshot mapping preserved?**
- YES - All relationships intact
- device_images → petri_observations → submissions → devices → sites

✅ **How does Roboflow come through?**
- Trigger fires when `device_images.status = 'complete'`
- Edge function calls Roboflow API
- Response parsed and stored in `petri_observations.mgi_score`
- Normalized to 0.0-1.0 scale

