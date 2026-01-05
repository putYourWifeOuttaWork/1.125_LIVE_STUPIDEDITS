/*
  # Add Stale Image Cleanup Functions

  1. New Functions
    - clear_stale_receiving_images() - Auto-clear images stuck in receiving state for 1+ hours
    - manually_clear_stale_images(device_id, age_hours) - Manual clear for specific device
*/

-- Function: Auto-clear stale receiving images (1-hour timeout)
CREATE OR REPLACE FUNCTION clear_stale_receiving_images()
RETURNS TABLE (
  device_id uuid,
  image_id uuid,
  image_name text,
  received_chunks integer,
  total_chunks integer,
  age_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE device_images di
  SET
    status = 'failed',
    failed_at = now(),
    timeout_reason = 'Stale receiving state - no progress after 1 hour',
    updated_at = now()
  WHERE di.status IN ('receiving', 'pending')
    AND di.updated_at < (now() - interval '1 hour')
    AND di.status != 'complete'
    AND di.status != 'failed'
  RETURNING
    di.device_id,
    di.image_id,
    di.image_name,
    di.received_chunks,
    di.total_chunks,
    EXTRACT(EPOCH FROM (now() - di.updated_at))::integer / 60 as age_minutes;
END;
$$;

-- Function: Manually clear stale images for a device
CREATE OR REPLACE FUNCTION manually_clear_stale_images(
  p_device_id uuid,
  p_age_hours integer DEFAULT 1
)
RETURNS TABLE (
  count bigint,
  cleared_images jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleared_count bigint;
  v_cleared_list jsonb;
BEGIN
  -- Clear stale images and collect results
  WITH cleared AS (
    UPDATE device_images
    SET
      status = 'failed',
      failed_at = now(),
      timeout_reason = 'Manually cleared by user',
      updated_at = now()
    WHERE device_id = p_device_id
      AND status IN ('receiving', 'pending')
      AND updated_at < (now() - (p_age_hours || ' hours')::interval)
    RETURNING
      image_id,
      image_name,
      received_chunks,
      total_chunks,
      EXTRACT(EPOCH FROM (now() - updated_at))::integer / 60 as age_minutes
  )
  SELECT
    COUNT(*)::bigint,
    jsonb_agg(
      jsonb_build_object(
        'image_id', image_id,
        'image_name', image_name,
        'received_chunks', received_chunks,
        'total_chunks', total_chunks,
        'age_minutes', age_minutes
      )
    )
  INTO v_cleared_count, v_cleared_list
  FROM cleared;

  -- Return results
  RETURN QUERY
  SELECT v_cleared_count, COALESCE(v_cleared_list, '[]'::jsonb);
END;
$$;
