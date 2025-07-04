/*
  # Add User Status and Role Management
  
  1. New Features
    - Adds user deactivation/reactivation capabilities
    - Implements principle of least privilege for demoted users
    - Extends audit logging for user status changes
    
  2. Changes
    - Add `is_active` column to users table
    - Add UserDeactivated and UserReactivated event types
    - Create RPC functions for user management
    - Add RLS checks for user active status
*/

-- 1. Add is_active column to users table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- 2. Add new event types to history_event_type_enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'UserDeactivated' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'history_event_type_enum')
  ) THEN
    ALTER TYPE history_event_type_enum ADD VALUE 'UserDeactivated';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'UserReactivated' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'history_event_type_enum')
  ) THEN
    ALTER TYPE history_event_type_enum ADD VALUE 'UserReactivated';
  END IF;
END $$;

-- 3. Create function to deactivate a user
CREATE OR REPLACE FUNCTION deactivate_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_company_id UUID;
  v_target_user_company_id UUID;
  v_target_user_email TEXT;
  v_is_company_admin BOOLEAN;
  v_result JSONB;
BEGIN
  -- Get current user ID and company ID
  v_current_user_id := auth.uid();
  
  -- Check if current user is allowed to deactivate the target user
  SELECT company_id, is_company_admin INTO v_current_user_company_id, v_is_company_admin
  FROM users
  WHERE id = v_current_user_id;
  
  -- Get target user's company ID
  SELECT company_id, email INTO v_target_user_company_id, v_target_user_email
  FROM users
  WHERE id = p_user_id;
  
  -- Verify permissions: Must be company admin of the same company
  IF v_is_company_admin IS NOT TRUE OR 
     v_current_user_company_id IS NULL OR 
     v_current_user_company_id != v_target_user_company_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Insufficient permissions to deactivate user'
    );
  END IF;
  
  -- Cannot deactivate yourself
  IF v_current_user_id = p_user_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You cannot deactivate your own account'
    );
  END IF;
  
  -- Begin transaction
  BEGIN
    -- 1. Set user as inactive
    UPDATE users
    SET is_active = FALSE
    WHERE id = p_user_id;
    
    -- 2. Implement principle of least privilege:
    -- Change all program roles to ReadOnly
    UPDATE pilot_program_users
    SET role = 'ReadOnly'
    WHERE user_id = p_user_id;
    
    -- 3. Log the deactivation event
    INSERT INTO pilot_program_history (
      update_type,
      object_id,
      object_type,
      program_id,
      user_id,
      user_email,
      user_company,
      user_role,
      old_data,
      new_data
    )
    VALUES (
      'UserDeactivated',
      p_user_id,
      'user',
      NULL, -- No specific program
      v_current_user_id,
      (SELECT email FROM users WHERE id = v_current_user_id),
      (SELECT company FROM users WHERE id = v_current_user_id),
      NULL, -- No specific role
      jsonb_build_object('user_email', v_target_user_email, 'is_active', TRUE),
      jsonb_build_object('user_email', v_target_user_email, 'is_active', FALSE)
    );
    
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'User deactivated successfully',
      'user_id', p_user_id,
      'user_email', v_target_user_email
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error deactivating user: ' || SQLERRM
      );
  END;
END;
$$;

-- 4. Create function to reactivate a user
CREATE OR REPLACE FUNCTION reactivate_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_company_id UUID;
  v_target_user_company_id UUID;
  v_target_user_email TEXT;
  v_is_company_admin BOOLEAN;
  v_result JSONB;
