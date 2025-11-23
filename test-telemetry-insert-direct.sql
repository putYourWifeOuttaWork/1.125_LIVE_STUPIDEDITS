-- Test direct telemetry insert to see exact error

-- First, get a real device_id
DO $$
DECLARE
  v_device_id UUID;
  v_company_id UUID;
BEGIN
  SELECT device_id, company_id INTO v_device_id, v_company_id
  FROM devices
  WHERE device_mac = 'AA:BB:CC:21:30:20'
  LIMIT 1;

  RAISE NOTICE 'Found device: % (company: %)', v_device_id, v_company_id;

  -- Try to insert telemetry
  BEGIN
    INSERT INTO device_telemetry (
      device_id,
      captured_at,
      temperature,
      humidity,
      pressure,
      gas_resistance
    ) VALUES (
      v_device_id,
      now(),
      29.9,
      55,
      1909.7,
      15.3
    );

    RAISE NOTICE '✅ Telemetry insert SUCCEEDED';

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Telemetry insert FAILED: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;
END $$;
