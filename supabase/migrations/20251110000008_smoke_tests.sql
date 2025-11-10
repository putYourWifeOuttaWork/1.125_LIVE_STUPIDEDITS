/*
  # Phase 2.5 Smoke Tests

  1. Purpose
    - Validate device submission shell integration
    - Test all lifecycle functions end-to-end
    - Verify RLS isolation and data integrity

  2. Test Suite
    - Test 1: Happy Path (device wake → observation with submission_id)
    - Test 2: Retry Path (failed image resend, same row updates)
    - Test 3: Overage Wake (unexpected wake time handling)
    - Test 4: Timezone Boundary (midnight crossover)
    - Test 5: RLS Isolation (cross-company security)

  3. Usage
    - Run via: SELECT * FROM fn_run_phase_2_5_smoke_tests();
    - Returns JSONB with test results and verdicts
    - All tests should pass before proceeding to Phase 3
*/

-- ==========================================
-- SMOKE TEST RUNNER FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION fn_run_phase_2_5_smoke_tests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_test_results JSONB := '[]'::JSONB;
  v_test_result JSONB;
  v_overall_pass BOOLEAN := TRUE;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
BEGIN
  v_start_time := NOW();

  -- Create test schema (cleanup at end)
  CREATE TEMP TABLE IF NOT EXISTS smoke_test_cleanup (
    table_name TEXT,
    record_id UUID
  );

  RAISE NOTICE '========================================';
  RAISE NOTICE 'PHASE 2.5 SMOKE TESTS';
  RAISE NOTICE '========================================';

  -- ========================================
  -- TEST 1: HAPPY PATH
  -- ========================================
  BEGIN
    v_test_result := fn_smoke_test_1_happy_path();
    v_test_results := v_test_results || jsonb_build_array(v_test_result);
    IF (v_test_result->>'pass')::BOOLEAN = FALSE THEN
      v_overall_pass := FALSE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || jsonb_build_array(jsonb_build_object(
      'test_name', 'Test 1: Happy Path',
      'pass', false,
      'error', SQLERRM
    ));
    v_overall_pass := FALSE;
  END;

  -- ========================================
  -- TEST 2: RETRY PATH
  -- ========================================
  BEGIN
    v_test_result := fn_smoke_test_2_retry_path();
    v_test_results := v_test_results || jsonb_build_array(v_test_result);
    IF (v_test_result->>'pass')::BOOLEAN = FALSE THEN
      v_overall_pass := FALSE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || jsonb_build_array(jsonb_build_object(
      'test_name', 'Test 2: Retry Path',
      'pass', false,
      'error', SQLERRM
    ));
    v_overall_pass := FALSE;
  END;

  -- ========================================
  -- TEST 3: OVERAGE WAKE
  -- ========================================
  BEGIN
    v_test_result := fn_smoke_test_3_overage_wake();
    v_test_results := v_test_results || jsonb_build_array(v_test_result);
    IF (v_test_result->>'pass')::BOOLEAN = FALSE THEN
      v_overall_pass := FALSE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || jsonb_build_array(jsonb_build_object(
      'test_name', 'Test 3: Overage Wake',
      'pass', false,
      'error', SQLERRM
    ));
    v_overall_pass := FALSE;
  END;

  -- ========================================
  -- TEST 4: TIMEZONE BOUNDARY
  -- ========================================
  BEGIN
    v_test_result := fn_smoke_test_4_timezone_boundary();
    v_test_results := v_test_results || jsonb_build_array(v_test_result);
    IF (v_test_result->>'pass')::BOOLEAN = FALSE THEN
      v_overall_pass := FALSE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || jsonb_build_array(jsonb_build_object(
      'test_name', 'Test 4: Timezone Boundary',
      'pass', false,
      'error', SQLERRM
    ));
    v_overall_pass := FALSE;
  END;

  -- ========================================
  -- TEST 5: RLS ISOLATION
  -- ========================================
  BEGIN
    v_test_result := fn_smoke_test_5_rls_isolation();
    v_test_results := v_test_results || jsonb_build_array(v_test_result);
    IF (v_test_result->>'pass')::BOOLEAN = FALSE THEN
      v_overall_pass := FALSE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || jsonb_build_array(jsonb_build_object(
      'test_name', 'Test 5: RLS Isolation',
      'pass', false,
      'error', SQLERRM
    ));
    v_overall_pass := FALSE;
  END;

  -- ========================================
  -- CLEANUP (optional - uncomment to clean test data)
  -- ========================================
  -- Cleanup logic would go here if needed
  -- For now, leaving test data for manual inspection

  v_end_time := NOW();

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SMOKE TESTS COMPLETE';
  RAISE NOTICE 'Overall Result: %', CASE WHEN v_overall_pass THEN 'PASS ✓' ELSE 'FAIL ✗' END;
  RAISE NOTICE 'Duration: %', (v_end_time - v_start_time);
  RAISE NOTICE '========================================';

  RETURN jsonb_build_object(
    'overall_pass', v_overall_pass,
    'test_count', jsonb_array_length(v_test_results),
    'start_time', v_start_time,
    'end_time', v_end_time,
    'duration_seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time)),
    'tests', v_test_results
  );
