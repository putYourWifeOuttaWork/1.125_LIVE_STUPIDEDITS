-- Check image-wake linkage issue
SELECT 
  'WAKE PAYLOADS' as type,
  COUNT(*) as total,
  COUNT(image_id) as with_image,
  COUNT(*) - COUNT(image_id) as missing_image
FROM device_wake_payloads
WHERE captured_at >= '2025-11-23';

SELECT 
  'IMAGES' as type,
  COUNT(*) as total
FROM device_images
WHERE created_at >= '2025-11-23';
