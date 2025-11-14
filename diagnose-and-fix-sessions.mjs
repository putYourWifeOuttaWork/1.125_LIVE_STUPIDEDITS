import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔍 Session Creation Diagnosis & Fix\n');
console.log('='.repeat(70));

// Step 1: Check active sites with devices
console.log('\n1️⃣ Checking Active Sites with Active Devices...\n');

const { data: activeSites, error: sitesError } = await supabase
  .from('sites')
  .select(`
    site_id,
    name,
    program_id,
    pilot_programs!inner(name, status)
  `);

if (sitesError) {
  console.error('❌ Error fetching sites:', sitesError);
  process.exit(1);
}

console.log(`Found ${activeSites?.length || 0} sites\n`);

const sitesWithDevices = [];
for (const site of activeSites || []) {
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, is_active')
    .eq('site_id', site.site_id)
    .eq('is_active', true);

  if (devices && devices.length > 0) {
    sitesWithDevices.push({
      ...site,
      device_count: devices.length,
      devices: devices
    });
    console.log(`✅ ${site.name}`);
    console.log(`   Program: ${site.pilot_programs?.name} (${site.pilot_programs?.status})`);
    console.log(`   Active Devices: ${devices.length}`);
    console.log('');
  }
}

console.log(`\n📊 ${sitesWithDevices.length} sites have active devices\n`);

// Step 2: Check current state of auto_create_daily_sessions function
console.log('='.repeat(70));
console.log('\n2️⃣ Testing auto_create_daily_sessions() Function...\n');

const { data: result, error: funcError } = await supabase.rpc('auto_create_daily_sessions');

if (funcError) {
  console.error('❌ Function Error:', funcError);
  console.log('\n⚠️  The function has an error - likely the enum bug!');
  console.log('   Error message:', funcError.message);
  console.log('\n   We need to apply the fix...\n');
} else {
  console.log('✅ Function executed successfully!\n');
  console.log('Result:', JSON.stringify(result, null, 2));
}

// Step 3: Check session_creation_log
console.log('\n='.repeat(70));
console.log('\n3️⃣ Checking Session Creation Logs...\n');

const { data: logs, error: logsError } = await supabase
  .from('session_creation_log')
  .select('*')
  .order('execution_time', { ascending: false })
  .limit(5);

if (logsError) {
  console.log('⚠️  No logs table or no access:', logsError.message);
} else if (!logs || logs.length === 0) {
  console.log('⚠️  No session creation logs found');
} else {
  console.log(`Found ${logs.length} recent execution logs:\n`);
  logs.forEach(log => {
    console.log(`📝 ${log.execution_time}`);
    console.log(`   Sites: ${log.total_sites}, Success: ${log.success_count}, Errors: ${log.error_count}`);
    if (log.error_count > 0 && log.details) {
      console.log(`   Errors:`, JSON.stringify(log.details, null, 2));
    }
    console.log('');
  });
}

// Step 4: Check for today's sessions
console.log('='.repeat(70));
console.log('\n4️⃣ Checking Today\'s Sessions...\n');

const today = new Date().toISOString().split('T')[0];
const { data: todaySessions } = await supabase
  .from('site_device_sessions')
  .select(`
    session_id,
    session_date,
    status,
    expected_wake_count,
    completed_wake_count,
    sites(name)
  `)
  .eq('session_date', today);

console.log(`Today: ${today}`);
console.log(`Sessions created today: ${todaySessions?.length || 0}\n`);

if (todaySessions && todaySessions.length > 0) {
  todaySessions.forEach(s => {
    console.log(`✅ ${s.sites?.name}`);
    console.log(`   Status: ${s.status}, Expected: ${s.expected_wake_count}, Completed: ${s.completed_wake_count}`);
  });
} else {
  console.log('❌ No sessions created today');
}

console.log('\n='.repeat(70));
console.log('\n📋 SUMMARY:\n');
console.log(`✓ ${sitesWithDevices.length} sites need daily sessions`);
console.log(`✓ ${todaySessions?.length || 0} sessions exist for today`);
console.log(`✓ Gap: ${sitesWithDevices.length - (todaySessions?.length || 0)} missing sessions\n`);

if (funcError) {
  console.log('⚠️  ACTION REQUIRED: Apply the bug fix migration\n');
} else if ((todaySessions?.length || 0) === 0) {
  console.log('⚠️  Function works but no scheduler is running\n');
} else {
  console.log('✅ System is working correctly\n');
}

process.exit(0);