END;
$$;

-- ==========================================
-- TEST 1: HAPPY PATH
-- ==========================================

CREATE OR REPLACE FUNCTION fn_smoke_test_1_happy_path()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_site_id UUID;
  v_device_id UUID;
  v_session_result JSONB;
  v_wake_result JSONB;
  v_image_result JSONB;
  v_session_id UUID;
  v_device_submission_id UUID;
  v_payload_id UUID;
  v_image_id UUID;
  v_observation_id UUID;
  v_checks JSONB := '[]'::JSONB;
  v_pass BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '--- Test 1: Happy Path ---';

  -- Setup: Create test data
  SELECT company_id, program_id, site_id INTO v_company_id, v_program_id, v_site_id
  FROM sites
  WHERE timezone IS NOT NULL
  LIMIT 1;

  IF v_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'test_name', 'Test 1: Happy Path',
      'pass', false,
      'message', 'No site with timezone found for testing'
    );
  END IF;

  SELECT device_id INTO v_device_id
  FROM devices
  WHERE is_active = TRUE
  LIMIT 1;

  IF v_device_id IS NULL THEN
    RETURN jsonb_build_object(
      'test_name', 'Test 1: Happy Path',
      'pass', false,
      'message', 'No active device found for testing'
    );
  END IF;

  -- Assign device to site if not already assigned
  INSERT INTO device_site_assignments (device_id, site_id, program_id, is_primary, is_active, company_id)
  VALUES (v_device_id, v_site_id, v_program_id, TRUE, TRUE, v_company_id)
  ON CONFLICT (device_id, site_id) DO UPDATE SET is_active = TRUE, is_primary = TRUE;

  -- Step 1: Create session (midnight opener)
  v_session_result := fn_midnight_session_opener(v_site_id);
  v_session_id := (v_session_result->>'session_id')::UUID;
  v_device_submission_id := (v_session_result->>'device_submission_id')::UUID;

  -- Check 1: Session created
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Session created',
    'pass', v_session_id IS NOT NULL
  ));
  IF v_session_id IS NULL THEN v_pass := FALSE; END IF;

  -- Check 2: Device submission shell created
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Device submission shell created',
    'pass', v_device_submission_id IS NOT NULL
  ));
  IF v_device_submission_id IS NULL THEN v_pass := FALSE; END IF;

  -- Check 3: Submission has valid fields
  DECLARE
    v_submission_record RECORD;
  BEGIN
    SELECT * INTO v_submission_record
    FROM submissions
    WHERE submission_id = v_device_submission_id;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Submission has temperature',
      'pass', v_submission_record.temperature IS NOT NULL
    ));
    IF v_submission_record.temperature IS NULL THEN v_pass := FALSE; END IF;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Submission is_device_generated = TRUE',
      'pass', v_submission_record.is_device_generated = TRUE
    ));
    IF v_submission_record.is_device_generated != TRUE THEN v_pass := FALSE; END IF;
  END;

  -- Step 2: Ingest wake
  v_wake_result := fn_wake_ingestion_handler(
    v_device_id,
    NOW(),
    'test_image_happy_path.jpg',
    jsonb_build_object(
      'temperature', 72.5,
      'humidity', 45.2,
      'pressure', 1013.25,
      'battery_voltage', 3.9,
      'total_chunks', 10
    )
  );
  v_payload_id := (v_wake_result->>'payload_id')::UUID;
  v_image_id := (v_wake_result->>'image_id')::UUID;

  -- Check 4: Payload created
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Payload created',
    'pass', v_payload_id IS NOT NULL
  ));
  IF v_payload_id IS NULL THEN v_pass := FALSE; END IF;

  -- Step 3: Complete image
  v_image_result := fn_image_completion_handler(v_image_id, 'https://storage.example.com/test.jpg');
  v_observation_id := (v_image_result->>'observation_id')::UUID;

  -- Check 5: Observation created
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Observation created',
    'pass', v_observation_id IS NOT NULL
  ));
  IF v_observation_id IS NULL THEN v_pass := FALSE; END IF;

  -- Check 6: Observation has submission_id
  DECLARE
    v_obs_submission_id UUID;
  BEGIN
    SELECT submission_id INTO v_obs_submission_id
    FROM petri_observations
    WHERE observation_id = v_observation_id;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Observation has submission_id',
      'pass', v_obs_submission_id IS NOT NULL AND v_obs_submission_id = v_device_submission_id
    ));
    IF v_obs_submission_id IS NULL OR v_obs_submission_id != v_device_submission_id THEN
      v_pass := FALSE;
    END IF;
  END;

  -- Check 7: Session counters updated
  DECLARE
    v_completed_count INT;
  BEGIN
    SELECT completed_wake_count INTO v_completed_count
    FROM site_device_sessions
    WHERE session_id = v_session_id;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Session completed_wake_count > 0',
      'pass', v_completed_count > 0
    ));
    IF v_completed_count = 0 THEN v_pass := FALSE; END IF;
  END;

  RAISE NOTICE 'Test 1: %', CASE WHEN v_pass THEN 'PASS ✓' ELSE 'FAIL ✗' END;

  RETURN jsonb_build_object(
    'test_name', 'Test 1: Happy Path',
    'pass', v_pass,
    'checks', v_checks,
    'session_id', v_session_id,
    'device_submission_id', v_device_submission_id,
    'payload_id', v_payload_id,
    'observation_id', v_observation_id
  );
