/*
  # Fix Lab Views - Add Real Timezone

  Updates vw_site_day_sessions view to use the actual timezone from sites table
  instead of hardcoded 'UTC'.

  ## Changes
  1. Update vw_site_day_sessions to use COALESCE(si.timezone, 'UTC')
*/

-- Update vw_site_day_sessions to use actual timezone from sites table
CREATE OR REPLACE VIEW public.vw_site_day_sessions
WITH (security_invoker = true)
AS
SELECT
  sds.session_id,
  sds.company_id,
  sds.program_id,
  sds.site_id,
  sds.session_date,
  sds.session_start_time,
  sds.session_end_time,
  sds.status,
  sds.expected_wake_count,
  sds.completed_wake_count,
  sds.failed_wake_count,
  sds.extra_wake_count,
  si.name as site_name,
  COALESCE(si.timezone, 'UTC') as timezone,
  0 as active_device_count
FROM public.site_device_sessions sds
JOIN public.sites si ON si.site_id = sds.site_id;
