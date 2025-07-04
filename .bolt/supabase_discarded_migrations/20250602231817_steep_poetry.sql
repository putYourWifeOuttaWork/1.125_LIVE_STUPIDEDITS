-- Remove weather analytics function since it's no longer needed

-- First, drop the function if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_weather_distribution_over_time'
  ) THEN
    DROP FUNCTION IF EXISTS get_weather_distribution_over_time(UUID, UUID, DATE, DATE);
  END IF;
END $$;