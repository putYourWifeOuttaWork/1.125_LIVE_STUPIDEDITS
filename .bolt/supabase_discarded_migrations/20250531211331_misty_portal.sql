-- Fix ambiguous user_id column reference in get_program_users function
-- This migration fixes the "column reference 'user_id' is ambiguous" error

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.get_program_users;

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION public.get_program_users(program_id_param uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  company text,
  role text
) AS $$
BEGIN
  -- Query with fully qualified column references to avoid ambiguity
  RETURN QUERY
  SELECT 
    ppu.id,
    ppu.user_id,
    u.email,
    u.full_name,
    u.company,
    ppu.role::text
  FROM 
    pilot_program_users ppu
    JOIN users u ON ppu.user_id = u.id
  WHERE 
    ppu.program_id = program_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_program_users(uuid) TO authenticated;

-- Also fix the get_company_members_for_program function to be consistent
DROP FUNCTION IF EXISTS public.get_company_members_for_program;

CREATE OR REPLACE FUNCTION public.get_company_members_for_program(program_id_param uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  company text
) AS $$
DECLARE
  target_company_id uuid;
BEGIN
  -- Get the company ID for the given program
  SELECT company_id INTO target_company_id
  FROM public.pilot_programs
  WHERE program_id = program_id_param;
  
  -- If no company is associated with the program, return empty result
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return users who belong to the company but aren't explicitly added to the program
  -- with fully qualified column references
  RETURN QUERY
  SELECT 
    u.id, 
    u.email, 
    u.full_name, 
    u.company
  FROM 
    public.users u
  WHERE 
    u.company_id = target_company_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.pilot_program_users ppu
    WHERE ppu.user_id = u.id
    AND ppu.program_id = program_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_company_members_for_program(uuid) TO authenticated;