import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkTriggers() {
  console.log('Checking triggers on device_site_assignments and device_history...\n');
  
  // Try to query via RLS - this will show us the error
  const { data, error } = await supabase
    .from('device_site_assignments')
    .select('*')
    .limit(1);
    
  if (error) {
    console.log('Query result:', error.message);
  } else {
    console.log('Table accessible, records:', data?.length || 0);
  }
}

checkTriggers();
