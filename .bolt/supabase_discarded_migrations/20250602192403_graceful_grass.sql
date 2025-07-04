-- Add analytics and weather functions for the home page

-- Add a function to get daily submission counts for charts
CREATE OR REPLACE FUNCTION get_daily_submission_counts(
  p_program_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  submission_date DATE,
  submission_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(s.created_at) as submission_date,
    COUNT(*) as submission_count
  FROM 
    submissions s
  WHERE 
    DATE(s.created_at) BETWEEN p_start_date AND p_end_date
    AND (p_program_id IS NULL OR s.program_id = p_program_id)
    AND (p_site_id IS NULL OR s.site_id = p_site_id)
    -- Security check: User must have access to the program
    AND (
      s.program_id IN (
        SELECT program_id FROM pilot_program_users WHERE user_id = auth.uid()
      )
      OR 
      s.program_id IN (
        SELECT pp.program_id FROM pilot_programs pp
        WHERE pp.company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid() AND u.company_id IS NOT NULL
        )
      )
    )
  GROUP BY 
    DATE(s.created_at)
  ORDER BY 
    submission_date;
END;
$$;

-- Add a function to get weather distribution over time
CREATE OR REPLACE FUNCTION get_weather_distribution_over_time(
  p_program_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  submission_date DATE,
  clear_count BIGINT,
  cloudy_count BIGINT,
  rain_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(s.created_at) as submission_date,
    COUNT(*) FILTER (WHERE s.weather = 'Clear') as clear_count,
    COUNT(*) FILTER (WHERE s.weather = 'Cloudy') as cloudy_count,
    COUNT(*) FILTER (WHERE s.weather = 'Rain') as rain_count
  FROM 
    submissions s
  WHERE 
    DATE(s.created_at) BETWEEN p_start_date AND p_end_date
    AND (p_program_id IS NULL OR s.program_id = p_program_id)
    AND (p_site_id IS NULL OR s.site_id = p_site_id)
    -- Security check: User must have access to the program
    AND (
      s.program_id IN (
        SELECT program_id FROM pilot_program_users WHERE user_id = auth.uid()
      )
      OR 
      s.program_id IN (
        SELECT pp.program_id FROM pilot_programs pp
        WHERE pp.company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid() AND u.company_id IS NOT NULL
        )
      )
    )
  GROUP BY 
    DATE(s.created_at)
  ORDER BY 
    submission_date;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_daily_submission_counts(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weather_distribution_over_time(UUID, UUID, DATE, DATE) TO authenticated;