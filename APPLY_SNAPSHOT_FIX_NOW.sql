-- ================================================
-- FINAL FIX: Snapshot generation with correct column names
-- ================================================
-- Changes:
-- 1. Fix DATE_PART -> EXTRACT(EPOCH) conversion
-- 2. Use correct column name: new_images_this_round
-- 3. Add LOCF (Last Observation Carried Forward) for MGI
-- 4. Add program day calculations
-- 5. Add zone analytics and device connectivity

DROP FUNCTION IF EXISTS generate_session_wake_snapshot(uuid, integer, timestamptz, timestamptz) CASCADE;

CREATE FUNCTION generate_session_wake_snapshot(
  p_session_id uuid,
  p_wake_number integer,
  p_wake_round_start timestamptz,
  p_wake_round_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
  v_site_id uuid;
  v_program_id uuid;
  v_company_id uuid;
  v_site_state jsonb;
  v_active_devices_count integer;
  v_new_images_count integer;
  v_program_start timestamptz;
  v_program_end timestamptz;
  v_program_day_calc integer;
  v_total_days_calc integer;
BEGIN
  -- Get session context
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  -- Get program dates for calculation
  SELECT start_date, end_date
  INTO v_program_start, v_program_end
  FROM pilot_programs
  WHERE program_id = v_program_id;

  -- Calculate program days EXPLICITLY with proper casting
  v_program_day_calc := FLOOR(EXTRACT(EPOCH FROM (p_wake_round_end - v_program_start)) / 86400.0)::integer;
  v_total_days_calc := FLOOR(EXTRACT(EPOCH FROM (v_program_end - v_program_start)) / 86400.0)::integer;

  -- Build complete site state snapshot with LOCF
  WITH
  -- Program context - pre-calculated
  program_meta AS (
    SELECT jsonb_build_object(
      'program_id', v_program_id,
      'program_name', pp.name,
      'program_start_date', pp.start_date,
      'program_end_date', pp.end_date,
      'program_day', v_program_day_calc,
      'total_days', v_total_days_calc
    ) AS program_context
    FROM pilot_programs pp WHERE pp.program_id = v_program_id
  ),

  -- Device states with MGI metrics and LOCF
  device_states AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'device_id', d.device_id,
        'device_code', d.device_code,
        'device_name', d.device_name,
        'position', jsonb_build_object('x', d.x_position, 'y', d.y_position),
        'mgi_score', COALESCE(di.mgi_score, last_di.mgi_score),
        'mgi_metadata', CASE
          WHEN di.mgi_score IS NOT NULL THEN
            jsonb_build_object('status', 'current_wake', 'captured_at', di.captured_at)
          WHEN last_di.mgi_score IS NOT NULL THEN
            jsonb_build_object('status', 'locf', 'captured_at', last_di.captured_at, 'carried_forward_from_wake', last_di.wake_number)
          ELSE
            jsonb_build_object('status', 'no_data')
        END,
        'mgi_metrics', CASE
          WHEN di.mgi_score IS NOT NULL THEN
            (SELECT calculate_mgi_metrics(d.device_id, di.mgi_score, di.captured_at))
          ELSE NULL
        END,
        'latest_image_url', COALESCE(di.storage_path, last_di.storage_path),
        'captured_at', COALESCE(di.captured_at, last_di.captured_at),
        'wake_number', COALESCE(di.wake_number, last_di.wake_number),
        'last_seen_at', d.last_seen_at,
        'battery_level', d.battery_voltage,
        'connectivity', calculate_device_wake_reliability(d.device_id, v_site_id, p_wake_round_end, 3)
      )
      ORDER BY d.x_position NULLS LAST, d.y_position NULLS LAST
    ) AS devices_array,
    COUNT(*) FILTER (WHERE d.is_active = true) AS active_count,
    COUNT(*) FILTER (WHERE di.image_id IS NOT NULL) AS new_images_count
    FROM devices d
    LEFT JOIN device_images di ON di.device_id = d.device_id
      AND di.session_id = p_session_id
      AND di.wake_number = p_wake_number
    LEFT JOIN LATERAL (
      SELECT mgi_score, storage_path, captured_at, wake_number
      FROM device_images
      WHERE device_id = d.device_id
        AND session_id = p_session_id
        AND wake_number < p_wake_number
        AND mgi_score IS NOT NULL
      ORDER BY wake_number DESC
      LIMIT 1
    ) last_di ON true
    WHERE d.site_id = v_site_id
      AND d.is_active = true
  ),

  -- Zone analytics
  zone_analytics AS (
    SELECT generate_device_centered_zones(v_site_id) AS zones
  )

  -- Build final snapshot structure
  SELECT
    jsonb_build_object(
      'snapshot_id', gen_random_uuid(),
      'session_id', p_session_id,
      'wake_number', p_wake_number,
      'wake_window', jsonb_build_object(
        'start', p_wake_round_start,
        'end', p_wake_round_end
      ),
      'program', (SELECT program_context FROM program_meta),
      'site', jsonb_build_object(
        'site_id', v_site_id,
        'zones', (SELECT zones FROM zone_analytics)
      ),
      'devices', (SELECT devices_array FROM device_states),
      'summary', jsonb_build_object(
        'active_devices', (SELECT active_count FROM device_states),
        'new_images', (SELECT new_images_count FROM device_states),
        'avg_mgi', (
          SELECT ROUND(AVG((value->>'mgi_score')::numeric), 2)
          FROM device_states, jsonb_array_elements(devices_array)
          WHERE value->>'mgi_score' IS NOT NULL
        )
      ),
      'metadata', jsonb_build_object(
        'generated_at', NOW(),
        'company_id', v_company_id
      )
    )
  INTO v_site_state;

  -- Extract generated UUID
  v_snapshot_id := (v_site_state->>'snapshot_id')::uuid;
  v_active_devices_count := (v_site_state->'summary'->>'active_devices')::integer;
  v_new_images_count := (v_site_state->'summary'->>'new_images')::integer;

  -- Insert snapshot with CORRECT column name
  INSERT INTO session_wake_snapshots (
    snapshot_id,
    session_id,
    wake_number,
    wake_round_start,
    wake_round_end,
    site_state,
    active_devices_count,
    new_images_this_round,  -- CORRECT column name!
    company_id,
    program_id,
    site_id
  ) VALUES (
    v_snapshot_id,
    p_session_id,
    p_wake_number,
    p_wake_round_start,
    p_wake_round_end,
    v_site_state,
    v_active_devices_count,
    v_new_images_count,
    v_company_id,
    v_program_id,
    v_site_id
  );

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate comprehensive wake snapshot with LOCF, MGI metrics, device connectivity, and zone analytics. Uses correct column name new_images_this_round.';

-- Verify deployment
SELECT 'SUCCESS: Snapshot function deployed with all fixes!' as status;
