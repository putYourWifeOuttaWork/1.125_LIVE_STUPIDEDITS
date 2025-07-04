-- 1. Add indoor environment columns to sites table
ALTER TABLE sites 
ADD COLUMN default_indoor_temperature NUMERIC(5,2) NULL CHECK (default_indoor_temperature >= 32 AND default_indoor_temperature <= 120),
ADD COLUMN default_indoor_humidity NUMERIC(5,2) NULL CHECK (default_indoor_humidity >= 1 AND default_indoor_humidity <= 100);

-- 2. Add indoor environment columns to submissions table
ALTER TABLE submissions 
ADD COLUMN indoor_temperature NUMERIC(5,2) NULL CHECK (indoor_temperature >= 32 AND indoor_temperature <= 120),
ADD COLUMN indoor_humidity NUMERIC(5,2) NULL CHECK (indoor_humidity >= 1 AND indoor_humidity <= 100);

-- 3. Update the submission_defaults JSONB validation function (if exists)
CREATE OR REPLACE FUNCTION validate_submission_defaults(defaults JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if required fields exist and are of correct type
  RETURN (
    (defaults ? 'temperature' AND jsonb_typeof(defaults->'temperature') IN ('number', 'string')) AND
    (defaults ? 'humidity' AND jsonb_typeof(defaults->'humidity') IN ('number', 'string')) AND
    (defaults ? 'airflow' AND jsonb_typeof(defaults->'airflow') = 'string') AND
    (defaults ? 'odor_distance' AND jsonb_typeof(defaults->'odor_distance') = 'string') AND
    -- These are optional but if present should be valid
    (NOT defaults ? 'indoor_temperature' OR jsonb_typeof(defaults->'indoor_temperature') IN ('number', 'string')) AND
    (NOT defaults ? 'indoor_humidity' OR jsonb_typeof(defaults->'indoor_humidity') IN ('number', 'string'))
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to get environmental trends with configurable granularity
CREATE OR REPLACE FUNCTION get_environmental_trends_v2(
  p_program_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (
  interval_start TIMESTAMPTZ,
  avg_temperature NUMERIC(5,2),
  avg_humidity NUMERIC(5,2),
  avg_indoor_temperature NUMERIC(5,2),
  avg_indoor_humidity NUMERIC(5,2),
  submission_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  -- Check if user has access to the program (direct or via company)
  IF p_program_id IS NOT NULL THEN
    SELECT EXISTS (
      -- Direct program access through pilot_program_users
      SELECT 1 FROM pilot_program_users 
      WHERE program_id = p_program_id AND user_id = auth.uid()
    ) OR EXISTS (
      -- Company-based access
      SELECT 1 FROM pilot_programs pp
      JOIN users u ON pp.company_id = u.company_id
      WHERE pp.program_id = p_program_id AND u.id = auth.uid() AND u.company_id IS NOT NULL
    ) INTO has_access;
    
    IF NOT has_access THEN
      RAISE EXCEPTION 'Access denied to program %', p_program_id;
    END IF;
  END IF;
  
  -- Check if user has access to the site (via program or company)
  IF p_site_id IS NOT NULL THEN
    SELECT EXISTS (
      -- Access via program
      SELECT 1 FROM sites s
      JOIN pilot_program_users ppu ON s.program_id = ppu.program_id
      WHERE s.site_id = p_site_id AND ppu.user_id = auth.uid()
    ) OR EXISTS (
      -- Company-based access
      SELECT 1 FROM sites s
      JOIN pilot_programs pp ON s.program_id = pp.program_id
      JOIN users u ON pp.company_id = u.company_id
      WHERE s.site_id = p_site_id AND u.id = auth.uid() AND u.company_id IS NOT NULL
    ) INTO has_access;
    
    IF NOT has_access THEN
      RAISE EXCEPTION 'Access denied to site %', p_site_id;
    END IF;
  END IF;

  -- Return the result based on the specified granularity
  RETURN QUERY
  SELECT
    CASE p_granularity
      -- 12-hour intervals (1st half or 2nd half of day in ET)
      WHEN '12hour' THEN
        CASE 
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'America/New_York') < 12 THEN
            (DATE(s.created_at AT TIME ZONE 'America/New_York') + INTERVAL '0 hours')::TIMESTAMPTZ
          ELSE
            (DATE(s.created_at AT TIME ZONE 'America/New_York') + INTERVAL '12 hours')::TIMESTAMPTZ
        END
      -- Daily intervals
      WHEN 'day' THEN
        DATE_TRUNC('day', s.created_at)::TIMESTAMPTZ
      -- Weekly intervals
      WHEN 'week' THEN
        DATE_TRUNC('week', s.created_at)::TIMESTAMPTZ
      -- Default to daily if invalid granularity
      ELSE
        DATE_TRUNC('day', s.created_at)::TIMESTAMPTZ
    END AS interval_start,
    
    -- Average environmental values
    ROUND(AVG(s.temperature)::NUMERIC, 2) AS avg_temperature,
    ROUND(AVG(s.humidity)::NUMERIC, 2) AS avg_humidity,
    ROUND(AVG(s.indoor_temperature)::NUMERIC, 2) AS avg_indoor_temperature,
    ROUND(AVG(s.indoor_humidity)::NUMERIC, 2) AS avg_indoor_humidity,
    
    -- Count of submissions in each interval
    COUNT(*)::BIGINT AS submission_count
    
  FROM submissions s
  WHERE
    -- Date range filter
    s.created_at BETWEEN p_start_date AND (p_end_date + INTERVAL '1 day')
    
    -- Program filter (if specified)
    AND (p_program_id IS NULL OR s.program_id = p_program_id)
    
    -- Site filter (if specified)
    AND (p_site_id IS NULL OR s.site_id = p_site_id)
    
  GROUP BY interval_start
  ORDER BY interval_start;
END;
$$;

-- 5. Create function to get weather condition counts with configurable granularity
CREATE OR REPLACE FUNCTION get_weather_condition_counts(
  p_program_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (
  interval_start TIMESTAMPTZ,
  clear_count BIGINT,
  cloudy_count BIGINT,
  rain_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  -- Check if user has access to the program (direct or via company)
  IF p_program_id IS NOT NULL THEN
    SELECT EXISTS (
      -- Direct program access through pilot_program_users
      SELECT 1 FROM pilot_program_users 
      WHERE program_id = p_program_id AND user_id = auth.uid()
    ) OR EXISTS (
      -- Company-based access
      SELECT 1 FROM pilot_programs pp
      JOIN users u ON pp.company_id = u.company_id
      WHERE pp.program_id = p_program_id AND u.id = auth.uid() AND u.company_id IS NOT NULL
    ) INTO has_access;
    
    IF NOT has_access THEN
      RAISE EXCEPTION 'Access denied to program %', p_program_id;
    END IF;
  END IF;
  
  -- Check if user has access to the site (via program or company)
  IF p_site_id IS NOT NULL THEN
    SELECT EXISTS (
      -- Access via program
      SELECT 1 FROM sites s
      JOIN pilot_program_users ppu ON s.program_id = ppu.program_id
      WHERE s.site_id = p_site_id AND ppu.user_id = auth.uid()
    ) OR EXISTS (
      -- Company-based access
      SELECT 1 FROM sites s
      JOIN pilot_programs pp ON s.program_id = pp.program_id
      JOIN users u ON pp.company_id = u.company_id
      WHERE s.site_id = p_site_id AND u.id = auth.uid() AND u.company_id IS NOT NULL
    ) INTO has_access;
    
    IF NOT has_access THEN
      RAISE EXCEPTION 'Access denied to site %', p_site_id;
    END IF;
  END IF;

  -- Return the result based on the specified granularity
  RETURN QUERY
  SELECT
    CASE p_granularity
      -- 12-hour intervals (1st half or 2nd half of day in ET)
      WHEN '12hour' THEN
        CASE 
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'America/New_York') < 12 THEN
            (DATE(s.created_at AT TIME ZONE 'America/New_York') + INTERVAL '0 hours')::TIMESTAMPTZ
          ELSE
            (DATE(s.created_at AT TIME ZONE 'America/New_York') + INTERVAL '12 hours')::TIMESTAMPTZ
        END
      -- Daily intervals
      WHEN 'day' THEN
        DATE_TRUNC('day', s.created_at)::TIMESTAMPTZ
      -- Weekly intervals
      WHEN 'week' THEN
        DATE_TRUNC('week', s.created_at)::TIMESTAMPTZ
      -- Default to daily if invalid granularity
      ELSE
        DATE_TRUNC('day', s.created_at)::TIMESTAMPTZ
    END AS interval_start,
    
    -- Count by weather type
    COUNT(*) FILTER (WHERE s.weather = 'Clear')::BIGINT AS clear_count,
    COUNT(*) FILTER (WHERE s.weather = 'Cloudy')::BIGINT AS cloudy_count,
    COUNT(*) FILTER (WHERE s.weather = 'Rain')::BIGINT AS rain_count,
    COUNT(*)::BIGINT AS total_count
    
  FROM submissions s
  WHERE
    -- Date range filter
    s.created_at BETWEEN p_start_date AND (p_end_date + INTERVAL '1 day')
    
    -- Program filter (if specified)
    AND (p_program_id IS NULL OR s.program_id = p_program_id)
    
    -- Site filter (if specified)
    AND (p_site_id IS NULL OR s.site_id = p_site_id)
    
  GROUP BY interval_start
  ORDER BY interval_start;
END;
$$;

-- 6. Create a function to update site default indoor environmental values
CREATE OR REPLACE FUNCTION update_site_indoor_defaults(
  p_site_id UUID,
  p_indoor_temperature NUMERIC(5,2),
  p_indoor_humidity NUMERIC(5,2)
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
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions to update site indoor defaults');
  END IF;
  
  -- Update the site's indoor defaults
  UPDATE sites
  SET 
    default_indoor_temperature = p_indoor_temperature,
    default_indoor_humidity = p_indoor_humidity,
    updated_at = now(),
    lastupdated_by = auth.uid()
  WHERE site_id = p_site_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Site indoor defaults updated successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 7. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_environmental_trends_v2(UUID, UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weather_condition_counts(UUID, UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_site_indoor_defaults(UUID, NUMERIC, NUMERIC) TO authenticated;

-- 8. Add comments for documentation
COMMENT ON COLUMN sites.default_indoor_temperature IS 'Default indoor temperature for new submissions at this site (Fahrenheit)';
COMMENT ON COLUMN sites.default_indoor_humidity IS 'Default indoor humidity for new submissions at this site (percentage)';
COMMENT ON COLUMN submissions.indoor_temperature IS 'Indoor temperature recorded during this submission (Fahrenheit)';
COMMENT ON COLUMN submissions.indoor_humidity IS 'Indoor humidity recorded during this submission (percentage)';

COMMENT ON FUNCTION get_environmental_trends_v2(UUID, UUID, DATE, DATE, TEXT) IS 'Retrieves temperature and humidity trends over time with configurable granularity (12hour, day, week)';
COMMENT ON FUNCTION get_weather_condition_counts(UUID, UUID, DATE, DATE, TEXT) IS 'Retrieves weather condition counts over time with configurable granularity (12hour, day, week)';
COMMENT ON FUNCTION update_site_indoor_defaults(UUID, NUMERIC, NUMERIC) IS 'Updates the default indoor temperature and humidity values for a site';