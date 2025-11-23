/*
  # Backfill Session Wake Counts

  This query recalculates wake counts for existing sessions based on
  device_wake_payloads records that already exist.

  Run this AFTER applying the session-rollup-triggers-FIXED.sql migration.
*/

-- Backfill session wake counts from existing wake_payloads
UPDATE site_device_sessions s
SET
  completed_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.payload_status = 'complete'
  ),
  failed_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.payload_status = 'failed'
  ),
  extra_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.overage_flag = true
  ),
  -- Also update status if there are any wakes and still pending
  status = CASE
    WHEN status = 'pending' AND EXISTS (
      SELECT 1 FROM device_wake_payloads w
      WHERE w.site_device_session_id = s.session_id
    ) THEN 'in_progress'
    ELSE status
  END
WHERE session_date >= '2025-11-01'; -- Only recent sessions

-- Show results
SELECT
  session_date,
  status,
  expected_wake_count,
  completed_wake_count,
  failed_wake_count,
  extra_wake_count,
  (completed_wake_count + failed_wake_count + extra_wake_count) as total_wakes
FROM site_device_sessions
WHERE session_date >= '2025-11-01'
ORDER BY session_date DESC
LIMIT 10;
