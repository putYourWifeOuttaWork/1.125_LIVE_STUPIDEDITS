/*
  # Fix Mock Generator - Remove device_type Column

  1. Purpose
    - Fix fn_generate_mock_unmapped_device() to match actual devices table schema
    - Remove reference to non-existent device_type column
    - Add wifi_ssid which exists in actual schema

  2. Changes
    - Remove device_type from INSERT
    - Add wifi_ssid with realistic value
    - Update function to work with actual schema
*/

-- ==========================================
-- Fix Mock Data Generator: Unmapped Device
-- ==========================================

CREATE OR REPLACE FUNCTION fn_generate_mock_unmapped_device(
  p_device_name TEXT DEFAULT NULL,
  p_wake_schedule_cron TEXT DEFAULT '0 8,16 * * *'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_id UUID;
  v_device_code TEXT;
  v_device_mac TEXT;
  v_battery_voltage NUMERIC;
  v_battery_health INT;
  v_firmware_version TEXT;
  v_hardware_version TEXT;
  v_wifi_ssid TEXT;
  v_random_suffix INT;
BEGIN
  -- Generate random values
  v_random_suffix := floor(random() * 9999 + 1000)::INT;
  v_device_code := 'MOCK-DEV-' || v_random_suffix;
  v_device_mac := 'AA:BB:CC:' || to_hex(floor(random() * 255)::INT) || ':' || to_hex(floor(random() * 255)::INT) || ':' || to_hex(floor(random() * 255)::INT);
  v_battery_voltage := (random() * 0.5 + 3.7)::NUMERIC(4,2); -- 3.7 to 4.2V
  v_battery_health := floor(random() * 40 + 60)::INT; -- 60-100%
  v_firmware_version := 'v' || floor(random() * 3 + 1)::TEXT || '.' || floor(random() * 10)::TEXT || '.' || floor(random() * 20)::TEXT;
  v_hardware_version := CASE floor(random() * 3)::INT
    WHEN 0 THEN 'ESP32-S3'
    WHEN 1 THEN 'ESP32-CAM'
    ELSE 'ESP32-S3-CAM'
  END;
  v_wifi_ssid := 'TestNetwork-' || floor(random() * 100)::TEXT;

  -- Insert device
  INSERT INTO devices (
    device_code,
    device_name,
    device_mac,
    provisioning_status,
    wake_schedule_cron,
    battery_voltage,
    battery_health_percent,
    firmware_version,
    hardware_version,
    wifi_ssid,
    last_seen_at,
    is_active,
    created_at
  )
  VALUES (
    v_device_code,
    COALESCE(p_device_name, 'Mock Device ' || v_random_suffix),
    v_device_mac,
    'pending_mapping', -- Not assigned to site yet
    p_wake_schedule_cron,
    v_battery_voltage,
    v_battery_health,
    v_firmware_version,
    v_hardware_version,
    v_wifi_ssid,
    NOW() - (random() * interval '2 hours'),
    true,
    NOW()
  )
  RETURNING device_id INTO v_device_id;

  RAISE NOTICE 'Created mock unmapped device: % (%)', v_device_code, v_device_id;

  RETURN jsonb_build_object(
    'success', true,
    'device_id', v_device_id,
    'device_code', v_device_code,
    'device_name', COALESCE(p_device_name, 'Mock Device ' || v_random_suffix),
    'hardware_version', v_hardware_version,
    'message', 'Mock device created. Map it to a site in Device Registry.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_generate_mock_unmapped_device IS
'Creates a realistic mock device in pending_mapping status. Device must be manually mapped to a site before generating sessions. Fixed to match actual devices table schema.';
