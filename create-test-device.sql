-- Register a test IoT device for "Test Site for IoT Device"
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

DO $$
DECLARE
  v_site_id UUID;
  v_program_id UUID;
  v_device_mac TEXT;
  v_device_id UUID;
BEGIN
  -- Find the test site
  SELECT site_id, program_id INTO v_site_id, v_program_id
  FROM sites
  WHERE name = 'Test Site for IoT Device'
  LIMIT 1;
  
  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Site "Test Site for IoT Device" not found';
  END IF;
  
  -- Generate a unique MAC address
  v_device_mac := 'AA:BB:CC:DD:EE:' || LPAD(FLOOR(RANDOM() * 100)::TEXT, 2, '0');
  
  -- Insert the device
  INSERT INTO devices (
    device_mac,
    device_name,
    site_id,
    program_id,
    hardware_version,
    is_active,
    last_seen_at,
    provisioned_at
  ) VALUES (
    v_device_mac,
    'ESP32-CAM-001',
    v_site_id,
    v_program_id,
    'ESP32-S3',
    true,
    now(),
    now()
  )
  RETURNING device_id INTO v_device_id;
  
  -- Show the result
  RAISE NOTICE '✓ Device registered successfully!';
  RAISE NOTICE 'Device ID: %', v_device_id;
  RAISE NOTICE 'Device MAC: %', v_device_mac;
  RAISE NOTICE 'Site ID: %', v_site_id;
  RAISE NOTICE '';
  RAISE NOTICE 'SAVE THIS MAC ADDRESS: %', v_device_mac;
  
END $$;

-- Verify the device was created
SELECT 
  device_id,
  device_mac,
  device_name,
  site_id,
  program_id,
  is_active,
  created_at
FROM devices
WHERE site_id IN (
  SELECT site_id FROM sites WHERE name = 'Test Site for IoT Device'
)
ORDER BY created_at DESC
LIMIT 1;
