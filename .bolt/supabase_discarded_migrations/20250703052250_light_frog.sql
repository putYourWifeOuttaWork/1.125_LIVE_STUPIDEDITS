/*
  # Add Submission Analysis and Report Generation Functions
  
  1. New Features
    - Add RPC function for exporting submission data as CSV for reports
    
  2. Purpose
    - Enable detailed export of submission data including all observations
    - Support comprehensive data analysis through CSV exports
*/

-- Function to export a complete submission report as CSV
CREATE OR REPLACE FUNCTION export_submission_report_csv(p_submission_id UUID)
RETURNS TEXT AS $$
DECLARE
    csv_output TEXT;
    submission_record RECORD;
    program_record RECORD;
    site_record RECORD;
    creator_record RECORD;
    petri_header TEXT;
    gasifier_header TEXT;
    petri_rows TEXT := '';
    gasifier_rows TEXT := '';
    petri_count INTEGER := 0;
    gasifier_count INTEGER := 0;
BEGIN
    -- Get submission data
    SELECT s.*, 
           s.temperature AS outdoor_temperature, 
           s.humidity AS outdoor_humidity,
           ss.session_status,
           ss.percentage_complete
    INTO submission_record
    FROM submissions s
    LEFT JOIN submission_sessions ss ON s.submission_id = ss.submission_id
    WHERE s.submission_id = p_submission_id;
    
    IF NOT FOUND THEN
        RETURN 'Error: Submission not found';
    END IF;
    
    -- Get program data
    SELECT p.*, 
           jsonb_array_elements(p.phases) ->> 'phase_type' AS current_phase_type,
           jsonb_array_elements(p.phases) ->> 'phase_number' AS current_phase_number
    INTO program_record
    FROM pilot_programs p
    WHERE p.program_id = submission_record.program_id
    LIMIT 1;
    
    -- Get site data
    SELECT *
    INTO site_record
    FROM sites
    WHERE site_id = submission_record.site_id;
    
    -- Get creator data
    IF submission_record.created_by IS NOT NULL THEN
        SELECT id, email, full_name
        INTO creator_record
        FROM users
        WHERE id = submission_record.created_by;
    END IF;
    
    -- Start building CSV
    -- First, add submission header
    csv_output := 'Submission Report' || E'\n';
    csv_output := csv_output || 'Generated,' || NOW() || E'\n\n';
    
    -- Submission section
    csv_output := csv_output || 'SUBMISSION DETAILS' || E'\n';
    csv_output := csv_output || 'Submission ID,' || submission_record.global_submission_id || E'\n';
    csv_output := csv_output || 'Date,' || submission_record.created_at || E'\n';
    csv_output := csv_output || 'Program,' || program_record.name || E'\n';
    csv_output := csv_output || 'Phase,' || program_record.current_phase_number || ' (' || program_record.current_phase_type || ')' || E'\n';
    csv_output := csv_output || 'Site,' || site_record.name || ' (' || site_record.type || ')' || E'\n';
    csv_output := csv_output || 'Status,' || COALESCE(submission_record.session_status, 'Unknown') || E'\n';
    csv_output := csv_output || 'Completion,' || COALESCE(submission_record.percentage_complete::TEXT, '0') || '%' || E'\n';
    
    IF creator_record.id IS NOT NULL THEN
        csv_output := csv_output || 'Created By,' || COALESCE(creator_record.full_name, creator_record.email) || E'\n';
    END IF;
    
    -- Environmental section
    csv_output := csv_output || E'\nENVIRONMENTAL CONDITIONS\n';
    csv_output := csv_output || 'Outdoor Temperature,' || submission_record.outdoor_temperature || '°F' || E'\n';
    csv_output := csv_output || 'Outdoor Humidity,' || submission_record.outdoor_humidity || '%' || E'\n';
    
    IF submission_record.indoor_temperature IS NOT NULL THEN
        csv_output := csv_output || 'Indoor Temperature,' || submission_record.indoor_temperature || '°F' || E'\n';
    END IF;
    
    IF submission_record.indoor_humidity IS NOT NULL THEN
        csv_output := csv_output || 'Indoor Humidity,' || submission_record.indoor_humidity || '%' || E'\n';
    END IF;
    
    csv_output := csv_output || 'Weather,' || submission_record.weather || E'\n';
    csv_output := csv_output || 'Airflow,' || submission_record.airflow || E'\n';
    csv_output := csv_output || 'Odor Distance,' || submission_record.odor_distance || E'\n';
    
    IF submission_record.notes IS NOT NULL AND submission_record.notes != '' THEN
        csv_output := csv_output || 'Notes,"' || REPLACE(submission_record.notes, '"', '""') || '"' || E'\n';
    END IF;
    
    -- Petri Observations section
    petri_header := E'\nPETRI OBSERVATIONS\n' ||
                    'Petri Code,Visual Assessment,Growth Index,Fungicide Used,Water Schedule,Placement,Placement Dynamics,Temperature,Humidity,Notes\n';
    
    -- Get all petri observations for this submission
    FOR petri_record IN
        SELECT *
        FROM petri_observations
        WHERE submission_id = p_submission_id
        ORDER BY petri_code
    LOOP
        petri_count := petri_count + 1;
        
        IF petri_count = 1 THEN
            csv_output := csv_output || petri_header;
        END IF;
        
        petri_rows := petri_rows ||
            petri_record.petri_code || ',' ||
            COALESCE(petri_record.petri_growth_stage::TEXT, 'None') || ',' ||
            COALESCE(petri_record.growth_index::TEXT, '0') || ',' ||
            petri_record.fungicide_used || ',' ||
            petri_record.surrounding_water_schedule || ',' ||
            COALESCE(petri_record.placement::TEXT, 'Not specified') || ',' ||
            COALESCE(petri_record.placement_dynamics::TEXT, 'Not specified') || ',' ||
            COALESCE(petri_record.outdoor_temperature::TEXT, submission_record.outdoor_temperature::TEXT) || ',' ||
            COALESCE(petri_record.outdoor_humidity::TEXT, submission_record.outdoor_humidity::TEXT) || ',' ||
            '"' || COALESCE(REPLACE(petri_record.notes, '"', '""'), '') || '"' || E'\n';
    END LOOP;
    
    IF petri_count > 0 THEN
        csv_output := csv_output || petri_rows;
    END IF;
    
    -- Gasifier Observations section
    gasifier_header := E'\nGASIFIER OBSERVATIONS\n' ||
                       'Gasifier Code,Chemical Type,Measure,Anomaly,Placement Height,Directional Placement,Placement Strategy,Temperature,Humidity,Notes\n';
    
    -- Get all gasifier observations for this submission
    FOR gasifier_record IN
        SELECT *
        FROM gasifier_observations
        WHERE submission_id = p_submission_id
        ORDER BY gasifier_code
    LOOP
        gasifier_count := gasifier_count + 1;
        
        IF gasifier_count = 1 THEN
            csv_output := csv_output || gasifier_header;
        END IF;
        
        gasifier_rows := gasifier_rows ||
            gasifier_record.gasifier_code || ',' ||
            gasifier_record.chemical_type || ',' ||
            COALESCE(gasifier_record.measure::TEXT, '0') || ',' ||
            CASE WHEN gasifier_record.anomaly THEN 'Yes' ELSE 'No' END || ',' ||
            COALESCE(gasifier_record.placement_height::TEXT, 'Not specified') || ',' ||
            COALESCE(gasifier_record.directional_placement::TEXT, 'Not specified') || ',' ||
            COALESCE(gasifier_record.placement_strategy::TEXT, 'Not specified') || ',' ||
            COALESCE(gasifier_record.outdoor_temperature::TEXT, submission_record.outdoor_temperature::TEXT) || ',' ||
            COALESCE(gasifier_record.outdoor_humidity::TEXT, submission_record.outdoor_humidity::TEXT) || ',' ||
            '"' || COALESCE(REPLACE(gasifier_record.notes, '"', '""'), '') || '"' || E'\n';
    END LOOP;
    
    IF gasifier_count > 0 THEN
        csv_output := csv_output || gasifier_rows;
    END IF;
    
    -- Summary footer
    csv_output := csv_output || E'\nSUMMARY\n';
    csv_output := csv_output || 'Total Petri Observations,' || petri_count || E'\n';
    csv_output := csv_output || 'Total Gasifier Observations,' || gasifier_count || E'\n';
    csv_output := csv_output || 'Total Observations,' || (petri_count + gasifier_count) || E'\n';
    
    RETURN csv_output;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION export_submission_report_csv TO authenticated;

-- Add a comment to document the function
COMMENT ON FUNCTION export_submission_report_csv IS 'Generates a CSV report for a submission including all observations and environmental data';