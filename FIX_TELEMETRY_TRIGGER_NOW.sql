/*
  Fix Telemetry Trigger Function
  
  Problem: Function incorrectly queries device_telemetry with event_category column
  Solution: Remove invalid column reference from device_telemetry query
*/

CREATE OR REPLACE FUNCTION log_device_telemetry_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_last_logged_telemetry_id uuid;
  v_reading_count int;
  v_should_log boolean := false;
BEGIN
  -- Get the last telemetry reading that was logged to device_history
  SELECT source_id INTO v_last_logged_telemetry_id
  FROM device_history
  WHERE device_id = NEW.device_id
    AND event_category = 'EnvironmentalReading'
    AND source_table = 'device_telemetry'
  ORDER BY event_timestamp DESC
  LIMIT 1;

  -- Count telemetry readings since last log
  -- NOTE: device_telemetry does NOT have event_category column
  SELECT COUNT(*) INTO v_reading_count
  FROM device_telemetry
  WHERE device_id = NEW.device_id
    AND telemetry_id > COALESCE(v_last_logged_telemetry_id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Log every 10th reading
  IF v_reading_count >= 10 THEN
    v_should_log := true;
  END IF;

  IF v_should_log THEN
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      event_category,
      event_type,
      severity,
      description,
      event_data,
      metadata,
      triggered_by,
      source_table,
      source_id,
      event_timestamp
    ) VALUES (
      NEW.device_id,
      (SELECT company_id FROM devices WHERE device_id = NEW.device_id),
      (SELECT program_id FROM devices WHERE device_id = NEW.device_id),
      (SELECT site_id FROM devices WHERE device_id = NEW.device_id),
      'EnvironmentalReading',
      'TelemetrySummary',
      'info',
      format('Environmental reading: %.1f°C, %.1f%% humidity', NEW.temperature, NEW.humidity),
      jsonb_build_object(
        'temperature', NEW.temperature,
        'humidity', NEW.humidity,
        'pressure', NEW.pressure,
        'gas_resistance', NEW.gas_resistance,
        'battery_voltage', NEW.battery_voltage
      ),
      jsonb_build_object(
        'reading_count_since_last_log', v_reading_count
      ),
      'system',
      'device_telemetry',
      NEW.telemetry_id,
      NEW.captured_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
