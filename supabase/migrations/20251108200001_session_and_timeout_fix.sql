/*
  # Fix Session and Timeout Tracking Migration

  This migration safely adds all session and timeout tracking features.
  It's designed to be idempotent and won't fail if tables already exist.
*/

-- =====================================================
-- 1. CREATE device_sessions TABLE
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'device_sessions') THEN
    CREATE TABLE device_sessions (
      session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id uuid NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      session_start_time timestamptz NOT NULL DEFAULT now(),
      session_end_time timestamptz,
      next_wake_time timestamptz,
      session_duration_seconds integer,
      session_status text NOT NULL DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'timeout', 'error')),
      images_transmitted integer DEFAULT 0,
      images_failed integer DEFAULT 0,
      chunks_sent integer DEFAULT 0,
      chunks_retried integer DEFAULT 0,
      session_metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE INDEX idx_device_sessions_device ON device_sessions(device_id);
    CREATE INDEX idx_device_sessions_start_time ON device_sessions(session_start_time DESC);
    CREATE INDEX idx_device_sessions_status ON device_sessions(session_status);
    CREATE INDEX idx_device_sessions_next_wake ON device_sessions(next_wake_time);
  END IF;
END $$;

-- =====================================================
-- 2. ADD session_id TO device_history
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_history' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE device_history ADD COLUMN session_id uuid REFERENCES device_sessions(session_id) ON DELETE SET NULL;
    CREATE INDEX idx_device_history_session ON device_history(session_id);
  END IF;
END $$;

-- =====================================================
-- 3. ADD retry tracking TO device_images
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE device_images ADD COLUMN retry_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE device_images ADD COLUMN max_retries integer DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'failed_at'
  ) THEN
    ALTER TABLE device_images ADD COLUMN failed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'timeout_reason'
  ) THEN
    ALTER TABLE device_images ADD COLUMN timeout_reason text;
  END IF;
END $$;

-- =====================================================
-- 4. CREATE device_commands TABLE (Command Queue)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'device_commands') THEN
    CREATE TABLE device_commands (
      command_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id uuid NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      command_type text NOT NULL CHECK (command_type IN ('retry_image', 'capture_image', 'update_config', 'resend_chunks')),
      command_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      priority integer DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'acknowledged', 'completed', 'failed', 'cancelled')),
      scheduled_for timestamptz,
      published_at timestamptz,
      acknowledged_at timestamptz,
      completed_at timestamptz,
      expires_at timestamptz,
      retry_count integer DEFAULT 0,
      max_retries integer DEFAULT 3,
      error_message text,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE INDEX idx_device_commands_device ON device_commands(device_id);
    CREATE INDEX idx_device_commands_status ON device_commands(status);
    CREATE INDEX idx_device_commands_scheduled ON device_commands(scheduled_for);
    CREATE INDEX idx_device_commands_priority ON device_commands(priority DESC);
  END IF;
END $$;

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

-- device_sessions policies
DO $$
BEGIN
  ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can view sessions for devices they have access to" ON device_sessions;
CREATE POLICY "Users can view sessions for devices they have access to"
  ON device_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices d
      JOIN sites s ON d.site_id = s.site_id
      WHERE d.device_id = device_sessions.device_id
      AND s.company_id IN (
        SELECT company_id FROM user_company_roles WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "System can manage all sessions" ON device_sessions;
CREATE POLICY "System can manage all sessions"
  ON device_sessions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_company_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- device_commands policies
DO $$
BEGIN
  ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can view commands for their devices" ON device_commands;
CREATE POLICY "Users can view commands for their devices"
  ON device_commands FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices d
      JOIN sites s ON d.site_id = s.site_id
      WHERE d.device_id = device_commands.device_id
      AND s.company_id IN (
        SELECT company_id FROM user_company_roles WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins can create commands" ON device_commands;
CREATE POLICY "Admins can create commands"
  ON device_commands FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_company_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "System can update commands" ON device_commands;
CREATE POLICY "System can update commands"
  ON device_commands FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_company_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 6. FUNCTIONS
-- =====================================================

-- Function: Create or get current device session
CREATE OR REPLACE FUNCTION create_device_session(
  p_device_id uuid,
  p_next_wake_time timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_last_session_id uuid;
BEGIN
  -- Close any active sessions for this device
  UPDATE device_sessions
  SET
    session_status = 'completed',
    session_end_time = now(),
    session_duration_seconds = EXTRACT(EPOCH FROM (now() - session_start_time))::integer,
    updated_at = now()
  WHERE device_id = p_device_id
    AND session_status = 'active'
  RETURNING session_id INTO v_last_session_id;

  -- Create new session
  INSERT INTO device_sessions (
    device_id,
    session_start_time,
    next_wake_time,
    session_status
  ) VALUES (
    p_device_id,
    now(),
    p_next_wake_time,
    'active'
  )
  RETURNING session_id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- Function: Timeout stale images based on next wake schedule
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
    timeout_reason = 'Transmission not completed before next wake window',
    updated_at = now()
  FROM devices d
  WHERE di.device_id = d.device_id
    AND di.status = 'receiving'
    AND d.next_wake_at IS NOT NULL
    AND now() >= d.next_wake_at
    AND di.retry_count < di.max_retries
  RETURNING di.device_id, di.image_id, di.image_name, true;
END;
$$;

-- Function: Queue image retry command
CREATE OR REPLACE FUNCTION queue_image_retry(
  p_device_id uuid,
  p_image_id uuid,
  p_image_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_command_id uuid;
  v_next_wake timestamptz;
BEGIN
  -- Get next wake time
  SELECT next_wake_at INTO v_next_wake
  FROM devices
  WHERE device_id = p_device_id;

  -- Create retry command
  INSERT INTO device_commands (
    device_id,
    command_type,
    command_payload,
    priority,
    scheduled_for,
    expires_at
  ) VALUES (
    p_device_id,
    'retry_image',
    jsonb_build_object(
      'image_id', p_image_id,
      'image_name', p_image_name,
      'action', 'resend_all_chunks'
    ),
    8,
    v_next_wake - interval '5 minutes',
    v_next_wake + interval '1 hour'
  )
  RETURNING command_id INTO v_command_id;

  -- Increment retry count
  UPDATE device_images
  SET retry_count = retry_count + 1
  WHERE image_id = p_image_id;

  RETURN v_command_id;
END;
$$;

-- Function: Auto-create session on device hello
CREATE OR REPLACE FUNCTION handle_device_hello()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_next_wake timestamptz;
BEGIN
  -- Only process 'alive' events
  IF NEW.event_type = 'device_online' OR NEW.event_type = 'device_hello' THEN
    -- Get next wake from device
    SELECT next_wake_at INTO v_next_wake
    FROM devices
    WHERE device_id = NEW.device_id;

    -- Create session
    v_session_id := create_device_session(NEW.device_id, v_next_wake);

    -- Link this event to session
    NEW.session_id := v_session_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Auto-create sessions
DROP TRIGGER IF EXISTS trigger_create_session_on_hello ON device_history;
CREATE TRIGGER trigger_create_session_on_hello
  BEFORE INSERT ON device_history
  FOR EACH ROW
  EXECUTE FUNCTION handle_device_hello();

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON FUNCTION timeout_stale_images IS 'Called by edge function to timeout images that did not complete before next wake window';
COMMENT ON FUNCTION queue_image_retry IS 'Queue retry command for failed image to be processed on next device wake';
COMMENT ON TABLE device_sessions IS 'Each wake window (wake to sleep) is a session with associated events and images';
COMMENT ON TABLE device_commands IS 'Command queue for devices - commands are published before device wakes';
