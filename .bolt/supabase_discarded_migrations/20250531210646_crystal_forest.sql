/*
  # Fix ambiguous user_id column reference

  1. Updates
    - Modifies the `get_program_users` function to qualify all ambiguous `user_id` references with proper table aliases
    - Ensures column references are explicitly qualified in joined queries
  
  2. Reason for Change
    - Fixes the "column reference 'user_id' is ambiguous" error
    - Prevents SQL query failures due to column name conflicts in joined tables
*/

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

-- Update the get_company_members_for_program function if it exists and has similar issues
DROP FUNCTION IF EXISTS public.get_company_members_for_program;

CREATE OR REPLACE FUNCTION public.get_company_members_for_program(program_id_param uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  company text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.full_name,
    u.company
  FROM 
    users u
    JOIN pilot_programs pp ON u.company_id = pp.company_id
  WHERE 
    pp.program_id = program_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;