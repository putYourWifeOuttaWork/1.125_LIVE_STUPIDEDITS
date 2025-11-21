import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Testing date calculation methods...\n');

// Test different approaches
const { data, error } = await supabase.rpc('sql', {
  query: `
    SELECT 
      '2025-12-01'::date - '2025-11-01'::date as method1_direct_int,
      DATE_PART('day', '2025-12-01'::timestamp - '2025-11-01'::timestamp) as method2_datepart,
      EXTRACT(DAY FROM '2025-12-01'::timestamp - '2025-11-01'::timestamp) as method3_extract,
      ('2025-12-01'::timestamp - '2025-11-01'::timestamp) as interval_result,
      pg_typeof('2025-12-01'::timestamp - '2025-11-01'::timestamp) as result_type
  `
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Results:', data);
}