BEGIN
  -- Get current user ID and company ID
  v_current_user_id := auth.uid();
  
  -- Check if current user is allowed to reactivate the target user
  SELECT company_id, is_company_admin INTO v_current_user_company_id, v_is_company_admin
  FROM users
  WHERE id = v_current_user_id;
  
  -- Get target user's company ID
  SELECT company_id, email INTO v_target_user_company_id, v_target_user_email
  FROM users
  WHERE id = p_user_id;
  
  -- Verify permissions: Must be company admin of the same company
  IF v_is_company_admin IS NOT TRUE OR 
     v_current_user_company_id IS NULL OR 
     v_current_user_company_id != v_target_user_company_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Insufficient permissions to reactivate user'
    );
  END IF;
  
  -- Begin transaction
  BEGIN
    -- 1. Set user as active
    UPDATE users
    SET is_active = TRUE
    WHERE id = p_user_id;
    
    -- 2. Log the reactivation event
    INSERT INTO pilot_program_history (
      update_type,
      object_id,
      object_type,
      program_id,
      user_id,
      user_email,
      user_company,
      user_role,
      old_data,
      new_data
    )
    VALUES (
      'UserReactivated',
      p_user_id,
      'user',
      NULL, -- No specific program
      v_current_user_id,
      (SELECT email FROM users WHERE id = v_current_user_id),
      (SELECT company FROM users WHERE id = v_current_user_id),
      NULL, -- No specific role
      jsonb_build_object('user_email', v_target_user_email, 'is_active', FALSE),
      jsonb_build_object('user_email', v_target_user_email, 'is_active', TRUE)
    );
    
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'User reactivated successfully',
      'user_id', p_user_id,
      'user_email', v_target_user_email
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error reactivating user: ' || SQLERRM
      );
  END;
END;
$$;

-- 5. Create function to demote a company admin
CREATE OR REPLACE FUNCTION demote_company_admin(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_company_id UUID;
  v_target_user_company_id UUID;
  v_target_user_email TEXT;
  v_is_company_admin BOOLEAN;
  v_admin_count INTEGER;
  v_result JSONB;
BEGIN
  -- Get current user ID and company ID
  v_current_user_id := auth.uid();
  
  -- Check if current user is allowed to demote the target user
  SELECT company_id, is_company_admin INTO v_current_user_company_id, v_is_company_admin
  FROM users
  WHERE id = v_current_user_id;
  
  -- Get target user's company ID and email
  SELECT company_id, email, is_company_admin INTO v_target_user_company_id, v_target_user_email, v_is_company_admin
  FROM users
  WHERE id = p_user_id;
  
  -- Verify permissions: Must be company admin of the same company
  IF NOT (SELECT is_company_admin FROM users WHERE id = v_current_user_id) OR 
     v_current_user_company_id IS NULL OR 
     v_current_user_company_id != v_target_user_company_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Insufficient permissions to demote user'
    );
  END IF;
  
  -- Cannot demote yourself
  IF v_current_user_id = p_user_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You cannot demote yourself'
    );
  END IF;
  
  -- Check if target user is actually a company admin
  IF v_is_company_admin IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'User is not a company admin'
    );
  END IF;
  
  -- Count company admins to ensure at least one remains
  SELECT COUNT(*) INTO v_admin_count
  FROM users
  WHERE company_id = v_current_user_company_id AND is_company_admin = TRUE;
  
  IF v_admin_count <= 1 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Cannot demote the only company admin'
    );
  END IF;
  
  -- Begin transaction
  BEGIN
    -- 1. Remove company admin status
    UPDATE users
    SET is_company_admin = FALSE
    WHERE id = p_user_id;
    
    -- 2. Implement principle of least privilege:
    -- Change all program roles to ReadOnly
    UPDATE pilot_program_users
    SET role = 'ReadOnly'
    WHERE user_id = p_user_id;
    
    -- 3. Log the demotion event
    INSERT INTO pilot_program_history (
      update_type,
      object_id,
      object_type,
      program_id,
      user_id,
      user_email,
      user_company,
      user_role,
      old_data,
      new_data
    )
    VALUES (
      'UserRoleChanged',
      p_user_id,
      'user',
      NULL, -- No specific program
      v_current_user_id,
      (SELECT email FROM users WHERE id = v_current_user_id),
      (SELECT company FROM users WHERE id = v_current_user_id),
      NULL, -- No specific role
      jsonb_build_object('user_email', v_target_user_email, 'is_company_admin', TRUE),
      jsonb_build_object('user_email', v_target_user_email, 'is_company_admin', FALSE)
    );
    
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'User demoted successfully',
      'user_id', p_user_id,
      'user_email', v_target_user_email
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error demoting user: ' || SQLERRM
      );
  END;
END;
$$;