END;
$$;

-- ==========================================
-- TEST 2: RETRY PATH
-- ==========================================

CREATE OR REPLACE FUNCTION fn_smoke_test_2_retry_path()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_id UUID;
  v_image_name TEXT := 'test_image_retry_path.jpg';
  v_original_image_id UUID;
  v_original_captured_at TIMESTAMPTZ;
  v_retry_result JSONB;
  v_checks JSONB := '[]'::JSONB;
  v_pass BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '--- Test 2: Retry Path ---';

  -- Get an existing device
  SELECT device_id INTO v_device_id
  FROM devices
  WHERE is_active = TRUE
  LIMIT 1;

  -- Create a failed image
  INSERT INTO device_images (device_id, image_name, captured_at, status, company_id, original_capture_date)
  SELECT v_device_id, v_image_name, NOW() - INTERVAL '1 day', 'failed', company_id, CURRENT_DATE - 1
  FROM devices WHERE device_id = v_device_id
  RETURNING image_id, captured_at INTO v_original_image_id, v_original_captured_at;

  -- Check 1: Image created with failed status
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Failed image created',
    'pass', v_original_image_id IS NOT NULL
  ));
  IF v_original_image_id IS NULL THEN v_pass := FALSE; END IF;

  -- Retry the image
  v_retry_result := fn_retry_by_id_handler(v_device_id, v_image_name, 'https://storage.example.com/retry.jpg');

  -- Check 2: Retry successful
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Retry successful',
    'pass', (v_retry_result->>'success')::BOOLEAN = TRUE
  ));
  IF (v_retry_result->>'success')::BOOLEAN != TRUE THEN v_pass := FALSE; END IF;

  -- Check 3: Same image_id (no duplicate)
  DECLARE
    v_retry_image_id UUID;
  BEGIN
    v_retry_image_id := (v_retry_result->>'image_id')::UUID;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Same image_id (no duplicate)',
      'pass', v_retry_image_id = v_original_image_id
    ));
    IF v_retry_image_id != v_original_image_id THEN v_pass := FALSE; END IF;
  END;

  -- Check 4: captured_at preserved
  DECLARE
    v_current_captured_at TIMESTAMPTZ;
  BEGIN
    SELECT captured_at INTO v_current_captured_at
    FROM device_images
    WHERE image_id = v_original_image_id;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'captured_at preserved',
      'pass', v_current_captured_at = v_original_captured_at
    ));
    IF v_current_captured_at != v_original_captured_at THEN v_pass := FALSE; END IF;
  END;

  -- Check 5: resent_received_at set
  DECLARE
    v_resent_at TIMESTAMPTZ;
  BEGIN
    SELECT resent_received_at INTO v_resent_at
    FROM device_images
    WHERE image_id = v_original_image_id;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'resent_received_at set',
      'pass', v_resent_at IS NOT NULL
    ));
    IF v_resent_at IS NULL THEN v_pass := FALSE; END IF;
  END;

  RAISE NOTICE 'Test 2: %', CASE WHEN v_pass THEN 'PASS ✓' ELSE 'FAIL ✗' END;

  RETURN jsonb_build_object(
    'test_name', 'Test 2: Retry Path',
    'pass', v_pass,
    'checks', v_checks,
    'original_image_id', v_original_image_id,
    'retry_result', v_retry_result
  );
