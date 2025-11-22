/*
  # Fix Session Status Values in Unified Sessions Function

  1. Problem
    - Function uses 'Unclaimed' and 'Active' status values
    - Actual values are: 'Opened', 'Completed', 'Expired-Incomplete', etc.
    - Causes: invalid input value for enum session_status_enum: "Unclaimed"
    
  2. Fix
    - Change 'Unclaimed' to 'Opened'
    - Remove 'Active' (doesn't exist)
    - 'Opened' represents active/unclaimed sessions
*/

CREATE OR REPLACE FUNCTION get_all_active_sessions_unified(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
  session_id UUID,
  session_type TEXT,
  session_date DATE,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  company_id UUID,
  company_name TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  claimed_by_user_id UUID,
  claimed_by_name TEXT,
  expected_items INT,
  completed_items INT,
  progress_percent NUMERIC,
  session_metadata JSONB
) AS $$
BEGIN
  RETURN QUERY

  -- PART 1: Manual submission sessions
  SELECT
    ss.session_id,
    'human'::TEXT as session_type,
    ss.session_date,
    ss.site_id,
    s.name as site_name,
    ss.program_id,
    p.name as program_name,
    p.company_id,
    c.name as company_name,
    ss.session_status as status,
    ss.opened_time as started_at,
    ss.opened_by_user_id as claimed_by_user_id,
    COALESCE(u.full_name, u.email) as claimed_by_name,

    -- Expected items: from site template
    (COALESCE(s.template_expected_valid_petris, 0) +
     COALESCE(s.template_expected_valid_gasifiers, 0)) as expected_items,

    -- Completed items: actual logged
    (COALESCE(ss.valid_petris_logged, 0) +
     COALESCE(ss.valid_gasifiers_logged, 0)) as completed_items,

    -- Progress percentage
    CASE
      WHEN (COALESCE(s.template_expected_valid_petris, 0) +
            COALESCE(s.template_expected_valid_gasifiers, 0)) > 0
      THEN ROUND(
        (COALESCE(ss.valid_petris_logged, 0) + COALESCE(ss.valid_gasifiers_logged, 0))::NUMERIC /
        (COALESCE(s.template_expected_valid_petris, 0) + COALESCE(s.template_expected_valid_gasifiers, 0))::NUMERIC * 100,
        1
      )
      ELSE 0
    END as progress_percent,

    -- Metadata
    jsonb_build_object(
      'is_unclaimed', (ss.opened_by_user_id IS NULL),
      'escalated_to_user_ids', ss.escalated_to_user_ids,
      'petris_logged', ss.valid_petris_logged,
      'gasifiers_logged', ss.valid_gasifiers_logged,
      'last_activity', ss.last_activity_time
    ) as session_metadata

  FROM submission_sessions ss
  JOIN sites s ON ss.site_id = s.site_id
  JOIN pilot_programs p ON ss.program_id = p.program_id
  JOIN companies c ON p.company_id = c.company_id
  LEFT JOIN users u ON ss.opened_by_user_id = u.id
  WHERE ss.session_status = 'Opened'
    AND (p_company_id IS NULL OR p.company_id = p_company_id)

  UNION ALL

  -- PART 2: Device sessions
  SELECT
    sds.session_id,
    'device'::TEXT as session_type,
    sds.session_date,
    sds.site_id,
    s.name as site_name,
    sds.program_id,
    p.name as program_name,
    sds.company_id,
    c.name as company_name,
    sds.status::TEXT,
    sds.session_start_time as started_at,
    NULL::UUID as claimed_by_user_id,
    'Auto (Device)'::TEXT as claimed_by_name,

    -- Expected items: wake count
    sds.expected_wake_count as expected_items,

    -- Completed items: completed wake count
    sds.completed_wake_count as completed_items,

    -- Progress percentage
    CASE
      WHEN sds.expected_wake_count > 0
      THEN ROUND((sds.completed_wake_count::NUMERIC / sds.expected_wake_count::NUMERIC) * 100, 1)
      ELSE 0
    END as progress_percent,

    -- Metadata
    jsonb_build_object(
      'overage_count', sds.overage_count,
      'missed_wake_count', sds.missed_wake_count,
      'last_wake_at', sds.last_wake_at
    ) as session_metadata

  FROM site_device_sessions sds
  JOIN sites s ON sds.site_id = s.site_id
  JOIN pilot_programs p ON sds.program_id = p.program_id
  JOIN companies c ON sds.company_id = c.company_id
  WHERE sds.status = 'in_progress'
    AND (p_company_id IS NULL OR sds.company_id = p_company_id)

  ORDER BY started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_all_active_sessions_unified(UUID) IS
'Returns all active sessions (human + device) for a given company.
If company_id is NULL, returns sessions from all companies (super-admin view).
Human sessions: session_status = ''Opened''
Device sessions: status = ''in_progress''';
