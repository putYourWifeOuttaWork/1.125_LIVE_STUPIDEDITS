/*
  # Fix Device Images Context Inheritance

  ## Problem
  Current trigger only inherits company_id from devices
  device_images are missing: site_id, program_id, site_device_session_id

  ## Evidence
  Image 31742c6d-3da3-4ac3-b689-bdc1a4ece2ee created with:
  - device_id: 49610cef-cd76-47db-9726-4491ba73381b ✓
  - company_id: 743d51b9-17bf-43d5-ad22-deebafead6fa ✓ (inherited)
  - site_id: NULL ❌ (should be 134218af-9afc-4ee9-9244-050f51ccbb39)
  - program_id: NULL ❌ (should be 6aa78f0f-6173-44e8-bc6c-877c775e2622)
  - site_device_session_id: NULL ❌ (should link to active session)

  Device 49610cef-cd76-47db-9726-4491ba73381b HAS:
  - site_id: 134218af-9afc-4ee9-9244-050f51ccbb39 ✓
  - program_id: 6aa78f0f-6173-44e8-bc6c-877c775e2622 ✓

  ## Solution
  Enhance populate_device_data_company_id() to also inherit:
  - site_id from device
  - program_id from device
  - site_device_session_id from active session (if exists)

  ## Inheritance Chain
  device_images inherits from:
  1. devices → company_id, site_id, program_id
  2. site_device_sessions → site_device_session_id (if active session exists)
*/

-- ============================================
-- ENHANCED CONTEXT INHERITANCE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION populate_device_data_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_device_company_id UUID;
  v_device_site_id UUID;
  v_device_program_id UUID;
  v_active_session_id UUID;
BEGIN
  -- If company_id, site_id, or program_id not set, derive from device
  IF NEW.device_id IS NOT NULL THEN
    SELECT 
      company_id,
      site_id,
      program_id
    INTO 
      v_device_company_id,
      v_device_site_id,
      v_device_program_id
    FROM devices
    WHERE device_id = NEW.device_id;

    -- Inherit company_id if not set
    IF NEW.company_id IS NULL THEN
      NEW.company_id := v_device_company_id;
    END IF;

    -- Inherit site_id if not set
    IF NEW.site_id IS NULL THEN
      NEW.site_id := v_device_site_id;
    END IF;

    -- Inherit program_id if not set
    IF NEW.program_id IS NULL THEN
      NEW.program_id := v_device_program_id;
    END IF;

    -- Find active session for this device's site (if site_device_session_id not set)
    -- Note: site_device_sessions are per-site, not per-device
    IF NEW.site_device_session_id IS NULL AND v_device_site_id IS NOT NULL THEN
      SELECT session_id INTO v_active_session_id
      FROM site_device_sessions
      WHERE site_id = v_device_site_id
        AND status IN ('pending', 'in_progress')
        AND session_date = CURRENT_DATE
      ORDER BY session_start_time DESC
      LIMIT 1;

      IF v_active_session_id IS NOT NULL THEN
        NEW.site_device_session_id := v_active_session_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION populate_device_data_company_id IS
  'Inherit company_id, site_id, program_id from device and site_device_session_id from active session';

-- ============================================
-- VERIFICATION
-- ============================================

-- The trigger already exists from migration 20251109000006
-- We just updated the function, so it will apply to new inserts

-- Test the function works
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_populate_device_images_company_id'
    AND tgrelid = 'device_images'::regclass
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Context inheritance trigger exists on device_images';
    RAISE NOTICE '✓ Function updated to inherit: company_id, site_id, program_id, site_device_session_id';
  ELSE
    RAISE WARNING '✗ Trigger NOT found on device_images table';
  END IF;
END $$;

-- Show example of what gets inherited
DO $$
DECLARE
  v_sample_device RECORD;
  v_active_session UUID;
BEGIN
  -- Find a device with full context
  SELECT 
    device_id,
    device_code,
    company_id,
    site_id,
    program_id
  INTO v_sample_device
  FROM devices
  WHERE company_id IS NOT NULL
    AND site_id IS NOT NULL
    AND program_id IS NOT NULL
  LIMIT 1;

  IF v_sample_device.device_id IS NOT NULL THEN
    -- Check for active session (sessions are per-site, not per-device)
    SELECT session_id INTO v_active_session
    FROM site_device_sessions
    WHERE site_id = v_sample_device.site_id
      AND status IN ('pending', 'in_progress')
      AND session_date = CURRENT_DATE
    LIMIT 1;

    RAISE NOTICE '=== Context Inheritance Example ===';
    RAISE NOTICE 'Device: % (%)', v_sample_device.device_code, v_sample_device.device_id;
    RAISE NOTICE 'Will inherit:';
    RAISE NOTICE '  company_id: %', v_sample_device.company_id;
    RAISE NOTICE '  site_id: %', v_sample_device.site_id;
    RAISE NOTICE '  program_id: %', v_sample_device.program_id;
    
    IF v_active_session IS NOT NULL THEN
      RAISE NOTICE '  site_device_session_id: % (active session)', v_active_session;
    ELSE
      RAISE NOTICE '  site_device_session_id: NULL (no active session)';
    END IF;
  END IF;
END $$;
