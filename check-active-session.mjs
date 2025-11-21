import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const siteId = '134218af-9afc-4ee9-9244-050f51ccbb39';
  
  console.log('Checking for active session for site:', siteId);
  
  const { data: sessions, error } = await supabase
    .from('site_device_sessions')
    .select('*')
    .eq('site_id', siteId)
    .order('session_start_time', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('\nRecent sessions:');
  sessions.forEach(s => {
    console.log(`  Session: ${s.session_id}`);
    console.log(`    Date: ${s.session_date}`);
    console.log(`    Status: ${s.status}`);
    console.log(`    Start: ${s.session_start_time}`);
    console.log('');
  });
  
  const activeSession = sessions.find(s => s.status === 'in_progress' || s.status === 'active');
  if (activeSession) {
    console.log('✅ Active session found:', activeSession.session_id);
  } else {
    console.log('❌ No active session - need to create one!');
  }
}

check();