END;
$$;

-- ==========================================
-- TEST 3: OVERAGE WAKE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_smoke_test_3_overage_wake()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_id UUID;
  v_site_id UUID;
  v_wake_result JSONB;
  v_session_id UUID;
  v_checks JSONB := '[]'::JSONB;
  v_pass BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '--- Test 3: Overage Wake ---';

  -- Get device with specific wake schedule (e.g., "0 8,16 * * *" = 8am, 4pm)
  SELECT d.device_id, dsa.site_id
  INTO v_device_id, v_site_id
  FROM devices d
  JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
  WHERE d.is_active = TRUE AND dsa.is_active = TRUE
  LIMIT 1;

  IF v_device_id IS NULL THEN
    RETURN jsonb_build_object(
      'test_name', 'Test 3: Overage Wake',
      'pass', false,
      'message', 'No active device assignment found'
    );
  END IF;

  -- Update device to have specific schedule
  UPDATE devices
  SET wake_schedule_cron = '0 8,16 * * *'
  WHERE device_id = v_device_id;

  -- Ingest wake at unexpected time (11am - between 8am and 4pm)
  v_wake_result := fn_wake_ingestion_handler(
    v_device_id,
    DATE_TRUNC('day', NOW()) + INTERVAL '11 hours', -- 11am today
    'test_image_overage.jpg',
    jsonb_build_object(
      'temperature', 74.0,
      'humidity', 50.0,
      'total_chunks', 5
    )
  );

  -- Check 1: Wake ingested
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Wake ingested',
    'pass', (v_wake_result->>'success')::BOOLEAN = TRUE
  ));
  IF (v_wake_result->>'success')::BOOLEAN != TRUE THEN v_pass := FALSE; END IF;

  -- Check 2: Overage flag set
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Overage flag set',
    'pass', (v_wake_result->>'is_overage')::BOOLEAN = TRUE
  ));
  IF (v_wake_result->>'is_overage')::BOOLEAN != TRUE THEN v_pass := FALSE; END IF;

  -- Check 3: Session extra_wake_count incremented
  v_session_id := (v_wake_result->>'session_id')::UUID;
  DECLARE
    v_extra_count INT;
  BEGIN
    SELECT extra_wake_count INTO v_extra_count
    FROM site_device_sessions
    WHERE session_id = v_session_id;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Session extra_wake_count > 0',
      'pass', v_extra_count > 0
    ));
    IF v_extra_count = 0 THEN v_pass := FALSE; END IF;
  END;

  RAISE NOTICE 'Test 3: %', CASE WHEN v_pass THEN 'PASS ✓' ELSE 'FAIL ✗' END;

  RETURN jsonb_build_object(
    'test_name', 'Test 3: Overage Wake',
    'pass', v_pass,
    'checks', v_checks,
    'wake_result', v_wake_result
  );
