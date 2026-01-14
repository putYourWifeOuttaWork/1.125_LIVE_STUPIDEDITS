-- ==========================================
-- Quick Diagnostic: Show Image Duplicates
-- ==========================================
-- Run this to see what duplicates exist before cleanup

-- Count of duplicate pairs
SELECT
  COUNT(*) as duplicate_pairs,
  SUM(duplicate_count - 1) as extra_records_to_delete
FROM (
  SELECT device_id, image_name, COUNT(*) as duplicate_count
  FROM device_images
  GROUP BY device_id, image_name
  HAVING COUNT(*) > 1
) duplicates;

-- Show all duplicates with details
SELECT
  d.device_code,
  d.device_name,
  di.image_name,
  COUNT(*) as duplicate_count,
  STRING_AGG(di.status, ', ' ORDER BY di.updated_at DESC) as statuses,
  MAX(di.updated_at) as most_recent_update
FROM device_images di
JOIN devices d ON di.device_id = d.device_id
WHERE (di.device_id, di.image_name) IN (
  SELECT device_id, image_name
  FROM device_images
  GROUP BY device_id, image_name
  HAVING COUNT(*) > 1
)
GROUP BY d.device_code, d.device_name, di.image_name
ORDER BY duplicate_count DESC, most_recent_update DESC;

-- Detailed view of each duplicate record
SELECT
  d.device_code,
  di.image_name,
  di.image_id,
  di.status,
  di.received_chunks || '/' || di.total_chunks as progress,
  di.captured_at,
  di.updated_at,
  di.image_url IS NOT NULL as has_url
FROM device_images di
JOIN devices d ON di.device_id = d.device_id
WHERE (di.device_id, di.image_name) IN (
  SELECT device_id, image_name
  FROM device_images
  GROUP BY device_id, image_name
  HAVING COUNT(*) > 1
)
ORDER BY d.device_code, di.image_name, di.updated_at DESC;
