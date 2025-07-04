-- Fix Company and User Management Issues
-- This migration adds RPC functions to handle company-user relationships securely

-- 1. Create RPC function to add user to company
CREATE OR REPLACE FUNCTION public.add_user_to_company(
  p_user_email TEXT,
  p_company_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
  v_company_id UUID;
  v_target_user_id UUID;
  v_result JSON;
BEGIN
  -- Get current user ID
  v_current_user_id := auth.uid();
  
  -- Check if current user is admin of the specified company
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE id = v_current_user_id AND company_id = p_company_id AND is_company_admin = TRUE;
  
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Not authorized to add users to this company');
  END IF;
  
  -- Find target user by email
  SELECT id INTO v_target_user_id
  FROM public.users
  WHERE email = p_user_email;
  
  IF v_target_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'User not found');
  END IF;
  
  -- Check if user is already in a company
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_target_user_id AND company_id IS NOT NULL) THEN
    RETURN json_build_object('success', FALSE, 'message', 'User already belongs to a company');
  END IF;
  
  -- Add user to company
  UPDATE public.users
  SET company_id = p_company_id, is_company_admin = FALSE
  WHERE id = v_target_user_id;
  
  RETURN json_build_object('success', TRUE, 'message', 'User added to company successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;

-- 2. Create RPC function to update user's company admin status
CREATE OR REPLACE FUNCTION public.update_user_company_admin_status(
  p_user_id UUID,
  p_is_admin BOOLEAN,
  p_company_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
  v_company_id UUID;
  v_admin_count INTEGER;
  v_result JSON;
BEGIN
  -- Get current user ID
  v_current_user_id := auth.uid();
  
  -- Check if current user is admin of the specified company
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE id = v_current_user_id AND company_id = p_company_id AND is_company_admin = TRUE;
  
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Not authorized to update admin status');
  END IF;
  
  -- If removing admin status, ensure there will still be at least one admin
  IF NOT p_is_admin THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.users
    WHERE company_id = p_company_id AND is_company_admin = TRUE;
    
    -- If the user we're updating is currently an admin
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND company_id = p_company_id AND is_company_admin = TRUE) THEN
      -- And if there's only one admin left
      IF v_admin_count <= 1 THEN
        RETURN json_build_object('success', FALSE, 'message', 'Cannot remove last company admin');
      END IF;
    END IF;
  END IF;
  
  -- Update user's admin status
  UPDATE public.users
  SET is_company_admin = p_is_admin
  WHERE id = p_user_id AND company_id = p_company_id;
  
  IF FOUND THEN
    RETURN json_build_object('success', TRUE, 'message', 'Admin status updated successfully');
  ELSE
    RETURN json_build_object('success', FALSE, 'message', 'User not found in this company');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;

-- 3. Create RPC function to check if a user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
END;
$$;

-- 4. Add is_super_admin column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- 5. Create RPC function for company creation restrictions
CREATE OR REPLACE FUNCTION public.can_create_company()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  has_company BOOLEAN;
  is_super BOOLEAN;
BEGIN
  -- Check if user already has a company
  SELECT (company_id IS NOT NULL) INTO has_company
  FROM public.users
  WHERE id = auth.uid();
  
  -- Check if user is a super admin
  SELECT is_super_admin INTO is_super
  FROM public.users
  WHERE id = auth.uid();
  
  -- User can create company if they don't have one or are super admin
  RETURN (NOT has_company) OR is_super;
END;
$$;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.add_user_to_company(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_company_admin_status(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_company() TO authenticated;

-- 7. Fix pilot_program_users RLS policies to allow company admins to manage their users
DROP POLICY IF EXISTS "pilot_program_users_insert" ON "public"."pilot_program_users";
CREATE POLICY "pilot_program_users_insert" ON pilot_program_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid() AND role = 'Admin'
    ) OR (
      program_id IN (
        SELECT pp.program_id FROM pilot_programs pp
        JOIN users u ON pp.company_id = u.company_id
        WHERE u.id = auth.uid() AND u.is_company_admin = TRUE
      )
    )
  );

-- 8. Fix user search capabilities for adding users to programs
CREATE OR REPLACE FUNCTION public.search_users_by_email(
  search_query TEXT,
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, u.full_name
  FROM public.users u
  WHERE u.email ILIKE '%' || search_query || '%'
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users_by_email(TEXT, INTEGER) TO authenticated;

-- 9. Create RPC function to get user's company details
CREATE OR REPLACE FUNCTION public.get_user_company()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_company_record RECORD;
  v_is_admin BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  -- Get user's company and admin status
  SELECT c.*, u.is_company_admin INTO v_company_record
  FROM public.users u
  JOIN public.companies c ON u.company_id = c.company_id
  WHERE u.id = v_user_id;
  
  IF v_company_record IS NULL THEN
    RETURN json_build_object('has_company', FALSE);
  ELSE
    RETURN json_build_object(
      'has_company', TRUE,
      'company', json_build_object(
        'company_id', v_company_record.company_id,
        'name', v_company_record.name,
        'description', v_company_record.description,
        'website', v_company_record.website,
        'logo_url', v_company_record.logo_url,
        'created_at', v_company_record.created_at,
        'updated_at', v_company_record.updated_at
      ),
      'is_admin', v_company_record.is_company_admin
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('has_company', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_company() TO authenticated;