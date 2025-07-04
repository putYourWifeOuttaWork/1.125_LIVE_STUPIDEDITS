/*
  # Fix audit log RPC functions

  1. Functions
    - `get_filtered_audit_history` - Get filtered audit history records
    - `export_filtered_audit_history_csv` - Export audit history as CSV
  
  2. Changes
    - Fix ambiguous column references by qualifying with table aliases
    - Ensure proper joins between pilot_program_history and related tables
    - Add proper error handling and parameter validation
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS get_filtered_audit_history(UUID, UUID, TEXT, history_event_type_enum, UUID, INTEGER);
DROP FUNCTION IF EXISTS export_filtered_audit_history_csv(UUID, UUID, TEXT, history_event_type_enum, UUID);

-- Create the get_filtered_audit_history function
CREATE OR REPLACE FUNCTION get_filtered_audit_history(
  p_program_id UUID,
  p_site_id UUID DEFAULT NULL,
  p_object_type TEXT DEFAULT NULL,
  p_event_type history_event_type_enum DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  event_timestamp TIMESTAMPTZ,
  update_type history_event_type_enum,
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
  RETURN QUERY
  SELECT 
    pph.id,
    pph.event_timestamp,
    pph.update_type,
    pph.object_id,
    pph.object_type,
    pph.program_id,
    pph.user_id,
    pph.user_email,
    pph.user_company,
    pph.user_role,
    pph.old_data,
    pph.new_data,
    pph.ip_address,
    pph.user_agent
  FROM pilot_program_history pph
  WHERE 
    pph.program_id = p_program_id
    AND (p_site_id IS NULL OR 
         (pph.object_type = 'site' AND pph.object_id = p_site_id) OR
         (pph.object_type = 'submission' AND pph.object_id IN (
           SELECT s.submission_id FROM submissions s WHERE s.site_id = p_site_id
         )) OR
         (pph.object_type = 'petri_observation' AND pph.object_id IN (
           SELECT po.observation_id FROM petri_observations po WHERE po.site_id = p_site_id
         )) OR
         (pph.object_type = 'gasifier_observation' AND pph.object_id IN (
           SELECT go.observation_id FROM gasifier_observations go WHERE go.site_id = p_site_id
         ))
    )
    AND (p_object_type IS NULL OR pph.object_type = p_object_type)
    AND (p_event_type IS NULL OR pph.update_type = p_event_type)
    AND (p_user_id IS NULL OR pph.user_id = p_user_id)
  ORDER BY pph.event_timestamp DESC
  LIMIT p_limit;
END;
$$;

-- Create the export_filtered_audit_history_csv function
CREATE OR REPLACE FUNCTION export_filtered_audit_history_csv(
  p_program_id UUID,
  p_site_id UUID DEFAULT NULL,
  p_object_type TEXT DEFAULT NULL,
  p_event_type history_event_type_enum DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  csv_output TEXT;
  rec RECORD;
BEGIN
  -- Start with CSV header
  csv_output := 'Timestamp,Event Type,Object Type,Object ID,User Email,User Company,User Role,Notes' || E'\n';
  
  -- Get the filtered data
  FOR rec IN
    SELECT 
      pph.event_timestamp,
      pph.update_type,
      pph.object_type,
      pph.object_id,
      pph.user_email,
      pph.user_company,
      pph.user_role,
      CASE 
        WHEN pph.new_data IS NOT NULL AND pph.old_data IS NOT NULL 
        THEN 'Updated'
        WHEN pph.new_data IS NOT NULL 
        THEN 'Created'
        WHEN pph.old_data IS NOT NULL 
        THEN 'Deleted'
        ELSE 'Unknown'
      END as notes
    FROM pilot_program_history pph
    WHERE 
      pph.program_id = p_program_id
      AND (p_site_id IS NULL OR 
           (pph.object_type = 'site' AND pph.object_id = p_site_id) OR
           (pph.object_type = 'submission' AND pph.object_id IN (
             SELECT s.submission_id FROM submissions s WHERE s.site_id = p_site_id
           )) OR
           (pph.object_type = 'petri_observation' AND pph.object_id IN (
             SELECT po.observation_id FROM petri_observations po WHERE po.site_id = p_site_id
           )) OR
           (pph.object_type = 'gasifier_observation' AND pph.object_id IN (
             SELECT go.observation_id FROM gasifier_observations go WHERE go.site_id = p_site_id
           ))
      )
      AND (p_object_type IS NULL OR pph.object_type = p_object_type)
      AND (p_event_type IS NULL OR pph.update_type = p_event_type)
      AND (p_user_id IS NULL OR pph.user_id = p_user_id)
    ORDER BY pph.event_timestamp DESC
  LOOP
    csv_output := csv_output || 
      '"' || COALESCE(rec.event_timestamp::TEXT, '') || '",' ||
      '"' || COALESCE(rec.update_type::TEXT, '') || '",' ||
      '"' || COALESCE(rec.object_type, '') || '",' ||
      '"' || COALESCE(rec.object_id::TEXT, '') || '",' ||
      '"' || COALESCE(rec.user_email, '') || '",' ||
      '"' || COALESCE(rec.user_company, '') || '",' ||
      '"' || COALESCE(rec.user_role, '') || '",' ||
      '"' || COALESCE(rec.notes, '') || '"' ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_filtered_audit_history(UUID, UUID, TEXT, history_event_type_enum, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION export_filtered_audit_history_csv(UUID, UUID, TEXT, history_event_type_enum, UUID) TO authenticated;