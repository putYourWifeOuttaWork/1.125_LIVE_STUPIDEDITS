/*
  # Add Site Weather Default Columns
  
  1. New Columns
    - Add default_temperature, default_humidity and default_weather columns to the sites table
    - These will store site-specific weather defaults for pre-filling new submissions
  
  2. New RPC Function
    - Create update_site_weather_defaults function to safely update these values
    - Ensures proper permissions for users updating the defaults
*/

-- Add default_temperature, default_humidity, and default_weather columns to sites table
ALTER TABLE sites 
ADD COLUMN default_temperature NUMERIC(5,2) NULL,
ADD COLUMN default_humidity NUMERIC(5,2) NULL,
ADD COLUMN default_weather weather_enum NULL;

-- Create RPC function to update site weather defaults
CREATE OR REPLACE FUNCTION update_site_weather_defaults(
  p_site_id UUID,
  p_temperature NUMERIC,
  p_humidity NUMERIC,
  p_weather weather_enum
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_program_id UUID;
  v_result JSONB;
BEGIN
  -- Get the program_id for this site
  SELECT program_id INTO v_program_id
  FROM sites
  WHERE site_id = p_site_id;
  
  IF v_program_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Site not found');
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
    RETURN jsonb_build_object('success', FALSE, 'message', 'Insufficient permissions to update site weather defaults');
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
  
  RETURN jsonb_build_object('success', TRUE, 'message', 'Site weather defaults updated successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_site_weather_defaults(UUID, NUMERIC, NUMERIC, weather_enum) TO authenticated;

-- Add comments to the new columns
COMMENT ON COLUMN sites.default_temperature IS 'Default temperature for new submissions at this site';
COMMENT ON COLUMN sites.default_humidity IS 'Default humidity for new submissions at this site';
COMMENT ON COLUMN sites.default_weather IS 'Default weather condition for new submissions at this site';