# Apply Mock Data Generators Migration

## Migration File
`supabase/migrations/20251111130000_fix_enum_errors_and_mock_generators.sql`

## What It Does
1. Fixes enum errors preventing session creation (airflow_enum)
2. Adds 5 mock data generator functions for testing
3. Enables realistic device/session/wake generation without physical devices

## To Apply

### Option 1: Via Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Copy the entire contents of the migration file
3. Paste and run

### Option 2: Via Supabase CLI (if installed)
```bash
npx supabase db push
```

### Option 3: Via Database Client
Connect to your database and execute the SQL file directly.

## Functions Created

1. **fn_generate_mock_unmapped_device(device_name, wake_schedule_cron)**
   - Creates a realistic mock device in 'pending_mapping' status
   - Device must be manually mapped to a site before generating sessions
   - Returns: device_id, device_code, device_name

2. **fn_generate_mock_session_for_device(device_id, session_date, auto_generate_wakes)**
   - Creates site_device_session for the device's mapped site
   - Automatically creates device_submission shell
   - Optionally auto-generates wake payloads
   - Returns: session_id, submission_id, expected_wake_count

3. **fn_generate_mock_wake_payload(session_id, device_id, status, include_image)**
   - Generates realistic wake event with telemetry data
   - Status options: 'complete', 'pending', 'failed'
   - Includes temperature, humidity, battery, WiFi RSSI
   - Optionally includes mock image
   - Returns: payload_id, image_id, wake_index

4. **fn_generate_mock_image(payload_id, status)**
   - Creates mock device image with transmission data
   - Uses real Unsplash images
   - Simulates chunk transmission (complete/partial/failed)
   - Returns: image_id, image_url, chunks_received

5. **fn_cleanup_mock_device_data(device_id, delete_device)**
   - Removes all mock data for a device
   - Optionally deletes the device itself
   - Returns: deleted counts

## Testing Flow

1. Generate unmapped device:
```sql
SELECT fn_generate_mock_unmapped_device('My Test Device', '0 */3 * * *');
```

2. Map device to site in Device Registry UI

3. Generate session with auto wakes:
```sql
SELECT fn_generate_mock_session_for_device(
  '<device_id>'::UUID,
  CURRENT_DATE,
  true  -- auto-generate wakes
);
```

4. Or manually add wakes:
```sql
SELECT fn_generate_mock_wake_payload(
  '<session_id>'::UUID,
  '<device_id>'::UUID,
  'complete',
  true  -- include image
);
```

5. Clean up when done:
```sql
SELECT fn_cleanup_mock_device_data('<device_id>'::UUID, true);
```

## UI Integration

Once applied, these functions will be callable from:
- Home Page "Testing Tools" dropdown
- Device Registry "Generate Mock Device" button
- Device Detail Page "Generate Session" button
- Device Submission Detail "Add Wake Payload" button

All UI controls will be styled with warning colors and "TEST MODE" badges for easy identification.
