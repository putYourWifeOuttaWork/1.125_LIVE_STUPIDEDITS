/*
  # Create Custom Reports System

  1. New Features
    - Create custom_reports table to store user-defined reports
    - Add RPC function to get available report metadata
    - Add RPC function to execute dynamic report queries
    - Set up proper RLS policies for reports

  2. Purpose
    - Enable users to create, save, and execute custom reports
    - Provide metadata about reportable entities and fields
    - Support dynamic query generation with proper security measures
*/

-- Create custom_reports table
CREATE TABLE IF NOT EXISTS custom_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  program_id UUID REFERENCES pilot_programs(program_id),
  configuration JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add index on company_id and created_by_user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_reports_company_id ON custom_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_created_by ON custom_reports(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_program_id ON custom_reports(program_id);

-- Set up Row Level Security (RLS)
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;

-- Users can view reports they created
CREATE POLICY "Users can view their own reports" 
ON custom_reports
FOR SELECT
TO authenticated
USING (created_by_user_id = auth.uid());

-- Users can view reports from their company
CREATE POLICY "Users can view reports from their company" 
ON custom_reports
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id 
    FROM users
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Users can view reports from programs they have access to
CREATE POLICY "Users can view reports from their programs" 
ON custom_reports
FOR SELECT
TO authenticated
USING (
  program_id IN (
    SELECT program_id
    FROM pilot_program_users
    WHERE user_id = auth.uid()
  )
);

-- Users can create reports
CREATE POLICY "Users can create reports" 
ON custom_reports
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid() AND
  company_id IN (
    SELECT company_id 
    FROM users
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Users can update reports they created
CREATE POLICY "Users can update their own reports" 
ON custom_reports
FOR UPDATE
TO authenticated
USING (created_by_user_id = auth.uid());

-- Company admins can update reports within their company
CREATE POLICY "Company admins can update company reports" 
ON custom_reports
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT company_id 
    FROM users
    WHERE id = auth.uid() AND company_id IS NOT NULL AND is_company_admin = true
  )
);

-- Users can delete reports they created
CREATE POLICY "Users can delete their own reports" 
ON custom_reports
FOR DELETE
TO authenticated
USING (created_by_user_id = auth.uid());

-- Company admins can delete reports within their company
CREATE POLICY "Company admins can delete company reports" 
ON custom_reports
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT company_id 
    FROM users
    WHERE id = auth.uid() AND company_id IS NOT NULL AND is_company_admin = true
  )
);

-- Add trigger to update the updated_at timestamp when a report is modified
CREATE OR REPLACE FUNCTION set_updated_at_custom_reports()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_custom_reports
BEFORE UPDATE ON custom_reports
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_custom_reports();

