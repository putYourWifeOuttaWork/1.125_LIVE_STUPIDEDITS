/*
  # Add Missing Enum Values to Report Metadata Function
  
  1. Changes
    - Update get_available_report_metadata function to include enum_values for all enum fields
    - Add values for petri_observations.placement
    - Add values for petri_observations.placement_dynamics
    - Add values for gasifier_observations.chemical_type
    - Add values for gasifier_observations.placement_height
    - Add values for gasifier_observations.directional_placement
    - Add values for gasifier_observations.placement_strategy
    - Add values for sites.type
    
  2. Purpose
    - Enable proper rendering of enum dropdowns in the report builder UI
    - Ensure filter fields display appropriate value selections for enum types
    - Fix issue where enum field dropdowns were not rendering properly
*/

-- Create updated function with all enum values
CREATE OR REPLACE FUNCTION get_available_report_metadata()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  result = jsonb_build_array(
    -- Submissions
    jsonb_build_object(
      'entity', 'submissions',
      'label', 'Submissions',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'submission_id', 'label', 'Submission ID', 'type', 'uuid', 'roles', jsonb_build_array('filter')),
        jsonb_build_object('name', 'global_submission_id', 'label', 'Global Submission ID', 'type', 'integer', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'created_at', 'label', 'Submission Date', 'type', 'timestamp', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'temperature', 'label', 'Temperature', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'humidity', 'label', 'Humidity', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'indoor_temperature', 'label', 'Indoor Temperature', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'indoor_humidity', 'label', 'Indoor Humidity', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'airflow', 'label', 'Airflow', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Open', 'Closed')),
        jsonb_build_object('name', 'odor_distance', 'label', 'Odor Distance', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('5-10ft', '10-25ft', '25-50ft', '50-100ft', '>100ft')),
        jsonb_build_object('name', 'weather', 'label', 'Weather', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Clear', 'Cloudy', 'Rain'))
      ),
      'aggregations', jsonb_build_array(
        jsonb_build_object('name', 'count', 'label', 'Count of Submissions', 'function', 'COUNT'),
        jsonb_build_object('name', 'avg_temperature', 'label', 'Average Temperature', 'function', 'AVG', 'field', 'temperature'),
        jsonb_build_object('name', 'avg_humidity', 'label', 'Average Humidity', 'function', 'AVG', 'field', 'humidity')
      ),
      'join_keys', jsonb_build_object(
        'sites', jsonb_build_object('local', 'site_id', 'foreign', 'site_id'),
        'pilot_programs', jsonb_build_object('local', 'program_id', 'foreign', 'program_id'),
        'users', jsonb_build_object('local', 'created_by', 'foreign', 'id')
      )
    ),
    
    -- Petri Observations
    jsonb_build_object(
      'entity', 'petri_observations',
      'label', 'Petri Observations',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'observation_id', 'label', 'Observation ID', 'type', 'uuid', 'roles', jsonb_build_array('filter')),
        jsonb_build_object('name', 'petri_code', 'label', 'Petri Code', 'type', 'text', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'created_at', 'label', 'Creation Date', 'type', 'timestamp', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'fungicide_used', 'label', 'Fungicide Used', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Yes', 'No')),
        jsonb_build_object('name', 'petri_growth_stage', 'label', 'Growth Stage', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('None', 'Trace', 'Very Low', 'Low', 'Moderate', 'Moderately High', 'High', 'Very High', 'Hazardous', 'TNTC Overrun')),
        jsonb_build_object('name', 'growth_index', 'label', 'Growth Index', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'growth_progression', 'label', 'Growth Progression', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'placement', 'label', 'Placement', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Front-Center', 'Front-Left', 'Front-Right', 'Center-Center', 'Center-Left', 'Center-Right', 'Back-Center', 'Back-Left', 'Back-Right')),
        jsonb_build_object('name', 'placement_dynamics', 'label', 'Placement Dynamics', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Near Port', 'Near Door', 'Near Ventillation Out', 'Near Airflow In')),
        jsonb_build_object('name', 'outdoor_temperature', 'label', 'Outdoor Temperature', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'outdoor_humidity', 'label', 'Outdoor Humidity', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'todays_day_of_phase', 'label', 'Day of Phase', 'type', 'numeric', 'roles', jsonb_build_array('dimension', 'filter'))
      ),
      'aggregations', jsonb_build_array(
        jsonb_build_object('name', 'count', 'label', 'Count of Petri Observations', 'function', 'COUNT'),
        jsonb_build_object('name', 'avg_growth_index', 'label', 'Average Growth Index', 'function', 'AVG', 'field', 'growth_index'),
        jsonb_build_object('name', 'max_growth_index', 'label', 'Maximum Growth Index', 'function', 'MAX', 'field', 'growth_index')
      ),
      'join_keys', jsonb_build_object(
        'submissions', jsonb_build_object('local', 'submission_id', 'foreign', 'submission_id'),
        'sites', jsonb_build_object('local', 'site_id', 'foreign', 'site_id')
      )
    ),
    
    -- Gasifier Observations
    jsonb_build_object(
      'entity', 'gasifier_observations',
      'label', 'Gasifier Observations',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'observation_id', 'label', 'Observation ID', 'type', 'uuid', 'roles', jsonb_build_array('filter')),
        jsonb_build_object('name', 'gasifier_code', 'label', 'Gasifier Code', 'type', 'text', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'created_at', 'label', 'Creation Date', 'type', 'timestamp', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'chemical_type', 'label', 'Chemical Type', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('1-MCP', 'Acetic Acid', 'CLO2', 'Citronella Blend', 'Essential Oils Blend', 'Geraniol', 'Other')),
        jsonb_build_object('name', 'measure', 'label', 'Measure', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'anomaly', 'label', 'Anomaly', 'type', 'boolean', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'placement_height', 'label', 'Placement Height', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('High', 'Medium', 'Low')),
        jsonb_build_object('name', 'directional_placement', 'label', 'Directional Placement', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Front-Center', 'Front-Left', 'Front-Right', 'Center-Center', 'Center-Left', 'Center-Right', 'Back-Center', 'Back-Left', 'Back-Right')),
        jsonb_build_object('name', 'placement_strategy', 'label', 'Placement Strategy', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Perimeter Coverage', 'Centralized Coverage', 'Centralized and Perimeter Coverage', 'Targeted Coverage', 'Spot Placement Coverage')),
        jsonb_build_object('name', 'outdoor_temperature', 'label', 'Outdoor Temperature', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'outdoor_humidity', 'label', 'Outdoor Humidity', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'todays_day_of_phase', 'label', 'Day of Phase', 'type', 'numeric', 'roles', jsonb_build_array('dimension', 'filter'))
      ),
      'aggregations', jsonb_build_array(
        jsonb_build_object('name', 'count', 'label', 'Count of Gasifier Observations', 'function', 'COUNT'),
        jsonb_build_object('name', 'avg_measure', 'label', 'Average Measure', 'function', 'AVG', 'field', 'measure')
      ),
      'join_keys', jsonb_build_object(
        'submissions', jsonb_build_object('local', 'submission_id', 'foreign', 'submission_id'),
        'sites', jsonb_build_object('local', 'site_id', 'foreign', 'site_id')
      )
    ),
    
    -- Sites
    jsonb_build_object(
      'entity', 'sites',
      'label', 'Sites',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'site_id', 'label', 'Site ID', 'type', 'uuid', 'roles', jsonb_build_array('filter')),
        jsonb_build_object('name', 'name', 'label', 'Site Name', 'type', 'text', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'type', 'label', 'Site Type', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('Greenhouse', 'Production Facility', 'Storage', 'Transport')),
        jsonb_build_object('name', 'total_petris', 'label', 'Total Petris', 'type', 'integer', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'total_gasifiers', 'label', 'Total Gasifiers', 'type', 'integer', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'created_at', 'label', 'Creation Date', 'type', 'timestamp', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'square_footage', 'label', 'Square Footage', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'cubic_footage', 'label', 'Cubic Footage', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'has_dead_zones', 'label', 'Has Dead Zones', 'type', 'boolean', 'roles', jsonb_build_array('dimension', 'filter'))
      ),
      'aggregations', jsonb_build_array(
        jsonb_build_object('name', 'count', 'label', 'Count of Sites', 'function', 'COUNT'),
        jsonb_build_object('name', 'avg_square_footage', 'label', 'Average Square Footage', 'function', 'AVG', 'field', 'square_footage')
      ),
      'join_keys', jsonb_build_object(
        'pilot_programs', jsonb_build_object('local', 'program_id', 'foreign', 'program_id')
      )
    ),
    
    -- Pilot Programs
    jsonb_build_object(
      'entity', 'pilot_programs',
      'label', 'Pilot Programs',
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'program_id', 'label', 'Program ID', 'type', 'uuid', 'roles', jsonb_build_array('filter')),
        jsonb_build_object('name', 'name', 'label', 'Program Name', 'type', 'text', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'status', 'label', 'Status', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter'), 'enum_values', jsonb_build_array('active', 'inactive', 'planned')),
        jsonb_build_object('name', 'start_date', 'label', 'Start Date', 'type', 'date', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'end_date', 'label', 'End Date', 'type', 'date', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'total_submissions', 'label', 'Total Submissions', 'type', 'integer', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'total_sites', 'label', 'Total Sites', 'type', 'integer', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'created_at', 'label', 'Creation Date', 'type', 'timestamp', 'roles', jsonb_build_array('dimension', 'filter'))
      ),
      'aggregations', jsonb_build_array(
        jsonb_build_object('name', 'count', 'label', 'Count of Programs', 'function', 'COUNT')
      ),
      'join_keys', jsonb_build_object(
        'companies', jsonb_build_object('local', 'company_id', 'foreign', 'company_id')
      )
    )
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error generating report metadata: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to execute the updated function
GRANT EXECUTE ON FUNCTION get_available_report_metadata() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_available_report_metadata IS 'Returns metadata about available entities and fields for custom reporting with complete enum values';