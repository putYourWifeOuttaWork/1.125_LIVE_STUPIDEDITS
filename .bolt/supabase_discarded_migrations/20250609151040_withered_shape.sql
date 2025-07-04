/*
  # Remove num_openings and Add Audit Log Export Functionality
  
  1. Changes
    - Removes the num_openings column from sites table
    - Adds RPC functions for filtered audit log retrieval and export
    - Supports site-specific audit log filtering
    
  2. Security
    - Maintains proper permission checks for audit log access
    - Only program admins or company admins can access audit logs
*/

-- 1. Remove num_openings column from sites table
DO $$
BEGIN
  -- First drop the constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'sites_num_openings_check'
  ) THEN
    ALTER TABLE sites DROP CONSTRAINT sites_num_openings_check;
  END IF;
  
  -- Then drop the column if it exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'sites' AND column_name = 'num_openings'
  ) THEN
    ALTER TABLE sites DROP COLUMN num_openings;
  END IF;
END
$$;

-- 2. Create function for filtered audit log retrieval with site filter
CREATE OR REPLACE FUNCTION get_filtered_audit_history(
  p_program_id UUID,
  p_site_id UUID DEFAULT NULL,
  p_object_type TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  event_timestamp TIMESTAMPTZ,
  update_type TEXT,
  object_id UUID,
  object_type TEXT,
  program_id UUID,
  user_id UUID,
  user_email TEXT,
  user_company TEXT,
  user_role TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check permissions - must have access to the program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE program_id = p_program_id 
    AND user_id = auth.uid()
    AND role = 'Admin'
  ) AND NOT is_company_admin_for_program(p_program_id) THEN
    RAISE EXCEPTION 'Access denied to program audit log';
  END IF;

  -- If site_id is provided, check that it belongs to the program
  IF p_site_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM sites 
      WHERE site_id = p_site_id 
      AND program_id = p_program_id
    ) THEN
      RAISE EXCEPTION 'Site does not belong to the specified program';
    END IF;
  END IF;

  RETURN QUERY
  SELECT 
    h.id,
    h.event_timestamp,
    h.update_type::TEXT,
    h.object_id,
    h.object_type,
    h.program_id,
    h.user_id,
    h.user_email,
    h.user_company,
    h.user_role,
    h.old_data,
    h.new_data,
    h.ip_address,
    h.user_agent
  FROM 
    pilot_program_history h
  WHERE 
    h.program_id = p_program_id
    -- Site filter - look for site-related events or events for objects that belong to the site
    AND (
      p_site_id IS NULL -- No site filter
      OR 
      (
        -- Direct site events
        (h.object_type = 'site' AND h.object_id = p_site_id)
        -- Submission events for the site
        OR (h.object_type = 'submission' AND h.new_data->>'site_id' = p_site_id::TEXT)
        OR (h.object_type = 'submission' AND h.old_data->>'site_id' = p_site_id::TEXT)
        -- Petri/Gasifier observation events (check site_id in the observation data)
        OR (h.object_type IN ('petri_observation', 'gasifier_observation') 
            AND h.new_data->>'site_id' = p_site_id::TEXT)
        OR (h.object_type IN ('petri_observation', 'gasifier_observation') 
            AND h.old_data->>'site_id' = p_site_id::TEXT)
      )
    )
    -- Additional filters
    AND (p_object_type IS NULL OR h.object_type = p_object_type)
    AND (p_event_type IS NULL OR h.update_type::TEXT = p_event_type)
    AND (p_user_id IS NULL OR h.user_id = p_user_id)
  ORDER BY 
    h.event_timestamp DESC
  LIMIT 
    p_limit;
END;
$$;

-- 3. Create function to export filtered audit logs to CSV
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
AS $$
DECLARE
  csv_output TEXT := '';
  rec RECORD;
