-- This migration fixes the syntax error in the cron.schedule function call
-- and adds the necessary functions for session management

-- 1. Create the auto_create_daily_sessions function
CREATE OR REPLACE FUNCTION auto_create_daily_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_rec RECORD;
  v_submission_id UUID;
  v_session_id UUID;
  v_session_count INTEGER := 0;
  v_result JSONB;
  v_site_timezone TEXT;
  v_site_defaults JSONB;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Loop through all active sites in active programs
  FOR v_site_rec IN 
    SELECT s.site_id, s.program_id, s.name, s.timezone, s.submission_defaults
    FROM sites s
    JOIN pilot_programs pp ON s.program_id = pp.program_id
    WHERE pp.status = 'active'
  LOOP
    -- Skip if a session already exists for this site today
    IF EXISTS (
      SELECT 1 
      FROM submission_sessions ss
      JOIN submissions sub ON ss.submission_id = sub.submission_id
      WHERE ss.site_id = v_site_rec.site_id
      AND DATE(sub.created_at) = v_today
    ) THEN
      CONTINUE;
    END IF;
    
    -- Get site timezone and defaults
    v_site_timezone := v_site_rec.timezone;
    v_site_defaults := v_site_rec.submission_defaults;
    
    -- Create default submission data if site has defaults
    IF v_site_defaults IS NULL THEN
      v_site_defaults := jsonb_build_object(
        'temperature', 70,
        'humidity', 50,
        'airflow', 'Open',
        'odor_distance', '5-10ft',
        'weather', 'Clear'
      );
    END IF;
    
    -- Create a new submission
    INSERT INTO submissions (
      site_id,
      program_id,
      temperature,
      humidity,
      airflow,
      odor_distance,
      weather,
      notes,
      created_by,
      indoor_temperature,
      indoor_humidity,
      submission_timezone
    )
    VALUES (
      v_site_rec.site_id,
      v_site_rec.program_id,
      COALESCE((v_site_defaults->>'temperature')::NUMERIC, 70),
      COALESCE((v_site_defaults->>'humidity')::NUMERIC, 50),
      COALESCE((v_site_defaults->>'airflow')::airflow_enum, 'Open'),
      COALESCE((v_site_defaults->>'odor_distance')::odor_distance_enum, '5-10ft'),
      COALESCE((v_site_defaults->>'weather')::weather_enum, 'Clear'),
      v_site_defaults->>'notes',
      NULL, -- No specific user created this
      (v_site_defaults->>'indoor_temperature')::NUMERIC,
      (v_site_defaults->>'indoor_humidity')::NUMERIC,
      v_site_timezone
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
      NULL, -- No specific user opened this
      'Opened'
    )
    RETURNING session_id INTO v_session_id;
    
    -- Increment the session count
    v_session_count := v_session_count + 1;
  END LOOP;
  
  -- Return the result
  v_result := jsonb_build_object(
    'success', TRUE,
    'sessions_created', v_session_count,
    'timestamp', now()
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM,
      'timestamp', now()
    );
END;
$$;

