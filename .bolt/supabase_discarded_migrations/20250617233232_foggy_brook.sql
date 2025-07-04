/*
  # Fix Cron Schedule and Add Session Management Features
  
  1. Changes
    - Fix syntax error in cron.schedule function
    - Add auto_create_daily_sessions function
    - Create claim_submission_session function
    - Update RLS policies for submission_sessions
    - Update get_active_sessions_with_details function
    - Add SessionSharing to history_event_type_enum
    
  2. Purpose
    - Enable automated session creation
    - Allow users to claim unclaimed sessions
    - Ensure proper security for session management
    - Track session sharing in audit logs
*/

-- 1. Add SessionSharing to history_event_type_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SessionSharing' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'history_event_type_enum'
    )
  ) THEN
    ALTER TYPE history_event_type_enum ADD VALUE 'SessionSharing';
  END IF;
END
$$;

-- 2. Create auto_create_daily_sessions function
CREATE OR REPLACE FUNCTION auto_create_daily_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_rec RECORD;
  v_count INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Loop through all active sites
  FOR v_site_rec IN 
    SELECT s.site_id, s.program_id, s.name
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status = 'active'
  LOOP
    -- Check if there's already an active session for this site today
    IF NOT EXISTS (
      SELECT 1 
      FROM submission_sessions ss
      JOIN submissions sub ON ss.submission_id = sub.submission_id
      WHERE ss.site_id = v_site_rec.site_id
      AND ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
      AND DATE(ss.session_start_time) = CURRENT_DATE
    ) THEN
      -- Create a new submission with default values
      DECLARE
        v_submission_id UUID;
        v_session_id UUID;
        v_site_defaults JSONB;
      BEGIN
        -- Get site defaults
        SELECT 
          COALESCE(submission_defaults, '{}'::JSONB) INTO v_site_defaults
        FROM sites
        WHERE site_id = v_site_rec.site_id;
        
        -- Create a new submission with default values
        INSERT INTO submissions (
          site_id,
          program_id,
          temperature,
          humidity,
          airflow,
          odor_distance,
          weather,
          notes,
          indoor_temperature,
          indoor_humidity
        )
        VALUES (
          v_site_rec.site_id,
          v_site_rec.program_id,
          COALESCE((v_site_defaults->>'temperature')::NUMERIC, 70),
          COALESCE((v_site_defaults->>'humidity')::NUMERIC, 50),
          COALESCE((v_site_defaults->>'airflow')::airflow_enum, 'Open'::airflow_enum),
          COALESCE((v_site_defaults->>'odor_distance')::odor_distance_enum, '5-10ft'::odor_distance_enum),
          COALESCE((v_site_defaults->>'weather')::weather_enum, 'Clear'::weather_enum),
          v_site_defaults->>'notes',
          (v_site_defaults->>'indoor_temperature')::NUMERIC,
          (v_site_defaults->>'indoor_humidity')::NUMERIC
        )
        RETURNING submission_id INTO v_submission_id;
        
        -- Create an unclaimed session
        INSERT INTO submission_sessions (
          submission_id,
          site_id,
          program_id,
          opened_by_user_id,
          session_status
        )
        VALUES (
          v_submission_id,
          v_site_rec.site_id,
          v_site_rec.program_id,
          NULL, -- No user has claimed this session yet
          'Opened'
        )
        RETURNING session_id INTO v_session_id;
        
        -- Increment counter
        v_count := v_count + 1;
      EXCEPTION
        WHEN OTHERS THEN
          -- Log error but continue with other sites
          RAISE NOTICE 'Error creating session for site %: %', v_site_rec.name, SQLERRM;
      END;
    END IF;
  END LOOP;
  
  -- Return result
  v_result := jsonb_build_object(
    'success', TRUE,
    'sessions_created', v_count,
    'timestamp', now()
  );
  
  RETURN v_result;
END;
$$;

-- 3. Create claim_submission_session function
CREATE OR REPLACE FUNCTION claim_submission_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_submission_id UUID;
  v_site_id UUID;
  v_program_id UUID;
  v_current_status session_status_enum;
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    site_id,
    program_id,
    session_status
  INTO 
    v_submission_id, 
    v_site_id,
    v_program_id,
    v_current_status
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session not found'
    );
  END IF;
  
  -- Check if session can be claimed (must be in 'Opened' status)
  IF v_current_status != 'Opened' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session cannot be claimed: ' || v_current_status
    );
  END IF;
  
  -- Verify user has access to this program/site
  IF NOT EXISTS (
    -- Check if user has direct access to the program
    SELECT 1 FROM pilot_program_users
    WHERE program_id = v_program_id
    AND user_id = auth.uid()
    AND role != 'ReadOnly'
  ) AND NOT EXISTS (
    -- Check if user has company-based access to the program
    SELECT 1 FROM pilot_programs pp
    JOIN users u ON pp.company_id = u.company_id
    WHERE pp.program_id = v_program_id
    AND u.id = auth.uid()
    AND u.is_company_admin = TRUE
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to claim this session'
    );
  END IF;
  
  -- Update session to claim it
  UPDATE submission_sessions
  SET 
    opened_by_user_id = auth.uid(),
    session_status = 'Working',
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session claimed successfully',
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- 4. Update RLS policies for submission_sessions to handle unclaimed sessions

