/*
  # Fix Report Query Function
  
  1. Changes
    - Properly extract the metric field and function from the JSONB configuration
    - Add special handling for COUNT(*) case
    - Fix SQL syntax for aggregation functions
    
  2. Purpose
    - Fix "column {'field': '*', 'function': 'COUNT'} does not exist" error
    - Ensure correct SQL generation for all aggregation types
    - Improve error handling and reporting
*/

-- Update the execute_custom_report_query function with proper JSONB extraction
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
  metric_expression TEXT;
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
  metric_obj JSONB;
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
  
  -- Extract metric object first
  metric_obj := p_report_configuration -> 'metrics' -> 0;
  
  -- Handle case where no metric is specified
  IF metric_obj IS NULL THEN
    -- Default to COUNT(*) if no metric specified
    metric_function := 'COUNT';
    metric_field := '*';
    metric_alias := 'count';
    metric_expression := 'COUNT(*)';
  ELSE
    -- Extract function and field from the metric object
    metric_function := metric_obj ->> 'function';
    IF metric_function IS NULL THEN
      metric_function := 'COUNT';
    END IF;
    
    metric_field := metric_obj ->> 'field';
    IF metric_field IS NULL THEN
      metric_field := '*';
    END IF;
    
    -- Set up the metric expression properly
    IF metric_field = '*' THEN
      -- Special case for COUNT(*)
      IF metric_function = 'COUNT' THEN
        metric_expression := 'COUNT(*)';
      ELSE
        -- Other aggregations cannot use * as a field
        RAISE EXCEPTION 'Cannot use * with % aggregation', metric_function;
      END IF;
    ELSE
      -- For normal fields, quote the identifier
      metric_field_quoted := quote_ident(metric_field);
      metric_expression := format('%s(%I)', metric_function, metric_field);
    END IF;
    
    -- Create a clean alias
    metric_alias := lower(metric_function || '_' || CASE WHEN metric_field = '*' THEN 'all' ELSE metric_field END);
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
    SELECT %s AS dimension, %s AS %I
    FROM %I
    %s
    WHERE %s %s %s
    %s
    %s
    LIMIT %s
    OFFSET %s',
    dimension_field,
    metric_expression,
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

-- Grant permissions to execute the updated function
GRANT EXECUTE ON FUNCTION execute_custom_report_query(JSONB, INTEGER, INTEGER) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION execute_custom_report_query IS 'Executes a dynamic query based on the provided report configuration with improved metric handling';