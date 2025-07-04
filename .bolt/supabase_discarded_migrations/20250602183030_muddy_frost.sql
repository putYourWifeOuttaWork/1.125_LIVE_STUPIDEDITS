/*
  # Add Company Default Weather Feature
  
  1. Changes
    - Add a default_weather column to the companies table
    - Create RPC function to update company default weather
    - Modify update_company function to include default_weather
  
  2. Security
    - Only company admins can update company default weather
    - Respects existing permissions
*/

-- Add the default_weather column to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_weather weather_enum DEFAULT 'Clear'::weather_enum;

-- Create function to update company default weather
CREATE OR REPLACE FUNCTION update_company_default_weather(
  company_id_param UUID,
  weather_param weather_enum
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Check if the user is a company admin
  SELECT is_company_admin INTO v_is_admin
  FROM users
  WHERE id = v_user_id AND company_id = company_id_param;
  
  -- Only allow company admins to update
  IF v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Only company administrators can update company settings'
    );
  END IF;
  
  -- Update the default weather
  UPDATE companies
  SET default_weather = weather_param
  WHERE company_id = company_id_param;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Company default weather updated successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_company_default_weather(UUID, weather_enum) TO authenticated;

-- Create function to get recent submissions across all programs
CREATE OR REPLACE FUNCTION get_recent_submissions(limit_param INTEGER DEFAULT 10)
RETURNS TABLE (
  submission_id UUID,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  temperature NUMERIC,
  humidity NUMERIC,
  created_at TIMESTAMPTZ,
  petri_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.submission_id,
    s.site_id,
    sites.name as site_name,
    s.program_id,
    pp.name as program_name,
    s.temperature,
    s.humidity,
    s.created_at,
    COUNT(po.observation_id) as petri_count
  FROM 
    submissions s
    JOIN sites ON s.site_id = sites.site_id
    JOIN pilot_programs pp ON s.program_id = pp.program_id
    LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
  WHERE 
    -- Either user has direct access to the program
    pp.program_id IN (
      SELECT program_id FROM pilot_program_users WHERE user_id = auth.uid()
    )
    -- Or user's company has access to the program
    OR pp.company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  GROUP BY 
    s.submission_id, s.site_id, sites.name, s.program_id, pp.name, s.temperature, s.humidity, s.created_at
  ORDER BY 
    s.created_at DESC
  LIMIT 
    limit_param;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_recent_submissions(INTEGER) TO authenticated;

-- Add comment for the new column
COMMENT ON COLUMN companies.default_weather IS 'Default weather value for company submissions';