/*
  # Fix Overloaded Audit Log Functions
  
  1. Problem
    - Two conflicting versions of get_filtered_audit_history function exist
    - Different parameter types (history_event_type_enum vs text) cause ambiguity
    - PostgreSQL cannot determine which function to call during API requests
  
  2. Solution
    - Drop both versions of the function explicitly by their signatures
    - Create a single version that handles both text and enum input
    - Ensure all column references are fully qualified
    - Update all related audit log functions for consistency
*/

-- 1. Drop all existing versions of the conflicting functions
DROP FUNCTION IF EXISTS get_filtered_audit_history(UUID, UUID, TEXT, history_event_type_enum, UUID, INTEGER);
DROP FUNCTION IF EXISTS get_filtered_audit_history(UUID, UUID, TEXT, TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS export_filtered_audit_history_csv(UUID, UUID, TEXT, history_event_type_enum, UUID);
DROP FUNCTION IF EXISTS export_filtered_audit_history_csv(UUID, UUID, TEXT, TEXT, UUID);

-- 2. Create a single version of get_filtered_audit_history function
-- This version takes p_event_type as TEXT to avoid overloading issues
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
SET search_path = public
AS $$
DECLARE
  v_site_exists BOOLEAN;
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

  -- Return the filtered audit log entries
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
  LIMIT 
    p_limit;
END;
$$;

-- 3. Create a single version of export_filtered_audit_history_csv function
-- This version also takes p_event_type as TEXT
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

  -- CSV Header
  csv_output := 'Timestamp,Event Type,Object Type,Object ID,User Email,User Company,Details' || E'\n';
  
  -- CSV Data
  FOR rec IN 
    SELECT 
      h.event_timestamp,
      h.update_type::TEXT as event_type,
      h.object_type,
      h.object_id,
      h.user_email,
      h.user_company,
      CASE
        WHEN h.update_type::TEXT LIKE '%Creation' THEN 'Created'
        WHEN h.update_type::TEXT LIKE '%Update' THEN 'Updated'
        WHEN h.update_type::TEXT LIKE '%Deletion' THEN 'Deleted'
        ELSE h.update_type::TEXT
      END || ' ' || h.object_type as details
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
    -- Format each row, escaping any embedded quotes in string values
    csv_output := csv_output || 
      '"' || to_char(rec.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || '",' ||
      '"' || COALESCE(replace(rec.event_type, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.object_type, '"', '""'), '') || '",' ||
      '"' || COALESCE(rec.object_id::TEXT, '') || '",' ||
      '"' || COALESCE(replace(rec.user_email, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.user_company, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.details, '"', '""'), '') || '"' ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_filtered_audit_history(UUID, UUID, TEXT, TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION export_filtered_audit_history_csv(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

-- 5. Add comments for documentation
COMMENT ON FUNCTION get_filtered_audit_history IS 'Retrieves filtered audit history for a program or site with proper access control';
COMMENT ON FUNCTION export_filtered_audit_history_csv IS 'Exports filtered audit history as CSV for a program or site with proper access control';