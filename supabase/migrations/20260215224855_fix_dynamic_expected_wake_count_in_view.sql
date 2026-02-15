/*
  # Fix dynamic expected wake count in session view

  1. Changes
    - Updates `vw_site_day_sessions` to dynamically calculate `expected_wake_count`
      from active device assignments and their cron schedules, instead of reading
      the stale static column set at session creation time
    - Adds `program_name` and `company_name` columns to the view for frontend convenience
    - Also dynamically computes `active_device_count` from actual assignments

  2. Problem
    - `expected_wake_count` was set once at session creation by `fn_midnight_session_opener()`
    - If devices were not yet assigned/active at that moment, the count stayed 0 forever
    - This caused displays like "409 / 0 wakes" with a misleading "Behind Schedule" badge

  3. Solution
    - The view now sums `fn_parse_cron_wake_count(d.wake_schedule_cron)` across all
      active devices currently assigned to each site
    - This ensures the expected count always reflects the current device configuration

  4. Backfill
    - Also updates the raw `expected_wake_count` column on current in_progress sessions
      so other consumers of the raw table also see correct values
*/

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
  COALESCE(
    (SELECT SUM(fn_parse_cron_wake_count(d.wake_schedule_cron))::integer
     FROM devices d
     JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
     WHERE dsa.site_id = sds.site_id
       AND dsa.is_active = true
       AND d.is_active = true
    ), 0
  ) as expected_wake_count,
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
  COALESCE(
    (SELECT COUNT(*)::integer
     FROM device_site_assignments dsa2
     JOIN devices d2 ON d2.device_id = dsa2.device_id
     WHERE dsa2.site_id = sds.site_id
       AND dsa2.is_active = true
       AND d2.is_active = true
    ), 0
  ) as active_device_count,
  pp.name as program_name,
  co.name as company_name
FROM public.site_device_sessions sds
JOIN public.sites si ON si.site_id = sds.site_id
LEFT JOIN public.pilot_programs pp ON pp.program_id = sds.program_id
LEFT JOIN public.companies co ON co.company_id = sds.company_id;

COMMENT ON VIEW public.vw_site_day_sessions IS
'Session view with dynamically calculated wake counts. expected_wake_count is computed from current active device assignments and their cron schedules. completed/failed/extra counts come from device_wake_payloads.';

-- Backfill: update the raw table column for current sessions
UPDATE site_device_sessions sds
SET expected_wake_count = COALESCE(
  (SELECT SUM(fn_parse_cron_wake_count(d.wake_schedule_cron))::integer
   FROM devices d
   JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
   WHERE dsa.site_id = sds.site_id
     AND dsa.is_active = true
     AND d.is_active = true
  ), 0
)
WHERE sds.status IN ('pending', 'in_progress')
  AND sds.expected_wake_count = 0;
