/*
  # Enhance Audit Log CSV Exports with Human-Readable Before/After States
  
  1. Changes
    - Creates format_object_state function to convert JSONB to human-readable text
    - Updates export_filtered_audit_history_csv to include Before/After State columns
    - Updates export_user_audit_history_csv to include Before/After State columns
    - Ensures all exports include human-readable descriptions of changes
    
  2. Purpose
    - Improves audit log readability in exported CSV files
    - Provides clear before/after state information for each change
    - Presents data in natural language rather than raw JSON
*/

-- 1. Create a function to format object state data into human-readable text
CREATE OR REPLACE FUNCTION format_object_state(
  p_object_type TEXT,
  p_data JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- If data is NULL or empty, return empty string
  IF p_data IS NULL OR p_data = '{}'::JSONB THEN
    RETURN '';
  END IF;

  -- Format differently based on object type
  CASE p_object_type
    -- Format pilot_program state
    WHEN 'pilot_program' THEN
      v_result := 'Program: ' || COALESCE(p_data->>'name', '[unnamed]');
      
      IF p_data ? 'description' THEN
        v_result := v_result || ', Description: ' || SUBSTRING(COALESCE(p_data->>'description', ''), 1, 50);
        IF LENGTH(COALESCE(p_data->>'description', '')) > 50 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
      
      IF p_data ? 'start_date' THEN
        v_result := v_result || ', Start: ' || COALESCE(p_data->>'start_date', '');
      END IF;
      
      IF p_data ? 'end_date' THEN
        v_result := v_result || ', End: ' || COALESCE(p_data->>'end_date', '');
      END IF;
      
      IF p_data ? 'status' THEN
        v_result := v_result || ', Status: ' || COALESCE(p_data->>'status', '');
      END IF;
    
    -- Format site state
    WHEN 'site' THEN
      v_result := 'Site: ' || COALESCE(p_data->>'name', '[unnamed]');
      
      IF p_data ? 'type' THEN
        v_result := v_result || ', Type: ' || COALESCE(p_data->>'type', '');
      END IF;
      
      IF p_data ? 'square_footage' THEN
        v_result := v_result || ', Size: ' || COALESCE(p_data->>'square_footage', '') || ' sq ft';
      END IF;
      
      IF p_data ? 'primary_function' THEN
        v_result := v_result || ', Function: ' || COALESCE(p_data->>'primary_function', '');
      END IF;
      
      IF p_data ? 'total_petris' THEN
        v_result := v_result || ', Petri Samples: ' || COALESCE(p_data->>'total_petris', '0');
      END IF;
      
      IF p_data ? 'total_gasifiers' THEN
        v_result := v_result || ', Gasifiers: ' || COALESCE(p_data->>'total_gasifiers', '0');
      END IF;
    
    -- Format submission state
    WHEN 'submission' THEN
      v_result := 'Submission';
      
      IF p_data ? 'global_submission_id' THEN
        v_result := v_result || ' #' || COALESCE(p_data->>'global_submission_id', '');
      END IF;
      
      IF p_data ? 'temperature' THEN
        v_result := v_result || ', Temp: ' || COALESCE(p_data->>'temperature', '') || '°F';
      END IF;
      
      IF p_data ? 'humidity' THEN
        v_result := v_result || ', Humidity: ' || COALESCE(p_data->>'humidity', '') || '%';
      END IF;
      
      IF p_data ? 'weather' THEN
        v_result := v_result || ', Weather: ' || COALESCE(p_data->>'weather', '');
      END IF;
      
      IF p_data ? 'airflow' THEN
        v_result := v_result || ', Airflow: ' || COALESCE(p_data->>'airflow', '');
      END IF;
      
      IF p_data ? 'odor_distance' THEN
        v_result := v_result || ', Odor Distance: ' || COALESCE(p_data->>'odor_distance', '');
      END IF;
      
      IF p_data ? 'indoor_temperature' AND p_data->>'indoor_temperature' IS NOT NULL THEN
        v_result := v_result || ', Indoor Temp: ' || COALESCE(p_data->>'indoor_temperature', '') || '°F';
      END IF;
      
      IF p_data ? 'indoor_humidity' AND p_data->>'indoor_humidity' IS NOT NULL THEN
        v_result := v_result || ', Indoor Humidity: ' || COALESCE(p_data->>'indoor_humidity', '') || '%';
      END IF;
      
      IF p_data ? 'notes' AND p_data->>'notes' IS NOT NULL AND p_data->>'notes' != '' THEN
        v_result := v_result || ', Notes: ' || SUBSTRING(COALESCE(p_data->>'notes', ''), 1, 30);
        IF LENGTH(COALESCE(p_data->>'notes', '')) > 30 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
    
    -- Format petri_observation state
    WHEN 'petri_observation' THEN
      v_result := 'Petri: ' || COALESCE(p_data->>'petri_code', '[no code]');
      
      IF p_data ? 'plant_type' THEN
        v_result := v_result || ', Plant: ' || COALESCE(p_data->>'plant_type', '');
      END IF;
      
      IF p_data ? 'fungicide_used' THEN
        v_result := v_result || ', Fungicide: ' || COALESCE(p_data->>'fungicide_used', '');
      END IF;
      
      IF p_data ? 'surrounding_water_schedule' THEN
        v_result := v_result || ', Water: ' || COALESCE(p_data->>'surrounding_water_schedule', '');
      END IF;
      
      IF p_data ? 'placement' AND p_data->>'placement' IS NOT NULL THEN
        v_result := v_result || ', Placement: ' || COALESCE(p_data->>'placement', '');
      END IF;
      
      IF p_data ? 'placement_dynamics' AND p_data->>'placement_dynamics' IS NOT NULL THEN
        v_result := v_result || ', Near: ' || COALESCE(p_data->>'placement_dynamics', '');
      END IF;
      
      IF p_data ? 'notes' AND p_data->>'notes' IS NOT NULL AND p_data->>'notes' != '' THEN
        v_result := v_result || ', Notes: ' || SUBSTRING(COALESCE(p_data->>'notes', ''), 1, 30);
        IF LENGTH(COALESCE(p_data->>'notes', '')) > 30 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
    
    -- Format gasifier_observation state
    WHEN 'gasifier_observation' THEN
      v_result := 'Gasifier: ' || COALESCE(p_data->>'gasifier_code', '[no code]');
      
      IF p_data ? 'chemical_type' THEN
        v_result := v_result || ', Chemical: ' || COALESCE(p_data->>'chemical_type', '');
      END IF;
      
      IF p_data ? 'anomaly' THEN
        IF (p_data->>'anomaly')::BOOLEAN THEN
          v_result := v_result || ', Has Anomaly: Yes';
        END IF;
      END IF;
      
      IF p_data ? 'placement_height' AND p_data->>'placement_height' IS NOT NULL THEN
        v_result := v_result || ', Height: ' || COALESCE(p_data->>'placement_height', '');
      END IF;
      
      IF p_data ? 'directional_placement' AND p_data->>'directional_placement' IS NOT NULL THEN
        v_result := v_result || ', Position: ' || COALESCE(p_data->>'directional_placement', '');
      END IF;
      
      IF p_data ? 'placement_strategy' AND p_data->>'placement_strategy' IS NOT NULL THEN
        v_result := v_result || ', Strategy: ' || COALESCE(p_data->>'placement_strategy', '');
      END IF;
      
      IF p_data ? 'notes' AND p_data->>'notes' IS NOT NULL AND p_data->>'notes' != '' THEN
        v_result := v_result || ', Notes: ' || SUBSTRING(COALESCE(p_data->>'notes', ''), 1, 30);
        IF LENGTH(COALESCE(p_data->>'notes', '')) > 30 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
    
    -- Format program_user state
    WHEN 'program_user' THEN
      v_result := 'User';
      
      IF p_data ? 'user_email' THEN
        v_result := v_result || ': ' || COALESCE(p_data->>'user_email', '[no email]');
      END IF;
      
      IF p_data ? 'role' THEN
        v_result := v_result || ', Role: ' || COALESCE(p_data->>'role', '');
      END IF;
    
    -- Format user state
    WHEN 'user' THEN
      v_result := 'User';
      
      IF p_data ? 'user_email' THEN
        v_result := v_result || ': ' || COALESCE(p_data->>'user_email', '[no email]');
      END IF;
      
      IF p_data ? 'is_company_admin' THEN
        IF (p_data->>'is_company_admin')::BOOLEAN THEN
          v_result := v_result || ', Company Admin: Yes';
        ELSE
          v_result := v_result || ', Company Admin: No';
        END IF;
      END IF;
      
      IF p_data ? 'is_active' THEN
        IF (p_data->>'is_active')::BOOLEAN THEN
          v_result := v_result || ', Active: Yes';
        ELSE
          v_result := v_result || ', Active: No';
        END IF;
      END IF;
    
    -- Default case for other object types
    ELSE
      v_result := COALESCE(p_data::TEXT, '');
  END CASE;
  
  RETURN v_result;
END;
$$;

-- 2. Update export_filtered_audit_history_csv function to include before/after states
DROP FUNCTION IF EXISTS export_filtered_audit_history_csv;
CREATE OR REPLACE FUNCTION export_filtered_audit_history_csv(
  p_program_id UUID,
  p_site_id UUID DEFAULT NULL,
  p_object_type TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  csv_output TEXT := '';
  rec RECORD;
  v_site_exists BOOLEAN;
  v_before_state TEXT;
  v_after_state TEXT;
BEGIN
  -- Check permissions - must be program admin or company admin
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE pilot_program_users.program_id = p_program_id 
    AND pilot_program_users.user_id = auth.uid()
    AND pilot_program_users.role = 'Admin'
  ) AND NOT is_company_admin_for_program(p_program_id) THEN
    RAISE EXCEPTION 'Access denied to program audit log';
  END IF;

  -- Validate site belongs to program if site_id is provided
  IF p_site_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.site_id = p_site_id 
      AND sites.program_id = p_program_id
    ) INTO v_site_exists;
    
    IF NOT v_site_exists THEN
      RAISE EXCEPTION 'Site does not belong to the specified program';
    END IF;
  END IF;

  -- CSV Header with Before/After State columns
  csv_output := 'Timestamp,Event Type,Object Type,Object ID,User,Before State,After State' || E'\n';
  
  -- CSV Data
  FOR rec IN 
    SELECT 
      h.event_timestamp,
      h.update_type::TEXT as event_type,
      h.object_type,
      h.object_id,
      h.user_email,
      h.old_data,
      h.new_data
    FROM 
      pilot_program_history h
    WHERE 
      h.program_id = p_program_id
      -- Site filter - either no site specified or related to the specified site
      AND (
        p_site_id IS NULL 
        OR (h.object_type = 'site' AND h.object_id = p_site_id)
        OR (h.object_type = 'submission' AND EXISTS (
            SELECT 1 FROM submissions s 
            WHERE s.submission_id = h.object_id AND s.site_id = p_site_id
          ))
        OR (h.object_type = 'petri_observation' AND EXISTS (
            SELECT 1 FROM petri_observations po 
            WHERE po.observation_id = h.object_id AND po.site_id = p_site_id
          ))
        OR (h.object_type = 'gasifier_observation' AND EXISTS (
            SELECT 1 FROM gasifier_observations go 
            WHERE go.observation_id = h.object_id AND go.site_id = p_site_id
          ))
      )
      -- Additional filters - careful with type conversions
      AND (p_object_type IS NULL OR h.object_type = p_object_type)
      AND (p_event_type IS NULL OR h.update_type::TEXT = p_event_type)
      AND (p_user_id IS NULL OR h.user_id = p_user_id)
    ORDER BY 
      h.event_timestamp DESC
  LOOP
    -- Format the before and after states using the new function
    v_before_state := format_object_state(rec.object_type, rec.old_data);
    v_after_state := format_object_state(rec.object_type, rec.new_data);
    
    -- Format CSV row, escaping any special characters
    csv_output := csv_output || 
      '"' || to_char(rec.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || '",' ||
      '"' || COALESCE(replace(rec.event_type, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.object_type, '"', '""'), '') || '",' ||
      '"' || rec.object_id || '",' ||
      '"' || COALESCE(replace(rec.user_email, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(v_before_state, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(v_after_state, '"', '""'), '') || '"' ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- 3. Update export_user_audit_history_csv function to include before/after states
DROP FUNCTION IF EXISTS export_user_audit_history_csv;
CREATE OR REPLACE FUNCTION export_user_audit_history_csv(
  p_user_id UUID,
  p_object_type TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  csv_output TEXT := '';
  rec RECORD;
  v_before_state TEXT;
  v_after_state TEXT;
BEGIN
  -- Check if the current user is a company admin of the same company as the target user
  IF NOT (
    SELECT EXISTS (
      SELECT 1 FROM users u1
      JOIN users u2 ON u1.company_id = u2.company_id
      WHERE u1.id = auth.uid() 
      AND u1.is_company_admin = TRUE
      AND u2.id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to export user audit history';
  END IF;

  -- CSV Header with Before/After State columns
  csv_output := 'Timestamp,Event Type,Object Type,Object ID,Global ID,User,Before State,After State' || E'\n';
  
  -- CSV Data
  FOR rec IN 
    SELECT 
      h.event_timestamp,
      h.update_type::TEXT as event_type,
      h.object_type,
      h.object_id,
      h.user_email,
      h.old_data,
      h.new_data,
      CASE
        WHEN h.object_type = 'submission' AND h.new_data ? 'global_submission_id' THEN h.new_data->>'global_submission_id'
        WHEN h.object_type = 'submission' AND h.old_data ? 'global_submission_id' THEN h.old_data->>'global_submission_id'
        ELSE NULL
      END as global_id
    FROM 
      pilot_program_history h
    WHERE 
      -- Include events where this user was the actor
      (h.user_id = p_user_id
      -- Or events where this user was the subject (based on object_id for user-related events)
      OR (h.object_id = p_user_id AND h.object_type = 'user')
      -- Or events where this user was mentioned in the data
      OR (h.old_data ? 'user_id' AND h.old_data->>'user_id' = p_user_id::TEXT)
      OR (h.new_data ? 'user_id' AND h.new_data->>'user_id' = p_user_id::TEXT))
      -- Apply filters if provided
      AND (p_object_type IS NULL OR h.object_type = p_object_type)
      AND (p_event_type IS NULL OR h.update_type::TEXT = p_event_type)
    ORDER BY 
      h.event_timestamp DESC
  LOOP
    -- Format the before and after states using the new function
    v_before_state := format_object_state(rec.object_type, rec.old_data);
    v_after_state := format_object_state(rec.object_type, rec.new_data);
    
    -- Format CSV row, escaping any special characters
    csv_output := csv_output || 
      '"' || to_char(rec.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || '",' ||
      '"' || COALESCE(replace(rec.event_type, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.object_type, '"', '""'), '') || '",' ||
      '"' || rec.object_id || '",' ||
      '"' || COALESCE(rec.global_id, '') || '",' ||
      '"' || COALESCE(replace(rec.user_email, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(v_before_state, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(v_after_state, '"', '""'), '') || '"' ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION format_object_state(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION export_filtered_audit_history_csv(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION export_user_audit_history_csv(UUID, TEXT, TEXT) TO authenticated;

-- 5. Add comments for documentation
COMMENT ON FUNCTION format_object_state(TEXT, JSONB) IS 'Formats JSONB object state data into human-readable text based on object type';
COMMENT ON FUNCTION export_filtered_audit_history_csv(UUID, UUID, TEXT, TEXT, UUID) IS 'Exports filtered audit history as CSV with before/after state columns';
COMMENT ON FUNCTION export_user_audit_history_csv(UUID, TEXT, TEXT) IS 'Exports user audit history as CSV with before/after state columns';