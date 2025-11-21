import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCronJobs() {
  console.log('🔍 Checking for snapshot cron jobs...\n');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT jobid, jobname, schedule, command, active, nodename
      FROM cron.job
      WHERE jobname LIKE '%snapshot%'
      ORDER BY jobid;
    `
  });
  
  if (error) {
    console.error('❌ Error querying cron jobs:', error);
    console.log('\n⚠️  Trying direct query instead...\n');
    
    const { data: cronData, error: cronError } = await supabase
      .from('cron.job')
      .select('*')
      .like('jobname', '%snapshot%');
      
    if (cronError) {
      console.error('❌ Also failed:', cronError.message);
      return;
    }
    
    console.log('Cron jobs:', cronData);
  } else {
    console.log('Cron jobs found:', data);
  }
}

checkCronJobs();