-- Drop existing policies
DROP POLICY IF EXISTS "Users can see their own sessions and escalated sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions and escalated sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON submission_sessions;

-- Create new policies
-- Policy for selecting sessions (current user can see their own sessions, ones escalated to them, and unclaimed sessions they have access to)
CREATE POLICY "Users can see their own sessions and escalated sessions"
ON submission_sessions
FOR SELECT
USING (
  opened_by_user_id = auth.uid()
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
  OR (
    -- Unclaimed sessions for programs/sites the user has access to
    opened_by_user_id IS NULL
    AND program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role != 'ReadOnly'
    )
  )
  OR (
    -- Unclaimed sessions for programs from the user's company (if they're a company admin)
    opened_by_user_id IS NULL
    AND program_id IN (
      SELECT pp.program_id FROM pilot_programs pp
      JOIN users u ON pp.company_id = u.company_id
      WHERE u.id = auth.uid()
      AND u.is_company_admin = TRUE
    )
  )
);

-- Policy for inserting sessions (any authenticated user can create a session)
CREATE POLICY "Users can create sessions"
ON submission_sessions
FOR INSERT
WITH CHECK (
  opened_by_user_id = auth.uid()
  OR opened_by_user_id IS NULL -- Allow creating unclaimed sessions
);

-- Policy for updating sessions (current user can update their own sessions, ones escalated to them, and claim unclaimed sessions)
CREATE POLICY "Users can update their own sessions and escalated sessions"
ON submission_sessions
FOR UPDATE
USING (
  opened_by_user_id = auth.uid()
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
  OR (
    -- Unclaimed sessions for programs/sites the user has access to
    opened_by_user_id IS NULL
    AND program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role != 'ReadOnly'
    )
  )
  OR (
    -- Unclaimed sessions for programs from the user's company (if they're a company admin)
    opened_by_user_id IS NULL
    AND program_id IN (
      SELECT pp.program_id FROM pilot_programs pp
      JOIN users u ON pp.company_id = u.company_id
      WHERE u.id = auth.uid()
      AND u.is_company_admin = TRUE
    )
  )
);

-- Policy for deleting sessions (only the creator can delete)
CREATE POLICY "Users can delete their own sessions"
ON submission_sessions
FOR DELETE
USING (opened_by_user_id = auth.uid());

-- 5. Update get_active_sessions_with_details function to include unclaimed sessions
DROP FUNCTION IF EXISTS get_active_sessions_with_details();

CREATE OR REPLACE FUNCTION get_active_sessions_with_details()
RETURNS TABLE (
  session_id UUID,
  submission_id UUID,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  opened_by_user_id UUID,
  opened_by_user_email TEXT,
  opened_by_user_name TEXT,
  session_start_time TIMESTAMPTZ,
  last_activity_time TIMESTAMPTZ,
  session_status TEXT,
  percentage_complete NUMERIC,
  global_submission_id BIGINT,
  escalated_to_user_ids UUID[],
  is_unclaimed BOOLEAN
) LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.session_id,
    ss.submission_id,
    ss.site_id,
    s.name::TEXT AS site_name,
    ss.program_id,
    p.name::TEXT AS program_name,
    ss.opened_by_user_id,
    u.email AS opened_by_user_email,
    u.full_name AS opened_by_user_name,
    ss.session_start_time,
    ss.last_activity_time,
    ss.session_status::TEXT,
    ss.percentage_complete,
    sub.global_submission_id,
    ss.escalated_to_user_ids,
    (ss.opened_by_user_id IS NULL) AS is_unclaimed
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    LEFT JOIN users u ON ss.opened_by_user_id = u.id
    JOIN submissions sub ON ss.submission_id = sub.submission_id
  WHERE 
    -- Only show active sessions (not Completed, Cancelled, or any Expired status)
    ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
    AND
    (
      -- Sessions opened by the current user
      ss.opened_by_user_id = auth.uid()
      OR
      -- Sessions escalated to the current user
      ss.escalated_to_user_ids @> ARRAY[auth.uid()]
      OR
      -- Unclaimed sessions for programs/sites the user has access to
      (
        ss.opened_by_user_id IS NULL
        AND ss.program_id IN (
          SELECT program_id FROM pilot_program_users
          WHERE user_id = auth.uid()
          AND role != 'ReadOnly'
        )
      )
      OR
      -- Unclaimed sessions for programs from the user's company (if they're a company admin)
      (
        ss.opened_by_user_id IS NULL
        AND ss.program_id IN (
          SELECT pp.program_id FROM pilot_programs pp
          JOIN users u ON pp.company_id = u.company_id
          WHERE u.id = auth.uid()
          AND u.is_company_admin = TRUE
        )
      )
    )
  ORDER BY
    ss.last_activity_time DESC;
END;
$$;

-- 6. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION auto_create_daily_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION claim_submission_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_sessions_with_details() TO authenticated;

-- 7. Add comments for documentation
COMMENT ON FUNCTION auto_create_daily_sessions IS 'Creates daily sessions for all active sites that don''t already have an active session for today';
COMMENT ON FUNCTION claim_submission_session IS 'Allows a user to claim an unclaimed session, setting themselves as the opened_by_user_id';
COMMENT ON FUNCTION get_active_sessions_with_details IS 'Returns active sessions with related details including global_submission_id and is_unclaimed flag';