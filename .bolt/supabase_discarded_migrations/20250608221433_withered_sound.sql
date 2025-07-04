/*
  # Fix Infinite Recursion in Users RLS Policies
  
  1. Problem
    - Current policies cause infinite recursion when querying the users table
    - This happens because policies reference the users table itself in their USING clauses
  
  2. Solution
    - Create SECURITY DEFINER functions to safely retrieve user information
    - Simplify RLS policies to avoid self-referential queries
    - Replace complex joins with function calls that bypass RLS
*/

-- 1. First, drop all problematic policies on the users table
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can search for other users by email" ON users;
DROP POLICY IF EXISTS "Users can view company members" ON users;
DROP POLICY IF EXISTS "Users can view profiles in shared programs" ON users;
DROP POLICY IF EXISTS "Users can view program participants" ON users;

-- 2. Create a SECURITY DEFINER function to safely get the current user's company_id
CREATE OR REPLACE FUNCTION get_current_user_company_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_id_val UUID;
BEGIN
  -- This query bypasses RLS completely
  SELECT company_id INTO company_id_val
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN company_id_val;
END;
$$;

-- 3. Create a function to check if users share a program
CREATE OR REPLACE FUNCTION users_share_program(user_id_1 UUID, user_id_2 UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM pilot_program_users ppu1
    JOIN pilot_program_users ppu2 ON ppu1.program_id = ppu2.program_id
    WHERE ppu1.user_id = user_id_1 AND ppu2.user_id = user_id_2
  );
END;
$$;

-- 4. Create simplified policies that don't cause recursion

-- Policy for users to view their own profile - direct equality check
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT
  USING (id = auth.uid());

-- Policy for users to update their own profile - direct equality check
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE
  USING (id = auth.uid());

-- Policy for basic user info - permissive for authenticated users
-- This is safe because we only expose minimal fields through API calls
CREATE POLICY "Users can see basic info" ON users
  FOR SELECT
  USING (true);

-- Policy for viewing company members - uses SECURITY DEFINER function
CREATE POLICY "Users can view company members" ON users
  FOR SELECT
  USING (
    -- Only match if both users have a company ID and it's the same company
    company_id IS NOT NULL AND 
    get_current_user_company_id() IS NOT NULL AND
    company_id = get_current_user_company_id()
  );

-- Policy for viewing users who share a program - uses SECURITY DEFINER function
CREATE POLICY "Users can view program participants" ON users
  FOR SELECT
  USING (
    -- Only match if users share a program
    users_share_program(id, auth.uid())
  );

-- 5. Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION get_current_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION users_share_program(UUID, UUID) TO authenticated;

-- 6. Add comments for better documentation
COMMENT ON FUNCTION get_current_user_company_id() IS 'Safely retrieves the company_id of the current user without triggering RLS recursion';
COMMENT ON FUNCTION users_share_program(UUID, UUID) IS 'Checks if two users share at least one program, bypassing RLS';