-- 2. Create the claim_submission_session function
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
  v_opened_by_user_id UUID;
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    site_id, 
    program_id,
    session_status,
    opened_by_user_id
  INTO 
    v_submission_id, 
    v_site_id, 
    v_program_id,
    v_current_status,
    v_opened_by_user_id
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Session not found');
  END IF;
  
  -- Check if session can be claimed (must be in 'Opened' status and have NULL opened_by_user_id)
  IF v_current_status != 'Opened' OR v_opened_by_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE, 
      'message', 'Session cannot be claimed. It is either already claimed or not in the correct state.'
    );
  END IF;
  
  -- Verify user has permission to claim this session (must have access to the program)
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = v_program_id
    AND user_id = auth.uid()
    AND role != 'ReadOnly'
  ) AND NOT EXISTS (
    -- Or user is a company admin for this program
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

-- 3. Update the get_active_sessions_with_details function to include unclaimed sessions
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
  -- First, get active sessions (those opened by or escalated to the current user)
  RETURN QUERY
  SELECT 
    ss.session_id,
    ss.submission_id,
    ss.site_id,
    s.name::TEXT AS site_name,
    ss.program_id,
    p.name::TEXT AS program_name,
    ss.opened_by_user_id,
    COALESCE(u.email, '') AS opened_by_user_email,
    COALESCE(u.full_name, '') AS opened_by_user_name,
    ss.session_start_time,
    ss.last_activity_time,
    ss.session_status::TEXT,
    ss.percentage_complete,
    sub.global_submission_id,
    ss.escalated_to_user_ids,
    FALSE AS is_unclaimed -- These are claimed sessions
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    LEFT JOIN users u ON ss.opened_by_user_id = u.id
    JOIN submissions sub ON ss.submission_id = sub.submission_id
  WHERE 
    -- Only show active sessions (not Completed, Cancelled, or any Expired status)
    ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
    AND ss.opened_by_user_id IS NOT NULL -- Must have an opener
    AND
    (
      -- Sessions opened by the current user
      ss.opened_by_user_id = auth.uid()
      OR
      -- Sessions escalated to the current user
      ss.escalated_to_user_ids @> ARRAY[auth.uid()]
    )
  
  UNION ALL
  
  -- Then, get unclaimed sessions for sites the user has access to
  SELECT 
    ss.session_id,
    ss.submission_id,
    ss.site_id,
    s.name::TEXT AS site_name,
    ss.program_id,
    p.name::TEXT AS program_name,
    ss.opened_by_user_id,
    '' AS opened_by_user_email, -- No opener for unclaimed sessions
    '' AS opened_by_user_name,  -- No opener for unclaimed sessions
    ss.session_start_time,
    ss.last_activity_time,
    ss.session_status::TEXT,
    ss.percentage_complete,
    sub.global_submission_id,
    ss.escalated_to_user_ids,
    TRUE AS is_unclaimed -- These are unclaimed sessions
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    JOIN submissions sub ON ss.submission_id = sub.submission_id
  WHERE 
    ss.session_status = 'Opened'
    AND ss.opened_by_user_id IS NULL -- Unclaimed sessions have NULL opener
    AND
    (
      -- User has access to the program via pilot_program_users
      EXISTS (
        SELECT 1 FROM pilot_program_users
        WHERE program_id = ss.program_id
        AND user_id = auth.uid()
        AND role != 'ReadOnly' -- Only non-ReadOnly users can claim sessions
      )
      OR
      -- User is a company admin for this program
      EXISTS (
        SELECT 1 FROM pilot_programs pp
        JOIN users u ON pp.company_id = u.company_id
        WHERE pp.program_id = ss.program_id
        AND u.id = auth.uid()
        AND u.is_company_admin = TRUE
      )
    )
  
  ORDER BY
    last_activity_time DESC;
END;
$$;

-- 4. Update RLS policies for submission_sessions to allow access to unclaimed sessions
-- First, drop existing policies
DROP POLICY IF EXISTS "Users can see their own sessions and escalated sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions and escalated sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON submission_sessions;

-- Create new policies
-- Policy for selecting sessions (includes unclaimed sessions)
CREATE POLICY "Users can see their own sessions and escalated sessions"
ON submission_sessions
FOR SELECT
USING (
  opened_by_user_id = auth.uid()
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
  OR (
    -- Unclaimed sessions for programs the user has access to
    opened_by_user_id IS NULL
    AND session_status = 'Opened'
    AND (
      -- User has access to the program via pilot_program_users
      program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid()
        AND role != 'ReadOnly' -- Only non-ReadOnly users can claim sessions
      )
      OR
      -- User is a company admin for this program
      program_id IN (
        SELECT pp.program_id FROM pilot_programs pp
        JOIN users u ON pp.company_id = u.company_id
        WHERE u.id = auth.uid()
        AND u.is_company_admin = TRUE
      )
    )
  )
);

