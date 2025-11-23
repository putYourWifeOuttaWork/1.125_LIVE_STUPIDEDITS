import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Find sessions that have wake payloads
const wakes = await supabase
  .from('device_wake_payloads')
  .select('site_device_session_id')
  .not('site_device_session_id', 'is', null)
  .limit(100);

const sessionIds = [...new Set(wakes.data?.map(w => w.site_device_session_id) || [])];

console.log('Sessions with wake data:', sessionIds.length);

for (const sessionId of sessionIds.slice(0, 3)) {
  const session = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date')
    .eq('session_id', sessionId)
    .single();
  
  const wakeCount = wakes.data?.filter(w => w.site_device_session_id === sessionId).length || 0;
  
  console.log('  ' + session.data?.session_date + ': ' + wakeCount + ' wakes');
}
