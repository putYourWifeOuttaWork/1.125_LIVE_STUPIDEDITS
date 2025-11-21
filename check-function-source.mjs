import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.rpc('get_function_source', {
  p_function_name: 'generate_session_wake_snapshot'
});

if (error) {
  console.error('Error:', error);
} else {
  // Show the part with EXTRACT
  const source = data || '';
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('EXTRACT') || line.includes('program_day')) {
      console.log(`${i}: ${line}`);
    }
  });
}
