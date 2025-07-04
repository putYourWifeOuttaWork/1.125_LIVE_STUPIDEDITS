/*
  # Add Program Progress Metrics
  
  1. New Features
    - Create a database view that calculates program progress metrics
    - Add days_count_this_program: total days in a program
    - Add day_x_of_program: current day within program lifecycle 
    - Add phase_progress: percentage completion based on days
    
  2. Purpose
    - Enable dynamic tracking of program progress
    - Provide temporal metrics for analytics dashboards
    - Support phase-based program management
*/

-- Create view for program progress metrics
CREATE OR REPLACE VIEW pilot_programs_with_progress AS
SELECT
  p.*,
  -- Calculate the total days in the program (inclusive of start and end date)
  (p.end_date - p.start_date + 1) AS days_count_this_program,
  
  -- Calculate the current day number within the program
  CASE
    -- Before the program starts: day 0
    WHEN CURRENT_DATE < p.start_date THEN 0
    -- During the program: current day number (1-based)
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN 
      (CURRENT_DATE - p.start_date + 1)
    -- After the program ends: max day number (capped at total days)
    ELSE (p.end_date - p.start_date + 1)
  END AS day_x_of_program,
  
  -- Calculate the progress percentage
  CASE
    -- Avoid division by zero if program duration is 0 days
    WHEN (p.end_date - p.start_date + 1) = 0 THEN 0
    -- Before the program starts: 0%
    WHEN CURRENT_DATE < p.start_date THEN 0
    -- During the program: calculate percentage
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN 
      ROUND(((CURRENT_DATE - p.start_date + 1)::NUMERIC / (p.end_date - p.start_date + 1)::NUMERIC) * 100, 2)
    -- After the program ends: 100%
    ELSE 100
  END AS phase_progress
FROM
  pilot_programs p;

-- Grant appropriate permissions
GRANT SELECT ON pilot_programs_with_progress TO authenticated;

-- Add comments for documentation
COMMENT ON VIEW pilot_programs_with_progress IS 'View that extends pilot_programs with dynamic progress metrics';
COMMENT ON COLUMN pilot_programs_with_progress.days_count_this_program IS 'Total number of days in the program (end_date - start_date + 1)';
COMMENT ON COLUMN pilot_programs_with_progress.day_x_of_program IS 'Current day number within the program (0 before start, day number during, max after end)';
COMMENT ON COLUMN pilot_programs_with_progress.phase_progress IS 'Percentage progress through the program based on days elapsed (0-100%)';