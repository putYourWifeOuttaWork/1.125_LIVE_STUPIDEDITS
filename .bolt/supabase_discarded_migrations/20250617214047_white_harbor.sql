/*
  # Create auto_create_daily_sessions function
  
  1. Changes
    - Implements a function that creates unclaimed sessions for active sites
    - Uses site and company defaults for environmental settings
    - Checks if a session already exists for the current day before creating
    
  2. Purpose
    - Provides the backend function for automated daily session creation
    - Will be run by a cron job to ensure all sites have an available session each day
*/

CREATE OR REPLACE FUNCTION auto_create_daily_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_program RECORD;
  v_site RECORD;
  v_submission_data JSONB;
  v_petri_templates TEXT;
  v_gasifier_templates TEXT;
  v_session_count INTEGER := 0;
  v_result JSONB;
  v_creation_result JSONB;
  v_today_date DATE := CURRENT_DATE;
  v_error_count INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  -- Loop through active programs
  FOR v_program IN 
    SELECT program_id, name 
    FROM pilot_programs 
    WHERE status = 'active'
  LOOP
    RAISE NOTICE 'Processing program: %', v_program.name;
    
    -- Loop through sites in this program
    FOR v_site IN 
      SELECT * 
      FROM sites 
      WHERE program_id = v_program.program_id
    LOOP
      RAISE NOTICE 'Processing site: %', v_site.name;
      
      -- Check if a session already exists for today for this site
      IF NOT EXISTS (
        SELECT 1 
        FROM submission_sessions ss
        JOIN submissions s ON ss.submission_id = s.submission_id
        WHERE ss.site_id = v_site.site_id
        AND DATE(ss.session_start_time) = v_today_date
      ) THEN
        -- Prepare submission_data from site defaults
        v_submission_data := jsonb_build_object(
          'temperature', COALESCE(v_site.default_temperature, 70),
          'humidity', COALESCE(v_site.default_humidity, 50),
          'indoor_temperature', v_site.default_indoor_temperature,
          'indoor_humidity', v_site.default_indoor_humidity,
          'weather', COALESCE(
            v_site.default_weather::TEXT,
            (SELECT default_weather::TEXT FROM companies c
             JOIN pilot_programs pp ON c.company_id = pp.company_id
             WHERE pp.program_id = v_program.program_id
             LIMIT 1),
            'Clear'
          )
        );
        
        -- Get additional defaults from submission_defaults JSON if available
        IF v_site.submission_defaults IS NOT NULL THEN
          -- Add airflow if available
          IF v_site.submission_defaults ? 'airflow' THEN
            v_submission_data := v_submission_data || 
              jsonb_build_object('airflow', v_site.submission_defaults->>'airflow');
          ELSE
            v_submission_data := v_submission_data || 
              jsonb_build_object('airflow', 'Open');
          END IF;
          
          -- Add odor_distance if available
          IF v_site.submission_defaults ? 'odor_distance' THEN
            v_submission_data := v_submission_data || 
              jsonb_build_object('odor_distance', v_site.submission_defaults->>'odor_distance');
          ELSE
            v_submission_data := v_submission_data || 
              jsonb_build_object('odor_distance', '5-10ft');
          END IF;
          
          -- Add notes if available
          IF v_site.submission_defaults ? 'notes' THEN
            v_submission_data := v_submission_data || 
              jsonb_build_object('notes', v_site.submission_defaults->>'notes');
          END IF;
        ELSE
          -- Set default airflow and odor_distance if submission_defaults is null
          v_submission_data := v_submission_data || 
            jsonb_build_object(
              'airflow', 'Open', 
              'odor_distance', '5-10ft'
            );
        END IF;
        
        -- Add timezone from site if available
        IF v_site.timezone IS NOT NULL THEN
          v_submission_data := v_submission_data || 
            jsonb_build_object('timezone', v_site.timezone);
        END IF;
        
        -- Convert petri_defaults to TEXT
        IF v_site.petri_defaults IS NOT NULL THEN
          v_petri_templates := v_site.petri_defaults::TEXT;
        ELSE
          v_petri_templates := '[]';
        END IF;
        
        -- Convert gasifier_defaults to TEXT
        IF v_site.gasifier_defaults IS NOT NULL THEN
          v_gasifier_templates := v_site.gasifier_defaults::TEXT;
        ELSE
          v_gasifier_templates := '[]';
        END IF;
        
        -- Create submission session without an owner
        BEGIN
          v_creation_result := create_submission_session(
            v_site.site_id,
            v_program.program_id,
            v_submission_data,
            v_petri_templates,
            v_gasifier_templates,
            NULL  -- No opened_by_user_id (unclaimed)
          );
          
          IF (v_creation_result->>'success')::BOOLEAN THEN
            v_session_count := v_session_count + 1;
          ELSE
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
              'site_id', v_site.site_id,
              'site_name', v_site.name,
              'error', v_creation_result->>'message'
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'site_id', v_site.site_id,
            'site_name', v_site.name,
            'error', SQLERRM
          );
        END;
      ELSE
        RAISE NOTICE 'Session already exists for site % today', v_site.name;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Return result summary
  v_result := jsonb_build_object(
    'success', TRUE,
    'sessions_created', v_session_count,
    'errors', v_error_count,
    'error_details', v_errors,
    'timestamp', now()
  );
  
  RETURN v_result;
END;
$$;

-- Grant execute permissions to authenticated users and service_role
GRANT EXECUTE ON FUNCTION auto_create_daily_sessions() TO authenticated, service_role;

-- Add comment for documentation
COMMENT ON FUNCTION auto_create_daily_sessions IS 'Creates one unclaimed submission session per active site per day if one doesn''t exist already. Uses site defaults for submission values.';