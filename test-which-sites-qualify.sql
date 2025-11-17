-- ==========================================
-- DIAGNOSTIC: Which Sites Qualify for Auto-Session Creation?
-- ==========================================

-- This query shows ALL sites and why they do or don't qualify

WITH site_analysis AS (
  SELECT
    s.site_id,
    s.name as site_name,
    s.program_id,
    p.name as program_name,
    p.status as program_status,
    p.start_date,
    p.end_date,
    CURRENT_DATE as today,

    -- Check 1: Program is active
    (p.status = 'active') as passes_active_check,

    -- Check 2: Within date range
    (CURRENT_DATE BETWEEN p.start_date AND p.end_date) as passes_date_range_check,

    -- Check 3: Has active devices
    EXISTS (
      SELECT 1
      FROM device_site_assignments dsa
      JOIN devices d ON dsa.device_id = d.device_id
      WHERE dsa.site_id = s.site_id
        AND dsa.is_active = TRUE
        AND d.is_active = TRUE
    ) as passes_device_check,

    -- Device count
    (
      SELECT COUNT(*)
      FROM device_site_assignments dsa
      JOIN devices d ON dsa.device_id = d.device_id
      WHERE dsa.site_id = s.site_id
        AND dsa.is_active = TRUE
        AND d.is_active = TRUE
    ) as active_device_count,

    -- Device details
    (
      SELECT jsonb_agg(jsonb_build_object(
        'device_code', d.device_code,
        'device_name', d.device_name,
        'wake_schedule', d.wake_schedule_cron
      ))
      FROM device_site_assignments dsa
      JOIN devices d ON dsa.device_id = d.device_id
      WHERE dsa.site_id = s.site_id
        AND dsa.is_active = TRUE
        AND d.is_active = TRUE
    ) as devices

  FROM sites s
  LEFT JOIN pilot_programs p ON s.program_id = p.program_id
)
SELECT
  site_id,
  site_name,
  program_name,
  program_status,
  start_date,
  end_date,
  today,

  -- Overall qualification
  (passes_active_check AND passes_date_range_check AND passes_device_check) as QUALIFIES,

  -- Individual checks
  passes_active_check,
  passes_date_range_check,
  passes_device_check,

  -- Details
  active_device_count,
  devices,

  -- Failure reasons
  CASE
    WHEN NOT passes_active_check THEN '❌ Program not active (status: ' || program_status || ')'
    WHEN NOT passes_date_range_check THEN '❌ Outside date range (today: ' || today || ', range: ' || start_date || ' to ' || end_date || ')'
    WHEN NOT passes_device_check THEN '❌ No active devices assigned'
    ELSE '✅ All checks passed'
  END as reason

FROM site_analysis
ORDER BY QUALIFIES DESC, site_name;

-- ==========================================
-- SUMMARY: Count by qualification status
-- ==========================================

WITH site_analysis AS (
  SELECT
    s.site_id,
    (p.status = 'active') as passes_active_check,
    (CURRENT_DATE BETWEEN p.start_date AND p.end_date) as passes_date_range_check,
    EXISTS (
      SELECT 1
      FROM device_site_assignments dsa
      JOIN devices d ON dsa.device_id = d.device_id
      WHERE dsa.site_id = s.site_id
        AND dsa.is_active = TRUE
        AND d.is_active = TRUE
    ) as passes_device_check
  FROM sites s
  LEFT JOIN pilot_programs p ON s.program_id = p.program_id
)
SELECT
  COUNT(*) as total_sites,
  SUM(CASE WHEN passes_active_check AND passes_date_range_check AND passes_device_check THEN 1 ELSE 0 END) as sites_that_qualify,
  SUM(CASE WHEN NOT passes_active_check THEN 1 ELSE 0 END) as failed_active_check,
  SUM(CASE WHEN NOT passes_date_range_check THEN 1 ELSE 0 END) as failed_date_range_check,
  SUM(CASE WHEN NOT passes_device_check THEN 1 ELSE 0 END) as failed_device_check
FROM site_analysis;
