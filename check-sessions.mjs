import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔍 Checking Session Creation Status');
console.log('='.repeat(60));

// Check active sites with devices
const { data: sites } = await supabase
  .from('sites')
  .select('site_id, name, type, pilot_programs(name, status)');

console.log('\nActive Sites:', sites?.length || 0);

for (const site of sites || []) {
  const { data: devices } = await supabase
    .from('devices')
    .select('device_code, device_name, is_active')
    .eq('site_id', site.site_id)
    .eq('is_active', true);

  if (devices && devices.length > 0) {
    console.log('\n📍', site.name);
    console.log('   Program:', site.pilot_programs?.name);
    console.log('   Active Devices:', devices.length);
    devices.forEach(d => console.log('      -', d.device_code || d.device_name || 'Unnamed'));
  }
}

// Check last 7 days of sessions
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const { data: sessions } = await supabase
  .from('site_device_sessions')
  .select('session_id, session_date, sites(name), status')
  .gte('session_date', sevenDaysAgo.toISOString().split('T')[0])
  .order('session_date', { ascending: false });

console.log('\n\nSessions (Last 7 days):');
console.log('-'.repeat(60));

const groupedByDate = {};
sessions?.forEach(s => {
  if (!groupedByDate[s.session_date]) {
    groupedByDate[s.session_date] = [];
  }
  groupedByDate[s.session_date].push(s);
});

Object.keys(groupedByDate).sort().reverse().forEach(date => {
  console.log('\n', date, ':', groupedByDate[date].length, 'session(s)');
  groupedByDate[date].forEach(s => {
    console.log('    -', s.sites?.name || 'Unknown', '| Status:', s.status || 'pending');
  });
});

console.log('\n' + '='.repeat(60));
console.log('📊 ANALYSIS:');

const today = new Date().toISOString().split('T')[0];
const todaySessions = sessions?.filter(s => s.session_date === today) || [];

console.log('\nToday is:', today);
console.log('Sessions today:', todaySessions.length);

if (todaySessions.length === 0) {
  console.log('\n❌ NO SESSIONS CREATED TODAY');
  console.log('\nLikely causes:');
  console.log('1. ⏰ Automatic scheduler (pg_cron) not configured');
  console.log('2. 🔧 auto_create_daily_sessions edge function not deployed');
  console.log('3. 🚫 Scheduler job not active');
  console.log('\nNext steps:');
  console.log('- Check if migration 20251111120003_auto_session_scheduler.sql was applied');
  console.log('- Verify pg_cron extension is enabled');
  console.log('- Check edge function deployment');
} else {
  console.log('\n✅ Sessions exist for today');
}

process.exit(0);
