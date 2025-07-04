-- Create RPC functions for safer user management in programs
-- This migration adds several SECURITY DEFINER functions that allow
-- secure operations on users and program relationships without
-- exposing the underlying tables directly

-- Function to get program users with their details
CREATE OR REPLACE FUNCTION get_program_users(program_id_param UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  company TEXT,
  role TEXT
) SECURITY DEFINER
AS $$
BEGIN
  -- Check if the user has access to this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE program_id = program_id_param AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this program';
  END IF;

  RETURN QUERY
  SELECT 
    ppu.id,
    ppu.user_id,
    u.email,
    u.full_name,
    u.company,
    ppu.role::TEXT
  FROM 
    pilot_program_users ppu
    JOIN users u ON ppu.user_id = u.id
  WHERE 
    ppu.program_id = program_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function to add a user to a program
CREATE OR REPLACE FUNCTION add_user_to_program(p_email TEXT, p_program_id UUID, p_role TEXT)
RETURNS JSON SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
  v_success BOOLEAN := false;
  v_message TEXT := 'Failed to add user';
BEGIN
  -- Check if the caller is an admin for this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_program_id 
      AND user_id = auth.uid()
      AND role = 'Admin'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Not authorized to add users');
  END IF;

  -- Find user by email
  SELECT id INTO v_user_id FROM users WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'User not found');
  END IF;
  
  -- Check if user is already in the program
  IF EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_program_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'User is already in this program');
  END IF;
  
  -- Add user to program
  INSERT INTO pilot_program_users (program_id, user_id, role)
  VALUES (p_program_id, v_user_id, p_role::user_role_enum);
  
  RETURN json_build_object('success', true, 'message', 'User added successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to update a user's role in a program
CREATE OR REPLACE FUNCTION update_program_user_role(p_relation_id UUID, p_program_id UUID, p_role TEXT)
RETURNS JSON SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Check if the caller is an admin for this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_program_id 
      AND user_id = auth.uid()
      AND role = 'Admin'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Not authorized to update roles');
  END IF;
  
  -- Update the role
  UPDATE pilot_program_users
  SET role = p_role::user_role_enum
  WHERE id = p_relation_id
    AND program_id = p_program_id;
  
  IF FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Role updated successfully');
  ELSE
    RETURN json_build_object('success', false, 'message', 'User or relation not found');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to assign a role to a company member
CREATE OR REPLACE FUNCTION assign_role_to_company_member(p_user_id UUID, p_program_id UUID, p_role TEXT)
RETURNS JSON SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Check if the caller is an admin for this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_program_id 
      AND user_id = auth.uid()
      AND role = 'Admin'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Not authorized to assign roles');
  END IF;
  
  -- Add the user to the program with the specified role
  INSERT INTO pilot_program_users (program_id, user_id, role)
  VALUES (p_program_id, p_user_id, p_role::user_role_enum)
  ON CONFLICT (program_id, user_id) 
  DO UPDATE SET role = p_role::user_role_enum;
  
  RETURN json_build_object('success', true, 'message', 'Role assigned successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to remove a user from a program
CREATE OR REPLACE FUNCTION remove_user_from_program(p_relation_id UUID, p_program_id UUID)
RETURNS JSON SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_user_id UUID;
BEGIN
  -- Check if the caller is an admin for this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_program_id 
      AND user_id = auth.uid()
      AND role = 'Admin'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Not authorized to remove users');
  END IF;
  
  -- Get the user_id before deletion for verification
  SELECT user_id INTO v_user_id
  FROM pilot_program_users
  WHERE id = p_relation_id
    AND program_id = p_program_id;
  
  -- Don't allow removing oneself
  IF v_user_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'message', 'Cannot remove yourself from the program');
  END IF;
  
  -- Remove the user
  DELETE FROM pilot_program_users
  WHERE id = p_relation_id
    AND program_id = p_program_id;
  
  IF FOUND THEN
    RETURN json_build_object('success', true, 'message', 'User removed successfully');
  ELSE
    RETURN json_build_object('success', false, 'message', 'User or relation not found');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_program_users(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_program(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_program_user_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_role_to_company_member(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_user_from_program(UUID, UUID) TO authenticated;

-- Create additional RLS policy for users table to allow basic searches
DROP POLICY IF EXISTS "Users can search for other users by email" ON "public"."users";
CREATE POLICY "Users can search for other users by email" ON users
  FOR SELECT
  USING (TRUE);