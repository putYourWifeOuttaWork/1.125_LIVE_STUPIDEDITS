import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Testing session device data...\n');

// Get a recent session
const sessions = await supabase
  .from('site_device_sessions')
  .select('session_id, session_date, site_id')
  .order('session_date', { ascending: false })
  .limit(1);

if (sessions.data && sessions.data.length > 0) {
  const session = sessions.data[0];
  console.log('Testing session:', session.session_id);
  console.log('Date:', session.session_date);
  console.log('Site ID:', session.site_id);
  console.log();

  // Call the RPC function
  const result = await supabase.rpc('get_session_devices_with_wakes', {
    p_session_id: session.session_id
  });

  if (result.error) {
    console.error('Error:', result.error);
  } else {
    console.log('Result:', JSON.stringify(result.data, null, 2));
  }
} else {
  console.log('No sessions found');
}
