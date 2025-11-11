import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jycxolmevsvrxmeinxff.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI'
);

async function investigate() {
  console.log('='.repeat(60));
  console.log('DATABASE INVESTIGATION: Device Sessions');
  console.log('='.repeat(60));

  // 1. Check site_device_sessions table
  console.log('\n1. Checking site_device_sessions...');
  const { data: sessions, error: sessionsError } = await supabase
    .from('site_device_sessions')
    .select('*')
    .limit(5);

  if (sessionsError) {
    console.error('Error:', sessionsError.message);
  } else {
    console.log(`Found ${sessions?.length || 0} sessions`);
    if (sessions && sessions.length > 0) {
      console.log('Sample session:', JSON.stringify(sessions[0], null, 2));
    }
  }

  // 2. Check active sites
  console.log('\n2. Checking active sites...');
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select('site_id, name, program_id, timezone')
    .limit(5);

  if (sitesError) {
    console.error('Error:', sitesError.message);
  } else {
    console.log(`Found ${sites?.length || 0} sites`);
    if (sites) {
      sites.forEach(site => {
        console.log(`  - ${site.name} (${site.site_id})`);
      });
    }
  }

  // 3. Check active programs
  console.log('\n3. Checking active programs...');
  const { data: programs, error: programsError } = await supabase
    .from('pilot_programs')
    .select('program_id, name, status')
    .eq('status', 'active');

  if (programsError) {
    console.error('Error:', programsError.message);
  } else {
    console.log(`Found ${programs?.length || 0} active programs`);
    if (programs) {
      programs.forEach(prog => {
        console.log(`  - ${prog.name} (${prog.program_id})`);
      });
    }
  }

  // 4. Check devices
  console.log('\n4. Checking devices...');
  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, site_id, provisioning_status')
    .limit(5);

  if (devicesError) {
    console.error('Error:', devicesError.message);
  } else {
    console.log(`Found ${devices?.length || 0} devices`);
    if (devices && devices.length > 0) {
      devices.forEach(dev => {
        console.log(`  - ${dev.device_code} (${dev.device_name || 'unnamed'}) - Status: ${dev.provisioning_status}`);
      });
    }
  }

  // 5. Try to manually create a session for first active site
  if (sites && sites.length > 0) {
    const testSite = sites[0];
    console.log(`\n5. Testing session creation for site: ${testSite.name}...`);

    const { data: result, error: fnError } = await supabase
      .rpc('fn_midnight_session_opener', { p_site_id: testSite.site_id });

    if (fnError) {
      console.error('Error calling fn_midnight_session_opener:', fnError.message);
    } else {
      console.log('Session creation result:', JSON.stringify(result, null, 2));
    }
  }

  // 6. Check if auto_create_daily_sessions function exists
  console.log('\n6. Checking auto_create_daily_sessions function...');
  const { data: fnData, error: fnCheckError } = await supabase
    .rpc('auto_create_daily_sessions');

  if (fnCheckError) {
    console.error('Error calling auto_create_daily_sessions:', fnCheckError.message);
  } else {
    console.log('Auto create sessions result:', JSON.stringify(fnData, null, 2));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Investigation complete!');
  console.log('='.repeat(60));
}

investigate().catch(console.error);