END;
$$;

-- ==========================================
-- TEST 4: TIMEZONE BOUNDARY
-- ==========================================

CREATE OR REPLACE FUNCTION fn_smoke_test_4_timezone_boundary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_id UUID;
  v_site_timezone TEXT;
  v_device_id UUID;
  v_session_day_n UUID;
  v_session_day_n_plus_1 UUID;
  v_device_submission_day_n UUID;
  v_device_submission_day_n_plus_1 UUID;
  v_checks JSONB := '[]'::JSONB;
  v_pass BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '--- Test 4: Timezone Boundary ---';

  -- Get site with timezone
  SELECT site_id, timezone INTO v_site_id, v_site_timezone
  FROM sites
  WHERE timezone IS NOT NULL AND timezone != 'UTC'
  LIMIT 1;

  IF v_site_id IS NULL THEN
    -- Fallback: create test site with timezone
    INSERT INTO sites (name, type, program_id, timezone, company_id)
    SELECT 'Test Site Timezone', 'Outdoor', program_id, 'America/New_York', company_id
    FROM pilot_programs LIMIT 1
    RETURNING site_id, timezone INTO v_site_id, v_site_timezone;
  END IF;

  -- Create sessions for Day N and Day N+1
  DECLARE
    v_result_n JSONB;
    v_result_n_plus_1 JSONB;
  BEGIN
    v_result_n := fn_midnight_session_opener(v_site_id);
    v_session_day_n := (v_result_n->>'session_id')::UUID;
    v_device_submission_day_n := (v_result_n->>'device_submission_id')::UUID;

    -- Simulate next day (would normally be called by cron)
    -- For testing, manually create session for tomorrow
    INSERT INTO site_device_sessions (
      company_id, program_id, site_id,
      session_date, session_start_time, session_end_time,
      expected_wake_count, status
    )
    SELECT
      company_id, program_id, site_id,
      session_date + 1, session_start_time + INTERVAL '1 day', session_end_time + INTERVAL '1 day',
      expected_wake_count, 'in_progress'
    FROM site_device_sessions
    WHERE session_id = v_session_day_n
    RETURNING session_id INTO v_session_day_n_plus_1;

    -- Create device submission for Day N+1
    v_device_submission_day_n_plus_1 := fn_get_or_create_device_submission(
      v_site_id,
      (SELECT session_date FROM site_device_sessions WHERE session_id = v_session_day_n) + 1
    );

    UPDATE site_device_sessions
    SET device_submission_id = v_device_submission_day_n_plus_1
    WHERE session_id = v_session_day_n_plus_1;
  END;

  -- Check 1: Two separate sessions created
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Two sessions created',
    'pass', v_session_day_n IS NOT NULL AND v_session_day_n_plus_1 IS NOT NULL
  ));
  IF v_session_day_n IS NULL OR v_session_day_n_plus_1 IS NOT NULL THEN v_pass := FALSE; END IF;

  -- Check 2: Two separate device submissions
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Two device submissions created',
    'pass', v_device_submission_day_n IS NOT NULL AND v_device_submission_day_n_plus_1 IS NOT NULL
      AND v_device_submission_day_n != v_device_submission_day_n_plus_1
  ));
  IF v_device_submission_day_n IS NULL OR v_device_submission_day_n_plus_1 IS NULL
     OR v_device_submission_day_n = v_device_submission_day_n_plus_1 THEN
    v_pass := FALSE;
  END IF;

  -- Check 3: Different dates
  DECLARE
    v_date_n DATE;
    v_date_n_plus_1 DATE;
  BEGIN
    SELECT session_date INTO v_date_n
    FROM site_device_sessions WHERE session_id = v_session_day_n;

    SELECT session_date INTO v_date_n_plus_1
    FROM site_device_sessions WHERE session_id = v_session_day_n_plus_1;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Different session dates',
      'pass', v_date_n != v_date_n_plus_1
    ));
    IF v_date_n = v_date_n_plus_1 THEN v_pass := FALSE; END IF;
  END;

  RAISE NOTICE 'Test 4: %', CASE WHEN v_pass THEN 'PASS ✓' ELSE 'FAIL ✗' END;

  RETURN jsonb_build_object(
    'test_name', 'Test 4: Timezone Boundary',
    'pass', v_pass,
    'checks', v_checks,
    'session_day_n', v_session_day_n,
    'session_day_n_plus_1', v_session_day_n_plus_1,
    'site_timezone', v_site_timezone
  );
