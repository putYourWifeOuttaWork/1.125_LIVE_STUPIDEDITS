/*
  # Update Site Weather Defaults to Include Respond Role
  
  1. Changes
    - Creates a new version of the site weather defaults update function
    - Allows users with 'Respond' role to update site weather defaults
    - Maintains existing permissions for 'Admin' and 'Edit' roles and company admins
  
  2. Security
    - Security Definer ensures the function runs with the permissions of the creator
    - Explicit permission checks validate user access rights
*/

-- Create a new version of the function (avoiding dropping the old one first)
CREATE OR REPLACE FUNCTION update_site_weather_defaults(
  p_site_id uuid,
  p_temperature numeric,
  p_humidity numeric,
  p_weather weather_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_program_id uuid;
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
  -- Now includes 'Respond' role in addition to 'Admin' and 'Edit'
  IF NOT (
    EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE program_id = v_program_id
      AND user_id = auth.uid()
      AND (role = 'Admin' OR role = 'Edit' OR role = 'Respond')
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
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_site_weather_defaults(uuid, numeric, numeric, weather_enum) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION update_site_weather_defaults IS 'Updates weather defaults (temperature, humidity, weather condition) for a site. Accessible to users with Admin, Edit, or Respond roles.';