-- 6. Create function to get user audit history
CREATE OR REPLACE FUNCTION get_user_audit_history(p_user_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID,
  event_timestamp TIMESTAMPTZ,
  update_type TEXT,
  object_id UUID,
  object_type TEXT,
  program_id UUID,
  user_id UUID,
  user_email TEXT,
  old_data JSONB,
  new_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'Insufficient permissions to view user audit history';
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
    h.old_data,
    h.new_data
  FROM 
    pilot_program_history h
  WHERE 
    -- Include events where this user was the actor
    h.user_id = p_user_id
    -- Or events where this user was the subject (based on object_id for user-related events)
    OR (h.object_id = p_user_id AND h.object_type = 'user')
    -- Or events where this user was mentioned in the data
    OR (h.old_data ? 'user_id' AND h.old_data->>'user_id' = p_user_id::TEXT)
    OR (h.new_data ? 'user_id' AND h.new_data->>'user_id' = p_user_id::TEXT)
  ORDER BY 
    h.event_timestamp DESC
  LIMIT 
    p_limit;
END;
$$;

-- 7. Create function to export user audit history to CSV
CREATE OR REPLACE FUNCTION export_user_audit_history_csv(p_user_id UUID)
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
  csv_output := 'Timestamp,Event Type,Object ID,Object Type,Program ID,User ID,User Email,Old Data,New Data' || E'\n';
  
  -- CSV Data
  FOR rec IN 
    SELECT 
      h.event_timestamp,
      h.update_type::TEXT,
      h.object_id,
      h.object_type,
      h.program_id,
      h.user_id,
      h.user_email,
      h.old_data,
      h.new_data
    FROM 
      pilot_program_history h
    WHERE 
      -- Include events where this user was the actor
      h.user_id = p_user_id
      -- Or events where this user was the subject (based on object_id for user-related events)
      OR (h.object_id = p_user_id AND h.object_type = 'user')
      -- Or events where this user was mentioned in the data
      OR (h.old_data ? 'user_id' AND h.old_data->>'user_id' = p_user_id::TEXT)
      OR (h.new_data ? 'user_id' AND h.new_data->>'user_id' = p_user_id::TEXT)
    ORDER BY 
      h.event_timestamp DESC
  LOOP
    csv_output := csv_output || 
      to_char(rec.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || ',' ||
      rec.update_type || ',' ||
      rec.object_id || ',' ||
      rec.object_type || ',' ||
      COALESCE(rec.program_id::TEXT, '') || ',' ||
      COALESCE(rec.user_id::TEXT, '') || ',' ||
      COALESCE('"' || replace(rec.user_email, '"', '""') || '"', '') || ',' ||
      COALESCE('"' || replace(rec.old_data::TEXT, '"', '""') || '"', '') || ',' ||
      COALESCE('"' || replace(rec.new_data::TEXT, '"', '""') || '"', '') ||
      E'\n';
  END LOOP;
  
  RETURN csv_output;
END;
$$;

-- 8. Update the user authentication check to respect is_active status
CREATE OR REPLACE FUNCTION check_user_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT is_active 
    FROM users 
    WHERE id = auth.uid()
  );
END;
$$;

-- 9. Create policies to restrict inactive users from accessing data
-- First, create policy on users table to allow inactive users to see their own profile
CREATE POLICY "Inactive users can only see their own profile" ON users
  FOR SELECT
  USING (
    -- Either the user is active
    (SELECT is_active FROM users WHERE id = auth.uid())
    -- Or they're looking at their own profile
    OR id = auth.uid()
  );

-- 10. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION deactivate_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reactivate_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION demote_company_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_audit_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION export_user_audit_history_csv(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_active() TO authenticated;

-- 11. Add comments for documentation
COMMENT ON COLUMN users.is_active IS 'Indicates whether the user account is active (TRUE) or deactivated (FALSE)';
COMMENT ON FUNCTION deactivate_user(UUID) IS 'Deactivates a user, setting is_active to FALSE and changing all roles to ReadOnly';
COMMENT ON FUNCTION reactivate_user(UUID) IS 'Reactivates a previously deactivated user';
COMMENT ON FUNCTION demote_company_admin(UUID) IS 'Removes company admin status from a user and sets all program roles to ReadOnly';
COMMENT ON FUNCTION get_user_audit_history(UUID, INTEGER) IS 'Retrieves audit history for a specific user';
COMMENT ON FUNCTION export_user_audit_history_csv(UUID) IS 'Exports audit history for a specific user as CSV';
COMMENT ON FUNCTION check_user_active() IS 'Checks if the current user is active';
COMMENT ON POLICY "Inactive users can only see their own profile" ON users IS 'Allows inactive users to see their own profile but restricts access to other data';