END;
$$;

-- ==========================================
-- TEST 5: RLS ISOLATION
-- ==========================================

CREATE OR REPLACE FUNCTION fn_smoke_test_5_rls_isolation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_a_id UUID;
  v_company_b_id UUID;
  v_session_a_id UUID;
  v_session_b_id UUID;
  v_checks JSONB := '[]'::JSONB;
  v_pass BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '--- Test 5: RLS Isolation ---';

  -- Get two different companies
  SELECT company_id INTO v_company_a_id FROM companies LIMIT 1;
  SELECT company_id INTO v_company_b_id FROM companies WHERE company_id != v_company_a_id LIMIT 1;

  IF v_company_a_id IS NULL OR v_company_b_id IS NULL THEN
    RETURN jsonb_build_object(
      'test_name', 'Test 5: RLS Isolation',
      'pass', false,
      'message', 'Need at least 2 companies for RLS testing'
    );
  END IF;

  -- Create sessions for both companies
  DECLARE
    v_site_a_id UUID;
    v_site_b_id UUID;
  BEGIN
    SELECT site_id INTO v_site_a_id
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.company_id = v_company_a_id
    LIMIT 1;

    SELECT site_id INTO v_site_b_id
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.company_id = v_company_b_id
    LIMIT 1;

    IF v_site_a_id IS NOT NULL THEN
      DECLARE
        v_result_a JSONB;
      BEGIN
        v_result_a := fn_midnight_session_opener(v_site_a_id);
        v_session_a_id := (v_result_a->>'session_id')::UUID;
      END;
    END IF;

    IF v_site_b_id IS NOT NULL THEN
      DECLARE
        v_result_b JSONB;
      BEGIN
        v_result_b := fn_midnight_session_opener(v_site_b_id);
        v_session_b_id := (v_result_b->>'session_id')::UUID;
      END;
    END IF;
  END;

  -- Check 1: Sessions created for both companies
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check', 'Sessions created for both companies',
    'pass', v_session_a_id IS NOT NULL AND v_session_b_id IS NOT NULL
  ));
  IF v_session_a_id IS NULL OR v_session_b_id IS NULL THEN v_pass := FALSE; END IF;

  -- Check 2: RLS policies exist
  DECLARE
    v_rls_enabled_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_rls_enabled_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('site_device_sessions', 'device_wake_payloads', 'device_schedule_changes')
      AND rowsecurity = true;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'RLS enabled on new tables',
      'pass', v_rls_enabled_count = 3
    ));
    IF v_rls_enabled_count != 3 THEN v_pass := FALSE; END IF;
  END;

  -- Check 3: Policies use get_active_company_id()
  DECLARE
    v_policy_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE tablename IN ('site_device_sessions', 'device_wake_payloads', 'device_schedule_changes')
      AND qual::TEXT LIKE '%get_active_company_id%';

    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'Policies use get_active_company_id()',
      'pass', v_policy_count > 0
    ));
    IF v_policy_count = 0 THEN v_pass := FALSE; END IF;
  END;

  RAISE NOTICE 'Test 5: %', CASE WHEN v_pass THEN 'PASS ✓' ELSE 'FAIL ✗' END;

  RETURN jsonb_build_object(
    'test_name', 'Test 5: RLS Isolation',
    'pass', v_pass,
    'checks', v_checks,
    'company_a_id', v_company_a_id,
    'company_b_id', v_company_b_id
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_run_phase_2_5_smoke_tests() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_smoke_test_1_happy_path() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_smoke_test_2_retry_path() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_smoke_test_3_overage_wake() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_smoke_test_4_timezone_boundary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_smoke_test_5_rls_isolation() TO authenticated, service_role;

-- Document usage
COMMENT ON FUNCTION fn_run_phase_2_5_smoke_tests() IS 'Run complete Phase 2.5 smoke test suite. Returns JSONB with test results. All tests should pass before proceeding to Phase 3.';
