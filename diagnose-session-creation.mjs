import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

async function diagnoseSessionCreation() {
  console.log('🔍 Diagnosing Device Session Creation\n');
  console.log('=' .repeat(60));

  // 1. Check for active sites with devices
  console.log('\n1️⃣ Checking Active Sites with Devices...\n');
  
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select(`
      site_id,
      name,
      type,
      program_id,
      pilot_programs!inner(name, status, start_date, end_date),
      devices:devices!site_id(
        device_id,
        device_code,
        device_name,
        is_active,
        provisioning_status
      )
    `)
    .eq('devices.is_active', true);

  if (sitesError) {
    console.error('❌ Error fetching sites:', sitesError);
    return;
  }

  console.log(`Found ${sites?.length || 0} sites with active devices:\n`);
  
  for (const site of sites || []) {
    const activeDevices = site.devices?.filter(d => d.is_active) || [];
    console.log(`📍 ${site.name} (${site.type})`);
    console.log(`   Program: ${site.pilot_programs?.name}`);
    console.log(`   Status: ${site.pilot_programs?.status}`);
    console.log(`   Active Devices: ${activeDevices.length}`);
    activeDevices.forEach(d => {
      console.log(`      - ${d.device_code || d.device_name || 'Unnamed'} (${d.provisioning_status})`);
    });
    console.log('');
  }

  // 2. Check today's sessions
  console.log('\n2️⃣ Checking Today\'s Device Sessions...\n');
  
  const today = new Date().toISOString().split('T')[0];
  console.log(`Today's date: ${today}\n`);

  const { data: todaySessions, error: sessionsError } = await supabase
    .from('site_device_sessions')
    .select(`
      session_id,
      session_date,
      session_status,
      site_id,
      program_id,
      sites(name),
      pilot_programs(name)
    `)
    .gte('session_date', today)
    .order('session_date', { ascending: false });

  if (sessionsError) {
    console.error('❌ Error fetching sessions:', sessionsError);
  } else {
    console.log(`Found ${todaySessions?.length || 0} sessions for today (${today}):\n`);
    
    if (todaySessions && todaySessions.length > 0) {
      todaySessions.forEach(s => {
        console.log(`✅ Session: ${s.sites?.name}`);
        console.log(`   Date: ${s.session_date}`);
        console.log(`   Status: ${s.session_status}`);
        console.log(`   ID: ${s.session_id}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No sessions found for today!\n');
    }
  }

  // 3. Check the auto-creation function
  console.log('\n3️⃣ Checking Auto-Session Creation Function...\n');

  const { data: funcExists } = await supabase
    .rpc('exec_sql', {
      sql_string: `
        SELECT routine_name, routine_type
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_name LIKE '%session%'
        ORDER BY routine_name;
      `
    })
    .single();

  console.log('Session-related functions in database:');
  console.log(funcExists);

  // 4. Check edge function deployment
  console.log('\n4️⃣ Checking Edge Function Deployment...\n');
  
  const edgeFunctions = [
    'auto_create_daily_sessions'
  ];

  for (const fn of edgeFunctions) {
    console.log(`Checking: ${fn}`);
    const exists = await checkFileExists(`supabase/functions/${fn}/index.ts`);
    console.log(`   File exists: ${exists ? '✅' : '❌'}`);
  }

  // 5. Try to manually trigger session creation
  console.log('\n5️⃣ Testing Manual Session Creation...\n');

  if (sites && sites.length > 0) {
    const testSite = sites[0];
    console.log(`Attempting to create session for: ${testSite.name}\n`);

    const { data: newSession, error: createError } = await supabase
      .from('site_device_sessions')
      .insert({
        site_id: testSite.site_id,
        program_id: testSite.program_id,
        session_date: today,
        session_status: 'pending'
      })
      .select()
      .single();

    if (createError) {
      if (createError.code === '23505') {
        console.log('✅ Session already exists for today (duplicate key)');
      } else {
        console.error('❌ Error creating session:', createError);
      }
    } else {
      console.log('✅ Successfully created test session:', newSession.session_id);
    }
  }

  // 6. Check recent session history
  console.log('\n6️⃣ Checking Recent Session History...\n');

  const { data: recentSessions, error: recentError } = await supabase
    .from('site_device_sessions')
    .select(`
      session_id,
      session_date,
      session_status,
      sites(name),
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentError) {
    console.error('❌ Error fetching recent sessions:', recentError);
  } else {
    console.log('Last 10 sessions created:\n');
    recentSessions?.forEach(s => {
      console.log(`${s.session_date} | ${s.sites?.name} | ${s.session_status}`);
      console.log(`   Created: ${s.created_at}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Diagnosis Complete');
}

async function checkFileExists(path) {
  try {
    const fs = await import('fs');
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

diagnoseSessionCreation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