BEGIN
  -- Check permissions - must have access to the program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE program_id = p_program_id 
    AND user_id = auth.uid()
    AND role = 'Admin'
  ) AND NOT is_company_admin_for_program(p_program_id) THEN
    RAISE EXCEPTION 'Access denied to program audit log';
  END IF;

  -- If site_id is provided, check that it belongs to the program
  IF p_site_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM sites 
      WHERE site_id = p_site_id 
      AND program_id = p_program_id
    ) THEN
      RAISE EXCEPTION 'Site does not belong to the specified program';
    END IF;
  END IF;

  -- CSV Header
  csv_output := 'Timestamp,Event Type,Object Type,Object ID,User Email,User Company,User Role,Details' || E'\n';
  
  -- CSV Data
  FOR rec IN 
    SELECT 
      h.event_timestamp,
      h.update_type::TEXT as event_type,
      h.object_type,
      h.object_id,
      COALESCE(h.user_email, '') as user_email,
      COALESCE(h.user_company, '') as user_company,
      COALESCE(h.user_role, '') as user_role,
      COALESCE(
        CASE
          WHEN h.update_type = 'ProgramCreation' THEN 'Created program: ' || COALESCE(h.new_data->>'name', '')
          WHEN h.update_type = 'ProgramUpdate' THEN 'Updated program: ' || COALESCE(h.new_data->>'name', '')
          WHEN h.update_type = 'SiteCreation' THEN 'Created site: ' || COALESCE(h.new_data->>'name', '')
          WHEN h.update_type = 'SiteUpdate' THEN 'Updated site: ' || COALESCE(h.new_data->>'name', '')
          WHEN h.update_type = 'SubmissionCreation' THEN 'Created submission with temp: ' || COALESCE(h.new_data->>'temperature', '')
          WHEN h.update_type = 'SubmissionUpdate' THEN 'Updated submission with ID: ' || h.object_id::TEXT
          WHEN h.update_type = 'PetriCreation' THEN 'Added petri observation: ' || COALESCE(h.new_data->>'petri_code', '')
          WHEN h.update_type = 'GasifierCreation' THEN 'Added gasifier observation: ' || COALESCE(h.new_data->>'gasifier_code', '')
          WHEN h.update_type = 'UserAdded' THEN 'Added user: ' || COALESCE(h.new_data->>'user_email', '')
          WHEN h.update_type = 'UserRemoved' THEN 'Removed user: ' || COALESCE(h.old_data->>'user_email', '')
          ELSE ''
        END,
        ''
      ) as details
    FROM 
      pilot_program_history h
    WHERE 
      h.program_id = p_program_id
      -- Site filter - look for site-related events or events for objects that belong to the site
      AND (
        p_site_id IS NULL -- No site filter
        OR 
        (
          -- Direct site events
          (h.object_type = 'site' AND h.object_id = p_site_id)
          -- Submission events for the site
          OR (h.object_type = 'submission' AND h.new_data->>'site_id' = p_site_id::TEXT)
          OR (h.object_type = 'submission' AND h.old_data->>'site_id' = p_site_id::TEXT)
          -- Petri/Gasifier observation events (check site_id in the observation data)
          OR (h.object_type IN ('petri_observation', 'gasifier_observation') 
              AND h.new_data->>'site_id' = p_site_id::TEXT)
          OR (h.object_type IN ('petri_observation', 'gasifier_observation') 
              AND h.old_data->>'site_id' = p_site_id::TEXT)
        )
      )
      -- Additional filters
      AND (p_object_type IS NULL OR h.object_type = p_object_type)
      AND (p_event_type IS NULL OR h.update_type::TEXT = p_event_type)
      AND (p_user_id IS NULL OR h.user_id = p_user_id)
    ORDER BY 
      h.event_timestamp DESC
  LOOP
    -- Format each row as CSV
    csv_output := csv_output || 
      to_char(rec.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || ',' ||
      '"' || replace(rec.event_type, '"', '""') || '",' ||
      '"' || replace(rec.object_type, '"', '""') || '",' ||
      '"' || rec.object_id || '",' ||
      '"' || replace(rec.user_email, '"', '""') || '",' ||
      '"' || replace(rec.user_company, '"', '""') || '",' ||
      '"' || replace(rec.user_role, '"', '""') || '",' ||
      '"' || replace(rec.details, '"', '""') || '"' ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_filtered_audit_history(UUID, UUID, TEXT, TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION export_filtered_audit_history_csv(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

-- 5. Add comments for documentation
COMMENT ON FUNCTION get_filtered_audit_history IS 'Retrieves filtered audit history for a program or site, respecting permissions';
COMMENT ON FUNCTION export_filtered_audit_history_csv IS 'Exports filtered audit history as CSV for a program or site, respecting permissions';