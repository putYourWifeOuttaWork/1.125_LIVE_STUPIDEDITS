import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Query pg_proc directly for the function definition
const query = `
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'calculate_mgi_speed'
  AND n.nspname = 'public';
`;

console.log('Fetching calculate_mgi_speed function source...\n');

const { data, error } = await supabase.rpc('exec', { sql: query });

if (error) {
  console.error('Error:', error.message);
  console.log('\nTrying alternative approach...');
  
  // The SQL we need to apply
  const fixSQL = `
CREATE OR REPLACE FUNCTION calculate_mgi_speed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $function$
DECLARE
  v_program_start_date DATE;
  v_capture_date DATE;
  v_days_since_start NUMERIC;
BEGIN
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    -- Get program start date through site -> program relationship
    SELECT pp.start_date INTO v_program_start_date
    FROM sites s
    JOIN pilot_programs pp ON pp.program_id = s.program_id
    WHERE s.site_id = NEW.site_id;
    
    IF v_program_start_date IS NOT NULL THEN
      v_capture_date := DATE(NEW.captured_at AT TIME ZONE 'UTC');
      v_days_since_start := v_capture_date - v_program_start_date;
      
      IF v_days_since_start > 0 THEN
        NEW.mgi_speed := NEW.mgi_score / v_days_since_start;
      ELSE
        NEW.mgi_speed := NEW.mgi_score;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
`;
  
  console.log('📋 Copy this SQL and run it in Supabase SQL Editor:\n');
  console.log(fixSQL);
  
} else {
  console.log('Function definition retrieved');
}
