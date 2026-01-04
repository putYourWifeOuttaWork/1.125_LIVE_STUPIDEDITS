/*
  # Backfill Snapshot Aggregates

  This script recalculates and updates aggregate metrics for all existing snapshots
  that have NULL values for avg_temperature, avg_humidity, avg_mgi, or max_mgi.

  Run this AFTER applying the 20260104_fix_snapshot_aggregates.sql migration.

  ## What it does
  - Identifies snapshots with missing aggregate data
  - Recalculates averages from device_telemetry and device_images
  - Updates snapshots with the calculated values

  ## Safety
  - Only updates snapshots with NULL aggregate values
  - Uses the same calculation logic as the updated function
  - Can be run multiple times safely (idempotent)
*/

-- Update snapshots with aggregate data
UPDATE session_wake_snapshots sws
SET
  avg_temperature = agg.avg_temp,
  avg_humidity = agg.avg_humid,
  avg_mgi = agg.avg_mgi,
  max_mgi = agg.max_mgi
FROM (
  SELECT
    sws.snapshot_id,
    (
      SELECT AVG(dt.temperature)::numeric(5,2)
      FROM device_telemetry dt
      INNER JOIN devices d ON dt.device_id = d.device_id
      WHERE d.site_id = sws.site_id
        AND d.is_active = true
        AND dt.captured_at BETWEEN sws.wake_round_start AND sws.wake_round_end
        AND dt.temperature IS NOT NULL
    ) as avg_temp,
    (
      SELECT AVG(dt.humidity)::numeric(5,2)
      FROM device_telemetry dt
      INNER JOIN devices d ON dt.device_id = d.device_id
      WHERE d.site_id = sws.site_id
        AND d.is_active = true
        AND dt.captured_at BETWEEN sws.wake_round_start AND sws.wake_round_end
        AND dt.humidity IS NOT NULL
    ) as avg_humid,
    (
      SELECT AVG(di.mgi_score)::numeric(5,2)
      FROM device_images di
      INNER JOIN devices d ON di.device_id = d.device_id
      WHERE d.site_id = sws.site_id
        AND d.is_active = true
        AND di.captured_at BETWEEN sws.wake_round_start AND sws.wake_round_end
        AND di.mgi_score IS NOT NULL
    ) as avg_mgi,
    (
      SELECT MAX(di.mgi_score)::numeric(5,2)
      FROM device_images di
      INNER JOIN devices d ON di.device_id = d.device_id
      WHERE d.site_id = sws.site_id
        AND d.is_active = true
        AND di.captured_at BETWEEN sws.wake_round_start AND sws.wake_round_end
        AND di.mgi_score IS NOT NULL
    ) as max_mgi
  FROM session_wake_snapshots sws
  WHERE sws.avg_temperature IS NULL
     OR sws.avg_humidity IS NULL
     OR sws.avg_mgi IS NULL
     OR sws.max_mgi IS NULL
) agg
WHERE sws.snapshot_id = agg.snapshot_id;

-- Report results
SELECT
  COUNT(*) FILTER (WHERE avg_temperature IS NOT NULL) as snapshots_with_temperature,
  COUNT(*) FILTER (WHERE avg_humidity IS NOT NULL) as snapshots_with_humidity,
  COUNT(*) FILTER (WHERE avg_mgi IS NOT NULL) as snapshots_with_mgi,
  COUNT(*) FILTER (WHERE max_mgi IS NOT NULL) as snapshots_with_max_mgi,
  COUNT(*) as total_snapshots
FROM session_wake_snapshots;
