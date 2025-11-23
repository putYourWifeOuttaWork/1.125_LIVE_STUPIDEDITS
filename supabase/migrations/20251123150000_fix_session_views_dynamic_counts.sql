-- Fix vw_site_day_sessions to calculate counts dynamically from device_wake_payloads
-- Instead of using the stored counters, aggregate the actual payload data
-- IMPORTANT: Keep exact column order to avoid PostgreSQL rename detection

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
  -- Calculate actual counts from device_wake_payloads (replaces stored values)
  -- Cast to integer to match original column type
  COALESCE(
    (SELECT COUNT(*)::integer
     FROM device_wake_payloads dwp
     WHERE dwp.site_device_session_id = sds.session_id
       AND dwp.payload_status = 'complete'
       AND dwp.overage_flag = false
    ), 0
  ) as completed_wake_count,
  COALESCE(
    (SELECT COUNT(*)::integer
     FROM device_wake_payloads dwp
     WHERE dwp.site_device_session_id = sds.session_id
       AND dwp.payload_status = 'failed'
    ), 0
  ) as failed_wake_count,
  COALESCE(
    (SELECT COUNT(*)::integer
     FROM device_wake_payloads dwp
     WHERE dwp.site_device_session_id = sds.session_id
       AND dwp.overage_flag = true
    ), 0
  ) as extra_wake_count,
  si.name as site_name,
  COALESCE(si.timezone, 'UTC') as timezone,
  0 as active_device_count
FROM public.site_device_sessions sds
JOIN public.sites si ON si.site_id = sds.site_id;

COMMENT ON VIEW public.vw_site_day_sessions IS
'Session view with dynamically calculated wake counts from device_wake_payloads. This ensures UI always shows accurate real-time counts based on actual payload data rather than potentially stale trigger-updated counters.';
