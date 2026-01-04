/*
  # LOCF (Last Observation Carried Forward) Helper Function for Environmental Data

  ## Purpose
  When environmental data (temperature, humidity, pressure, gas_resistance) is missing
  from a device_images record, this function looks backward through previous wakes in
  the same session to find the last valid reading.

  ## Use Cases
  - Handle temporary sensor failures
  - Fill gaps in environmental data without losing device images
  - Maintain continuous time-series data for analytics
  - Support snapshot generation with complete environmental context

  ## Parameters
  - p_device_id: UUID of the device
  - p_session_id: UUID of the site device session
  - p_captured_at: Timestamp of the wake (for ordering)
  - p_wake_payload_id: Optional specific wake payload ID to query

  ## Returns
  JSONB object containing:
  - temperature: Numeric value (or null if no data found)
  - humidity: Numeric value (or null if no data found)
  - pressure: Numeric value (or null if no data found)
  - gas_resistance: Numeric value (or null if no data found)
  - locf_applied: Boolean indicating if we had to look backward
  - source_captured_at: Timestamp of the source data (may be earlier than requested)
  - source_image_id: UUID of the image we got the data from

  ## Application Instructions
  Apply via Supabase SQL Editor:
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
*/

CREATE OR REPLACE FUNCTION get_device_environmental_with_locf(
  p_device_id UUID,
  p_session_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_wake_payload_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  current_data RECORD;
  locf_data RECORD;
BEGIN
  -- First, try to get environmental data from the current wake
  IF p_wake_payload_id IS NOT NULL THEN
    -- Query by wake_payload_id (most specific)
    SELECT
      image_id,
      temperature,
      humidity,
      pressure,
      gas_resistance,
      captured_at
    INTO current_data
    FROM device_images
    WHERE device_id = p_device_id
      AND wake_payload_id = p_wake_payload_id
      AND status = 'complete'
    ORDER BY captured_at DESC
    LIMIT 1;
  ELSE
    -- Query by session, device, and timestamp
    SELECT
      image_id,
      temperature,
      humidity,
      pressure,
      gas_resistance,
      captured_at
    INTO current_data
    FROM device_images
    WHERE device_id = p_device_id
      AND site_device_session_id = p_session_id
      AND captured_at <= p_captured_at
      AND status = 'complete'
    ORDER BY captured_at DESC
    LIMIT 1;
  END IF;

  -- If we found data and it has environmental readings, return it directly
  IF FOUND AND current_data.temperature IS NOT NULL THEN
    result := jsonb_build_object(
      'temperature', current_data.temperature,
      'humidity', current_data.humidity,
      'pressure', current_data.pressure,
      'gas_resistance', current_data.gas_resistance,
      'locf_applied', false,
      'source_captured_at', current_data.captured_at,
      'source_image_id', current_data.image_id
    );
    RETURN result;
  END IF;

  -- Environmental data is missing or null, apply LOCF
  -- Look backward through previous wakes in the same session
  SELECT
    image_id,
    temperature,
    humidity,
    pressure,
    gas_resistance,
    captured_at
  INTO locf_data
  FROM device_images
  WHERE device_id = p_device_id
    AND site_device_session_id = p_session_id
    AND captured_at < p_captured_at
    AND status = 'complete'
    AND temperature IS NOT NULL  -- Only get rows with actual data
  ORDER BY captured_at DESC
  LIMIT 1;

  -- If we found historical data, return it with LOCF flag
  IF FOUND THEN
    result := jsonb_build_object(
      'temperature', locf_data.temperature,
      'humidity', locf_data.humidity,
      'pressure', locf_data.pressure,
      'gas_resistance', locf_data.gas_resistance,
      'locf_applied', true,
      'source_captured_at', locf_data.captured_at,
      'source_image_id', locf_data.image_id
    );
    RETURN result;
  END IF;

  -- No environmental data found at all (neither current nor historical)
  result := jsonb_build_object(
    'temperature', null,
    'humidity', null,
    'pressure', null,
    'gas_resistance', null,
    'locf_applied', false,
    'source_captured_at', null,
    'source_image_id', null
  );

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- Return null values on any error
    RETURN jsonb_build_object(
      'temperature', null,
      'humidity', null,
      'pressure', null,
      'gas_resistance', null,
      'locf_applied', false,
      'source_captured_at', null,
      'source_image_id', null,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Add helpful comment
COMMENT ON FUNCTION get_device_environmental_with_locf IS
'Retrieves environmental data (temperature, humidity, pressure, gas_resistance) for a device wake, applying LOCF (Last Observation Carried Forward) if current data is missing. Returns JSONB with data and metadata about source.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_device_environmental_with_locf(UUID, UUID, TIMESTAMPTZ, UUID) TO authenticated;

-- Example usage:
-- SELECT get_device_environmental_with_locf(
--   'device-uuid'::uuid,
--   'session-uuid'::uuid,
--   '2026-01-04 12:00:00'::timestamptz,
--   null
-- );
