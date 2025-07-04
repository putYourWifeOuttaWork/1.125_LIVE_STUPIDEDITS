/*
  # Fix ambiguous program_id column reference
  
  1. Changes
    - Updates the `get_recent_submissions` function to qualify the ambiguous `program_id` column references with appropriate table aliases
    - Ensures all column references in joins and where clauses are properly qualified
  
  2. Issue Fixed
    - Resolves the "column reference 'program_id' is ambiguous" error when fetching recent submissions
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.get_recent_submissions(limit_count integer);

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION public.get_recent_submissions(limit_count integer DEFAULT 5)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  program_id uuid,
  temperature numeric,
  humidity numeric,
  airflow airflow_enum,
  odor_distance odor_distance_enum,
  weather weather_enum,
  notes character varying,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  program_name text,
  site_name character varying,
  user_email text,
  user_full_name text
) LANGUAGE sql AS $$
  SELECT 
    s.submission_id,
    s.site_id,
    s.program_id,
    s.temperature,
    s.humidity,
    s.airflow,
    s.odor_distance,
    s.weather,
    s.notes,
    s.created_by,
    s.created_at,
    s.updated_at,
    s.program_name,
    st.name as site_name,
    u.email as user_email,
    u.full_name as user_full_name
  FROM 
    submissions s
  JOIN 
    sites st ON s.site_id = st.site_id
  LEFT JOIN 
    users u ON s.created_by = u.id
  WHERE 
    s.program_id IN (
      SELECT ppu.program_id 
      FROM pilot_program_users ppu 
      WHERE ppu.user_id = auth.uid()
    )
  ORDER BY 
    s.created_at DESC
  LIMIT limit_count;
$$;

-- Update function permissions
GRANT EXECUTE ON FUNCTION public.get_recent_submissions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_submissions(integer) TO service_role;