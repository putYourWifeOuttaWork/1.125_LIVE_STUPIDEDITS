/*
  # Fix site weather defaults function
  
  1. Changes
    - Drop existing update_site_weather_defaults function
    - Create a new version with proper parameter handling and return type
    
  2. Security
    - Function runs with SECURITY DEFINER to ensure permissions
    - Only allows updates if the user has appropriate access rights
*/

-- First drop the existing function
DROP FUNCTION IF EXISTS update_site_weather_defaults(uuid, numeric, numeric, weather_enum);

-- Create function to update site weather defaults
CREATE OR REPLACE FUNCTION public.update_site_weather_defaults(
    p_site_id uuid,
    p_temperature numeric,
    p_humidity numeric,
    p_weather weather_enum
)
RETURNS jsonb AS $$
DECLARE
  v_program_id UUID;
  v_result jsonb;
BEGIN
  -- Get the program_id for this site
  SELECT program_id INTO v_program_id
  FROM sites
  WHERE site_id = p_site_id;
  
  IF v_program_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Site not found');
  END IF;
  
  -- Check if the user has permission to update this site
  -- Either they are a program admin/editor or a company admin
  IF NOT (
    EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE program_id = v_program_id
      AND user_id = auth.uid()
      AND (role = 'Admin' OR role = 'Edit')
    ) OR 
    is_company_admin_for_program(v_program_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions to update site weather defaults');
  END IF;
  
  -- Update the site's weather defaults
  UPDATE sites
  SET 
    default_temperature = p_temperature,
    default_humidity = p_humidity,
    default_weather = p_weather,
    updated_at = now(),
    lastupdated_by = auth.uid()
  WHERE site_id = p_site_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Site weather defaults updated successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_site_weather_defaults(UUID, NUMERIC, NUMERIC, weather_enum) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.update_site_weather_defaults IS 'Updates weather defaults (temperature, humidity, weather condition) for a site';