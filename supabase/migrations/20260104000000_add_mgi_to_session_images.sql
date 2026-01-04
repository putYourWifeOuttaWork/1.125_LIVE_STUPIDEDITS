/*
  # Add MGI Score Fields and Environmental Data to Session Images

  1. Problem
    - The "Images & MGI Scores" tab shows "0 Images with MGI Scores"
    - Device images are being fetched but without MGI fields and environmental data
    - Frontend checks for img.mgi_score != null but the field is missing from the query

  2. Solution
    - Add mgi_score, mold_growth_velocity, mold_growth_speed to images subquery
    - Add temperature, humidity, battery_voltage from wake_payloads for environmental context
    - These fields exist in tables but weren't being selected together

  3. Impact
    - Images tab will now correctly show count of images with MGI scores
    - Individual device sections will show accurate "X with MGI" counts
    - MGI data (score, velocity, speed) will be available for display in image cards
    - Environmental data (temp, humidity, battery) will enrich image metadata
*/

-- Update the function to include MGI fields in images
CREATE OR REPLACE FUNCTION get_session_devices_with_wakes(p_session_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_record RECORD;
  v_devices_json JSONB;
  v_device_record RECORD;
  v_device_array JSONB := '[]'::jsonb;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get session details
  SELECT
    sds.session_id,
    sds.site_id,
    sds.session_date,
    sds.session_start_time,
    sds.session_end_time,
    sds.company_id
  INTO v_session_record
  FROM site_device_sessions sds
  WHERE sds.session_id = p_session_id;

  IF v_session_record.session_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Check user has access to this company
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND (u.company_id = v_session_record.company_id OR u.is_super_admin = TRUE)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get all devices that were assigned to this site on this session date
  FOR v_device_record IN
    SELECT
      d.device_id,
      d.device_code,
      d.device_name,
      d.hardware_version,
      d.firmware_version,
      d.wake_schedule_cron,
      d.battery_voltage,
      d.battery_health_percent,
      d.wifi_ssid,
      d.last_seen_at,
      d.x_position,
      d.y_position,
      dsa.assigned_at,
      dsa.is_primary,

      -- Calculate expected wakes for this device
      fn_calculate_device_expected_wakes(
        d.wake_schedule_cron,
        dsa.assigned_at,
        v_session_record.session_start_time,
        v_session_record.session_end_time
      ) as expected_wakes_in_session,

      -- Count actual wakes
      (
        SELECT COUNT(*)::INT
        FROM device_wake_payloads dwp
        WHERE dwp.device_id = d.device_id
        AND dwp.site_device_session_id = p_session_id
      ) as actual_wakes,

      -- Exclude overage payloads from completed count
      (
        SELECT COUNT(*)::INT
        FROM device_wake_payloads dwp
        WHERE dwp.device_id = d.device_id
        AND dwp.site_device_session_id = p_session_id
        AND dwp.payload_status = 'complete'
        AND dwp.overage_flag = FALSE
      ) as completed_wakes,

      (
        SELECT COUNT(*)::INT
        FROM device_wake_payloads dwp
        WHERE dwp.device_id = d.device_id
        AND dwp.site_device_session_id = p_session_id
        AND dwp.payload_status = 'failed'
      ) as failed_wakes,

      (
        SELECT COUNT(*)::INT
        FROM device_wake_payloads dwp
        WHERE dwp.device_id = d.device_id
        AND dwp.site_device_session_id = p_session_id
        AND dwp.overage_flag = TRUE
      ) as extra_wakes,

      -- Get wake payloads as JSON array
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'payload_id', dwp.payload_id,
            'wake_window_index', dwp.wake_window_index,
            'captured_at', dwp.captured_at,
            'payload_status', dwp.payload_status,
            'temperature', dwp.temperature,
            'humidity', dwp.humidity,
            'battery_voltage', dwp.battery_voltage,
            'wifi_rssi', dwp.wifi_rssi,
            'image_id', dwp.image_id,
            'overage_flag', dwp.overage_flag,
            'resent_received_at', dwp.resent_received_at
          ) ORDER BY dwp.captured_at
        ), '[]'::jsonb)
        FROM device_wake_payloads dwp
        WHERE dwp.device_id = d.device_id
        AND dwp.site_device_session_id = p_session_id
      ) as wake_payloads,

      -- Get images as JSON array - FIXED: Now includes all MGI fields and environmental data
      -- Uses DISTINCT ON to prevent duplicate images when multiple wake_payloads reference the same image
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'image_id', image_data.image_id,
            'captured_at', image_data.captured_at,
            'image_url', image_data.image_url,
            'image_status', image_data.status,
            'wake_window_index', image_data.wake_window_index,
            'wake_number', image_data.wake_window_index,
            -- MGI Fields
            'mgi_score', image_data.mgi_score,
            'mold_growth_velocity', image_data.mold_growth_velocity,
            'mold_growth_speed', image_data.mold_growth_speed,
            -- Environmental data from wake payload
            'temperature', image_data.temperature,
            'humidity', image_data.humidity,
            'battery_voltage', image_data.battery_voltage,
            'wifi_rssi', image_data.wifi_rssi
          ) ORDER BY image_data.captured_at
        ), '[]'::jsonb)
        FROM (
          SELECT DISTINCT ON (di.image_id)
            di.image_id,
            di.captured_at,
            di.image_url,
            di.status,
            dwp.wake_window_index,
            di.mgi_score,
            di.mold_growth_velocity,
            di.mold_growth_speed,
            dwp.temperature,
            dwp.humidity,
            dwp.battery_voltage,
            dwp.wifi_rssi
          FROM device_images di
          JOIN device_wake_payloads dwp ON di.image_id = dwp.image_id
          WHERE dwp.device_id = d.device_id
          AND dwp.site_device_session_id = p_session_id
          ORDER BY di.image_id, dwp.captured_at DESC
        ) as image_data
      ) as images

    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    WHERE dsa.site_id = v_session_record.site_id
    -- Device was assigned before or during this session
    AND dsa.assigned_at <= v_session_record.session_end_time
    -- Device hasn't been unassigned yet, or was unassigned after session start
    AND (dsa.unassigned_at IS NULL OR dsa.unassigned_at >= v_session_record.session_start_time)
    ORDER BY dsa.is_primary DESC NULLS LAST, d.device_code

  LOOP
    -- Add device to array
    v_device_array := v_device_array || jsonb_build_object(
      'device_id', v_device_record.device_id,
      'device_code', v_device_record.device_code,
      'device_name', v_device_record.device_name,
      'hardware_version', v_device_record.hardware_version,
      'firmware_version', v_device_record.firmware_version,
      'wake_schedule_cron', v_device_record.wake_schedule_cron,
      'battery_voltage', v_device_record.battery_voltage,
      'battery_health_percent', v_device_record.battery_health_percent,
      'wifi_ssid', v_device_record.wifi_ssid,
      'assigned_at', v_device_record.assigned_at,
      'is_primary', v_device_record.is_primary,
      'expected_wakes_in_session', v_device_record.expected_wakes_in_session,
      'actual_wakes', v_device_record.actual_wakes,
      'completed_wakes', v_device_record.completed_wakes,
      'failed_wakes', v_device_record.failed_wakes,
      'extra_wakes', v_device_record.extra_wakes,
      'wake_payloads', v_device_record.wake_payloads,
      'images', v_device_record.images,
      'added_mid_session', CASE
        WHEN v_device_record.assigned_at > v_session_record.session_start_time THEN TRUE
        ELSE FALSE
      END
    );
  END LOOP;

  RETURN jsonb_build_object('devices', v_device_array);
END;
$$;

COMMENT ON FUNCTION get_session_devices_with_wakes IS
'Get all devices in a session with wake payloads, images, and statistics. Images now include all MGI fields (score, velocity, speed) and environmental data (temperature, humidity, battery_voltage).';
