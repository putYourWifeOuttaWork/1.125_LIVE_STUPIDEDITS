-- Fix Trigger to Handle Missing Columns in INSERT

CREATE OR REPLACE FUNCTION populate_device_data_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_device_company_id UUID;
  v_device_site_id UUID;
  v_device_program_id UUID;
  v_active_session_id UUID;
BEGIN
  IF NEW.device_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT company_id, site_id, program_id
  INTO v_device_company_id, v_device_site_id, v_device_program_id
  FROM devices
  WHERE device_id = NEW.device_id;

  -- Use TRY-EXCEPT pattern to handle missing columns
  BEGIN
    IF NEW.company_id IS NULL THEN
      NEW.company_id := v_device_company_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL; -- Column not in INSERT, skip
  END;

  BEGIN
    IF NEW.site_id IS NULL THEN
      NEW.site_id := v_device_site_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  BEGIN
    IF NEW.program_id IS NULL THEN
      NEW.program_id := v_device_program_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  BEGIN
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
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
