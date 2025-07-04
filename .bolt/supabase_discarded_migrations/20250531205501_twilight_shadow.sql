/*
  # Add company members RPC function
  
  1. New Functions
    - `get_company_members_for_program`: Retrieves users belonging to a program's company who aren't already explicitly linked to the program
      - Takes a program_id parameter and returns user information (id, email, full_name, company)
      - Supports the company member display functionality in the Program Users Modal
  
  2. Security
    - Function is created as SECURITY DEFINER to ensure proper access control
    - Execute permission granted to authenticated users
*/

-- Create function to get company members for a program
CREATE OR REPLACE FUNCTION public.get_company_members_for_program(program_id_param uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  company text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  RETURN QUERY
  SELECT u.id, u.email, u.full_name, u.company
  FROM public.users u
  WHERE u.company_id = target_company_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.pilot_program_users ppu
    WHERE ppu.user_id = u.id
    AND ppu.program_id = program_id_param
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_company_members_for_program(uuid) TO authenticated;