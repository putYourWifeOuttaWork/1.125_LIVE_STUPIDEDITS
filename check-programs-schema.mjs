import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('pilot_programs')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error);
} else if (data && data.length > 0) {
  console.log('pilot_programs table columns with "start" or "date":');
  Object.keys(data[0]).forEach(col => {
    if (col.includes('start') || col.includes('date') || col.includes('created')) {
      console.log(' ', col, ':', data[0][col]);
    }
  });
}
