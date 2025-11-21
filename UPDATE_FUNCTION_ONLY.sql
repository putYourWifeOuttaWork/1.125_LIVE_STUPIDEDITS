-- Replace ONLY the connectivity function with simple boolean logic

DROP FUNCTION IF EXISTS calculate_device_wake_reliability(uuid, uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION calculate_device_wake_reliability(
  p_device_id uuid,
  p_site_id uuid,
  p_as_of_time timestamptz,
  p_lookback_wakes integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_total_expected integer := 0;
  v_total_actual integer := 0;
  v_missed_count integer := 0;
BEGIN
  -- Simple logic: count wakes where next_wake < last_wake (= missed wake)
  SELECT 
    COUNT(*) as total_wakes,
    COUNT(*) FILTER (WHERE next_wake_at < last_wake_at) as missed_wakes
  INTO v_total_expected, v_missed_count
  FROM device_wake_sessions
  WHERE device_id = p_device_id
    AND site_id = p_site_id
    AND wake_timestamp <= p_as_of_time
  ORDER BY wake_timestamp DESC
  LIMIT p_lookback_wakes;
  
  v_total_actual := v_total_expected - v_missed_count;
  
  RETURN jsonb_build_object(
    'expected_wakes', v_total_expected,
    'actual_wakes', v_total_actual,
    'missed_wakes', v_missed_count,
    'reliability_percent', CASE 
      WHEN v_total_expected > 0 THEN ROUND((v_total_actual::numeric / v_total_expected) * 100, 1)
      ELSE 100.0
    END,
    'status', CASE
      WHEN v_missed_count = 0 THEN 'excellent'
      WHEN v_missed_count = 1 THEN 'good'
      WHEN v_missed_count = 2 THEN 'fair'
      ELSE 'poor'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_device_wake_reliability TO service_role;
GRANT EXECUTE ON FUNCTION calculate_device_wake_reliability TO authenticated;