-- Create function to get available report metadata
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
        jsonb_build_object('name', 'placement', 'label', 'Placement', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter')),
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
        jsonb_build_object('name', 'chemical_type', 'label', 'Chemical Type', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'measure', 'label', 'Measure', 'type', 'numeric', 'roles', jsonb_build_array('metric', 'filter')),
        jsonb_build_object('name', 'anomaly', 'label', 'Anomaly', 'type', 'boolean', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'placement_height', 'label', 'Placement Height', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'directional_placement', 'label', 'Directional Placement', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter')),
        jsonb_build_object('name', 'placement_strategy', 'label', 'Placement Strategy', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter')),
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
        jsonb_build_object('name', 'type', 'label', 'Site Type', 'type', 'enum', 'roles', jsonb_build_array('dimension', 'filter')),
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

-- Create function to execute dynamic custom report queries
CREATE OR REPLACE FUNCTION execute_custom_report_query(
  p_report_configuration JSONB,
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  main_entity TEXT;
  dimension_field TEXT;
  dimension_field_quoted TEXT;
  main_entity_quoted TEXT;
  metric_field TEXT;
  metric_field_quoted TEXT;
  metric_function TEXT;
  filter_conditions TEXT := '1=1';
  join_tables JSONB;
  join_clauses TEXT := '';
  time_granularity TEXT;
  date_trunc_expr TEXT;
  order_clause TEXT;
  group_by_clause TEXT;
  full_query TEXT;
  result JSONB;
  time_dimension JSONB;
  date_field TEXT;
  date_field_quoted TEXT;
  filter JSONB;
  filter_field TEXT;
  filter_field_quoted TEXT;
  filter_operator TEXT;
  filter_value TEXT;
  authorized_programs TEXT[];
  authorized_companies TEXT[];
  metric_alias TEXT;
  v_user_id UUID;
  program_id_filter TEXT := '';
  company_id_filter TEXT := '';
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Extract main entity and ensure it's one of the allowed tables
  main_entity := p_report_configuration ->> 'entity';
  
  -- Validate main entity to prevent SQL injection
  IF main_entity NOT IN ('submissions', 'petri_observations', 'gasifier_observations', 'sites', 'pilot_programs') THEN
    RAISE EXCEPTION 'Invalid entity: %', main_entity;
  END IF;
  
  -- Quote the main entity for safe SQL construction
  main_entity_quoted := quote_ident(main_entity);
  
  -- Extract primary dimension
  dimension_field := p_report_configuration -> 'dimensions' ->> 0;
  
  -- Handle time dimensions with granularity
  time_dimension := p_report_configuration -> 'time_dimension';
  IF time_dimension IS NOT NULL THEN
    date_field := time_dimension ->> 'field';
    IF date_field IS NULL THEN 
      RAISE EXCEPTION 'Time dimension field is required';
    END IF;
    
    date_field_quoted := quote_ident(date_field);
    time_granularity := time_dimension ->> 'granularity';
    
    -- Validate granularity
    IF time_granularity NOT IN ('day', 'week', 'month', 'quarter', 'year') THEN
      time_granularity := 'day'; -- Default to day if invalid
    END IF;
    
    -- Create the date_trunc expression
    date_trunc_expr := format('date_trunc(%L, %I.%I)', time_granularity, main_entity, date_field);
    dimension_field := date_trunc_expr;
    dimension_field_quoted := date_trunc_expr;
  ELSE
    -- If not a time dimension, just quote the field
    IF dimension_field IS NOT NULL THEN
      dimension_field_quoted := quote_ident(dimension_field);
    ELSE
      -- Default dimension if none provided
      dimension_field := 'created_at';
      dimension_field_quoted := quote_ident(dimension_field);
      date_trunc_expr := format('date_trunc(%L, %I.%I)', 'day', main_entity, dimension_field);
      dimension_field := date_trunc_expr;
      dimension_field_quoted := date_trunc_expr;
    END IF;
  END IF;
  
  -- Extract metric
  metric_field := p_report_configuration -> 'metrics' ->> 0;
  IF metric_field IS NULL THEN
    -- Default to COUNT(*) if no metric specified
    metric_function := 'COUNT';
    metric_field := '*';
    metric_field_quoted := '*';
    metric_alias := 'count';
  ELSE
    -- Extract function and field
    metric_function := p_report_configuration -> 'metrics' -> 0 ->> 'function';
    IF metric_function IS NULL THEN
      metric_function := 'COUNT';
    END IF;
    
    -- Quote the field name for safe SQL construction
    metric_field_quoted := quote_ident(metric_field);
    metric_alias := lower(metric_function || '_' || metric_field);
  END IF;
  
  -- Build filter conditions based on the provided filters
  IF p_report_configuration -> 'filters' IS NOT NULL AND jsonb_array_length(p_report_configuration -> 'filters') > 0 THEN
    filter_conditions := '';
    
    FOR i IN 0..jsonb_array_length(p_report_configuration -> 'filters') - 1 LOOP
      filter := p_report_configuration -> 'filters' -> i;
      filter_field := filter ->> 'field';
      filter_operator := filter ->> 'operator';
      filter_value := filter ->> 'value';
      
      -- Skip if any are null
      IF filter_field IS NULL OR filter_operator IS NULL OR filter_value IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Quote the field name for safe SQL construction
      filter_field_quoted := quote_ident(filter_field);
      
      -- Add AND if not the first condition
      IF filter_conditions <> '' THEN
        filter_conditions := filter_conditions || ' AND ';
      END IF;
      
      -- Handle different operators safely
      CASE filter_operator
        WHEN '=' THEN 
          filter_conditions := filter_conditions || format('%I.%I = %L', main_entity, filter_field, filter_value);
        WHEN '!=' THEN 
          filter_conditions := filter_conditions || format('%I.%I != %L', main_entity, filter_field, filter_value);
        WHEN '>' THEN 
          filter_conditions := filter_conditions || format('%I.%I > %L', main_entity, filter_field, filter_value);
        WHEN '>=' THEN 
          filter_conditions := filter_conditions || format('%I.%I >= %L', main_entity, filter_field, filter_value);
        WHEN '<' THEN 
          filter_conditions := filter_conditions || format('%I.%I < %L', main_entity, filter_field, filter_value);
        WHEN '<=' THEN 
          filter_conditions := filter_conditions || format('%I.%I <= %L', main_entity, filter_field, filter_value);
        WHEN 'LIKE' THEN 
          filter_conditions := filter_conditions || format('%I.%I LIKE %L', main_entity, filter_field, '%' || filter_value || '%');
        WHEN 'IN' THEN
          -- Handle array of values
          IF jsonb_typeof(filter -> 'value') = 'array' THEN
            filter_conditions := filter_conditions || format('%I.%I IN (%s)', 
              main_entity, 
              filter_field, 
              (SELECT string_agg(quote_literal(v), ', ') FROM jsonb_array_elements_text(filter -> 'value') as v)
            );
          ELSE
            -- Fallback for single value
            filter_conditions := filter_conditions || format('%I.%I = %L', main_entity, filter_field, filter_value);
          END IF;
        ELSE
          -- Default to equality
          filter_conditions := filter_conditions || format('%I.%I = %L', main_entity, filter_field, filter_value);
      END CASE;
    END LOOP;
    
    -- If no valid filters were processed, default to true condition
    IF filter_conditions = '' THEN
      filter_conditions := '1=1';
    END IF;
  END IF;
  
  -- Add program ID filter if specified
  IF p_report_configuration ->> 'program_id' IS NOT NULL THEN
    -- Handle different tables' program_id relationship
    IF main_entity = 'pilot_programs' THEN
      program_id_filter := format(' AND %I.program_id = %L', main_entity, p_report_configuration ->> 'program_id');
    ELSIF main_entity IN ('sites', 'submissions') THEN
      program_id_filter := format(' AND %I.program_id = %L', main_entity, p_report_configuration ->> 'program_id');
    ELSIF main_entity IN ('petri_observations', 'gasifier_observations') THEN
      -- These tables don't have direct program_id, need to join through submissions
      program_id_filter := format(' AND submissions.program_id = %L', p_report_configuration ->> 'program_id');
      -- Ensure we have a join to submissions
      IF position('JOIN submissions' IN join_clauses) = 0 THEN
        join_clauses := join_clauses || format(' LEFT JOIN submissions ON %I.submission_id = submissions.submission_id', main_entity);
      END IF;
    END IF;
  END IF;
  
  -- Add company ID filter if specified
  IF p_report_configuration ->> 'company_id' IS NOT NULL THEN
    -- Handle different tables' company_id relationship
    IF main_entity = 'pilot_programs' THEN
      company_id_filter := format(' AND %I.company_id = %L', main_entity, p_report_configuration ->> 'company_id');
    ELSE
      -- For other tables, need to join to pilot_programs
      company_id_filter := format(' AND pilot_programs.company_id = %L', p_report_configuration ->> 'company_id');
      -- Ensure we have a join path to pilot_programs
      IF position('JOIN pilot_programs' IN join_clauses) = 0 THEN
        IF main_entity = 'sites' THEN
          join_clauses := join_clauses || ' LEFT JOIN pilot_programs ON sites.program_id = pilot_programs.program_id';
        ELSIF main_entity = 'submissions' THEN
          join_clauses := join_clauses || ' LEFT JOIN pilot_programs ON submissions.program_id = pilot_programs.program_id';
        ELSIF main_entity IN ('petri_observations', 'gasifier_observations') THEN
          -- Need two joins
          IF position('JOIN submissions' IN join_clauses) = 0 THEN
            join_clauses := join_clauses || format(' LEFT JOIN submissions ON %I.submission_id = submissions.submission_id', main_entity);
          END IF;
          join_clauses := join_clauses || ' LEFT JOIN pilot_programs ON submissions.program_id = pilot_programs.program_id';
        END IF;
      END IF;
    END IF;
  END IF;
  
  -- Build the group by clause
  IF dimension_field IS NOT NULL THEN
    group_by_clause := format('GROUP BY %s', dimension_field);
  ELSE
    group_by_clause := '';
  END IF;
  
  -- Build the order clause
  IF dimension_field IS NOT NULL THEN
    order_clause := format('ORDER BY %s ASC', dimension_field);
  ELSE
    order_clause := '';
  END IF;
  
  -- Construct the final SQL query with proper security measures
  full_query := format('
    SELECT %s AS dimension, %s(%s) AS %I
    FROM %I
    %s
    WHERE %s %s %s
    %s
    %s
    LIMIT %s
    OFFSET %s',
    dimension_field,
    metric_function,
    metric_field_quoted,
    metric_alias,
    main_entity_quoted,
    join_clauses,
    filter_conditions,
    program_id_filter,
    company_id_filter,
    CASE WHEN group_by_clause <> '' THEN group_by_clause ELSE '' END,
    CASE WHEN order_clause <> '' THEN order_clause ELSE '' END,
    p_limit,
    p_offset
  );
  
  -- Execute the query and capture the results
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || full_query || ') t' INTO result;
  
  -- Return empty array instead of null if no results
  IF result IS NULL THEN
    result := '[]'::jsonb;
  END IF;
  
  -- Return the result with metadata
  RETURN jsonb_build_object(
    'success', true,
    'query', full_query,  -- Include the query for debugging (remove in production)
    'count', jsonb_array_length(result),
    'data', result,
    'metadata', jsonb_build_object(
      'entity', main_entity,
      'dimension', dimension_field,
      'metric', jsonb_build_object(
        'function', metric_function,
        'field', metric_field
      )
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error executing report query: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to execute functions
GRANT EXECUTE ON FUNCTION get_available_report_metadata() TO authenticated;
GRANT EXECUTE ON FUNCTION execute_custom_report_query(JSONB, INTEGER, INTEGER) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE custom_reports IS 'Stores user-defined custom report configurations';
COMMENT ON FUNCTION get_available_report_metadata IS 'Returns metadata about available entities and fields for custom reporting';
COMMENT ON FUNCTION execute_custom_report_query IS 'Executes a dynamic query based on the provided report configuration';