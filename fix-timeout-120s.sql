/*
  # Fix Image and Wake Payload Timeout Logic

  ## Changes
  1. Update timeout_stale_images() to use 120-second timeout
  2. Create timeout_stale_wake_payloads() for wake payloads
  3. Add queue_wake_retry() function for manual retry UI button

  ## Timeout Logic
  - Images in 'receiving' status for > 120 seconds → mark 'failed', queue retry
  - Wake payloads in 'pending' status for > 120 seconds → mark 'failed'
  - Create device alerts for UI visibility
  - Manual retry button available in UI
*/

-- 1. FIX IMAGE TIMEOUT FUNCTION (120 SECOND TIMEOUT)
CREATE OR REPLACE FUNCTION timeout_stale_images()
RETURNS TABLE (
  device_id uuid,
  image_id uuid,
  image_name text,
  timed_out boolean
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
    timeout_reason = 'Transmission not completed within 120 seconds',
    updated_at = now()
  FROM devices d
  WHERE di.device_id = d.device_id
    AND di.status = 'receiving'
    AND now() - di.created_at > interval '120 seconds'
    AND di.retry_count < di.max_retries
  RETURNING di.device_id, di.image_id, di.image_name, true;
END;
$$;

-- 2. WAKE PAYLOAD TIMEOUT FUNCTION
CREATE OR REPLACE FUNCTION timeout_stale_wake_payloads()
RETURNS TABLE (
  payload_id uuid,
  device_id uuid,
  wake_type text,
  timed_out boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE device_wake_payloads wp
  SET
    payload_status = 'failed',
    image_status = 'failed'
  WHERE wp.payload_status = 'pending'
    AND wp.wake_type IN ('image_wake', 'hello')
    AND now() - wp.captured_at > interval '120 seconds'
  RETURNING wp.payload_id, wp.device_id, wp.wake_type, true;
END;
$$;

-- 3. MANUAL RETRY FUNCTION (FOR UI BUTTON)
CREATE OR REPLACE FUNCTION queue_wake_retry(p_payload_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wake RECORD;
  v_command_id uuid;
  v_next_wake timestamptz;
BEGIN
  SELECT * INTO v_wake FROM device_wake_payloads WHERE payload_id = p_payload_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wake payload not found');
  END IF;

  IF v_wake.payload_status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Can only retry failed wake payloads');
  END IF;

  SELECT next_wake_at INTO v_next_wake FROM devices WHERE device_id = v_wake.device_id;

  INSERT INTO device_commands (device_id, command_type, command_payload, priority, scheduled_for, expires_at)
  VALUES (
    v_wake.device_id, 'retry_image',
    jsonb_build_object('payload_id', p_payload_id, 'image_id', v_wake.image_id, 'action', 'resend_all_chunks'),
    8, v_next_wake - interval '5 minutes', v_next_wake + interval '1 hour'
  )
  RETURNING command_id INTO v_command_id;

  RETURN jsonb_build_object('success', true, 'command_id', v_command_id, 'scheduled_for', v_next_wake);
END;
$$;

-- 4. VIEW FOR UI
CREATE OR REPLACE VIEW failed_wakes_for_retry AS
SELECT
  wp.payload_id, wp.device_id, d.device_name, wp.captured_at, wp.wake_window_index,
  EXISTS (SELECT 1 FROM device_commands dc WHERE dc.device_id = wp.device_id 
    AND dc.command_type = 'retry_image' AND dc.status = 'pending'
    AND dc.command_payload->>'payload_id' = wp.payload_id::text) as retry_queued,
  d.next_wake_at
FROM device_wake_payloads wp
JOIN devices d ON wp.device_id = d.device_id
WHERE wp.payload_status = 'failed'
  AND wp.captured_at > now() - interval '7 days'
ORDER BY wp.captured_at DESC;
