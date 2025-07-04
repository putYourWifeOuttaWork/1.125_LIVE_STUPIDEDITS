-- Fix type mismatch in export_user_audit_history_csv function

-- Drop the existing function
DROP FUNCTION IF EXISTS export_user_audit_history_csv(UUID, TEXT, TEXT);

-- Recreate the function with proper type casting
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

  -- CSV Header
  csv_output := 'Timestamp,Event Type,Object Type,Object ID,Global ID,User Email,User Company,Details' || E'\n';
  
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
        WHEN h.object_type = 'submission' AND h.new_data ? 'global_submission_id' THEN h.new_data->>'global_submission_id'
        WHEN h.object_type = 'submission' AND h.old_data ? 'global_submission_id' THEN h.old_data->>'global_submission_id'
        ELSE NULL
      END as global_id,
      CASE
        WHEN h.update_type = 'UserDeactivated' THEN 'User deactivated: ' || COALESCE(h.new_data->>'user_email', '')
        WHEN h.update_type = 'UserReactivated' THEN 'User reactivated: ' || COALESCE(h.new_data->>'user_email', '')
        WHEN h.update_type = 'UserRoleChanged' THEN 'Role changed from ' || COALESCE(h.old_data->>'role', 'Member') || ' to ' || COALESCE(h.new_data->>'role', 'Member')
        WHEN h.update_type = 'SubmissionCreation' THEN 'Created submission with temp: ' || COALESCE(h.new_data->>'temperature', '')
        WHEN h.update_type = 'SubmissionUpdate' THEN 'Updated submission'
        WHEN h.update_type = 'GasifierCreation' THEN 'Added gasifier: ' || COALESCE(h.new_data->>'gasifier_code', '')
        WHEN h.update_type = 'PetriCreation' THEN 'Added petri: ' || COALESCE(h.new_data->>'petri_code', '')
        ELSE h.update_type::TEXT -- Explicitly cast to TEXT here to fix the type mismatch
      END as details
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
    -- Format CSV row, escaping any special characters
    csv_output := csv_output || 
      '"' || to_char(rec.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || '",' ||
      '"' || COALESCE(replace(rec.event_type, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.object_type, '"', '""'), '') || '",' ||
      '"' || rec.object_id || '",' ||
      '"' || COALESCE(rec.global_id, '') || '",' ||
      '"' || COALESCE(replace(rec.user_email, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.user_company, '"', '""'), '') || '",' ||
      '"' || COALESCE(replace(rec.details, '"', '""'), '') || '"' ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION export_user_audit_history_csv(UUID, TEXT, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION export_user_audit_history_csv IS 'Exports filtered audit history for a specific user as CSV with proper type handling';