-- Policy for inserting sessions (any authenticated user can create a session)
CREATE POLICY "Users can create sessions"
ON submission_sessions
FOR INSERT
WITH CHECK (
  -- Either creating a session with themselves as opener
  opened_by_user_id = auth.uid()
  OR
  -- Or creating an unclaimed session (system process)
  (opened_by_user_id IS NULL AND session_status = 'Opened')
);

-- Policy for updating sessions (includes claiming unclaimed sessions)
CREATE POLICY "Users can update their own sessions and escalated sessions"
ON submission_sessions
FOR UPDATE
USING (
  opened_by_user_id = auth.uid()
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
  OR (
    -- Unclaimed sessions for programs the user has access to
    opened_by_user_id IS NULL
    AND session_status = 'Opened'
    AND (
      -- User has access to the program via pilot_program_users
      program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid()
        AND role != 'ReadOnly' -- Only non-ReadOnly users can claim sessions
      )
      OR
      -- User is a company admin for this program
      program_id IN (
        SELECT pp.program_id FROM pilot_programs pp
        JOIN users u ON pp.company_id = u.company_id
        WHERE u.id = auth.uid()
        AND u.is_company_admin = TRUE
      )
    )
  )
);

-- Policy for deleting sessions (only the creator can delete)
CREATE POLICY "Users can delete their own sessions"
ON submission_sessions
FOR DELETE
USING (opened_by_user_id = auth.uid());

-- 5. Add SessionSharing to history_event_type_enum if it doesn't exist
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

-- 6. Ensure pg_cron extension is available and schedule the job
DO $$
BEGIN
  -- Check if we have permission to create extensions
  IF EXISTS (
    SELECT 1 FROM pg_roles 
    WHERE rolname = current_user 
    AND rolsuper
  ) THEN
    -- Try to create the extension
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      
      -- If we get here, the extension was created or already existed
      -- Schedule the job using the correct syntax
      PERFORM cron.schedule(
        'auto-create-daily-sessions',  -- job name
        '1 0 * * *',                   -- cron schedule (1 minute past midnight, every day)
        $$SELECT auto_create_daily_sessions()$$  -- Fixed: added SELECT
      );
      
      RAISE NOTICE 'Successfully scheduled auto_create_daily_sessions to run daily at 00:01';
    EXCEPTION WHEN OTHERS THEN
      -- If we can't create the extension, create a function that can be called externally
      RAISE NOTICE 'Could not create pg_cron extension: %', SQLERRM;
      
      -- Create a function that can be called from an external scheduler
      CREATE OR REPLACE FUNCTION trigger_daily_sessions()
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        RETURN auto_create_daily_sessions();
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION trigger_daily_sessions() TO service_role;
      
      RAISE NOTICE 'Created trigger_daily_sessions() function that can be called from an external scheduler';
    END;
  ELSE
    -- We don't have permission to create extensions
    RAISE NOTICE 'Current user does not have permission to create extensions';
    
    -- Create a function that can be called from an external scheduler
    CREATE OR REPLACE FUNCTION trigger_daily_sessions()
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN auto_create_daily_sessions();
    END;
    $$;
    
    GRANT EXECUTE ON FUNCTION trigger_daily_sessions() TO service_role;
    
    RAISE NOTICE 'Created trigger_daily_sessions() function that can be called from an external scheduler';
  END IF;
END
$$;

-- 7. Grant execute permissions to functions
GRANT EXECUTE ON FUNCTION auto_create_daily_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION claim_submission_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_sessions_with_details() TO authenticated;

-- 8. Add comments for documentation
COMMENT ON FUNCTION auto_create_daily_sessions IS 'Creates unclaimed sessions for all active sites. Runs daily at 00:01.';
COMMENT ON FUNCTION claim_submission_session IS 'Claims an unclaimed session, setting the current user as the opener and status to Working.';
COMMENT ON FUNCTION get_active_sessions_with_details IS 'Returns active and unclaimed sessions with related details.';