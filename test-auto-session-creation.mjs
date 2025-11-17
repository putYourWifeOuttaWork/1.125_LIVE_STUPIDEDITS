#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🧪 Testing Auto Session Creation System\n');
console.log('=' .repeat(60));

async function main() {
  // 1. Check if function exists
  console.log('\n📋 Step 1: Check if auto_create_daily_sessions function exists');
  const { data: functions, error: funcError } = await supabase.rpc('auto_create_daily_sessions');

  if (funcError) {
    console.log('❌ Function call failed:', funcError.message);
    if (funcError.message.includes('does not exist')) {
      console.log('\n⚠️  The auto_create_daily_sessions function has not been deployed yet.');
      console.log('    You need to apply migration: 20251111120003_auto_session_scheduler.sql');
    }
  } else {
    console.log('✅ Function exists and executed');
    console.log('📊 Result:', JSON.stringify(functions, null, 2));
  }

  // 2. Check sites with active programs
  console.log('\n📋 Step 2: Check active sites with devices');
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select(`
      site_id,
      name,
      timezone,
      program_id,
      pilot_programs(
        name,
        status
      )
    `)
    .eq('pilot_programs.status', 'active');

  if (sitesError) {
    console.log('❌ Error fetching sites:', sitesError.message);
  } else {
    console.log(`✅ Found ${sites?.length || 0} active sites`);
    if (sites && sites.length > 0) {
      sites.forEach(site => {
        console.log(`  - ${site.name} (Program: ${site.pilot_programs?.name || 'Unknown'})`);
      });
    } else {
      console.log('  ⚠️  No sites with active programs found');
    }
  }

  // 3. Check devices assigned to those sites
  console.log('\n📋 Step 3: Check devices assigned to sites');
  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select(`
      device_id,
      device_code,
      device_name,
      site_id,
      is_active,
      wake_schedule_cron,
      sites(name)
    `)
    .not('site_id', 'is', null);

  if (devicesError) {
    console.log('❌ Error fetching devices:', devicesError.message);
  } else {
    console.log(`✅ Found ${devices?.length || 0} devices assigned to sites`);
    if (devices && devices.length > 0) {
      devices.forEach(device => {
        console.log(`  - ${device.device_code} (${device.device_name || 'Unnamed'}) → Site: ${device.sites?.name || 'Unknown'}`);
        console.log(`    Active: ${device.is_active}, Schedule: ${device.wake_schedule_cron || 'Not set'}`);
      });
    } else {
      console.log('  ⚠️  No devices assigned to sites');
    }
  }

  // 4. Check existing sessions
  console.log('\n📋 Step 4: Check existing site_device_sessions');
  const { data: sessions, error: sessionsError } = await supabase
    .from('site_device_sessions')
    .select(`
      session_id,
      session_date,
      expected_wake_count,
      actual_wake_count,
      status,
      sites(name)
    `)
    .order('session_date', { ascending: false })
    .limit(10);

  if (sessionsError) {
    console.log('❌ Error fetching sessions:', sessionsError.message);
  } else {
    console.log(`✅ Found ${sessions?.length || 0} sessions (showing last 10)`);
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        console.log(`  - ${session.session_date} | Site: ${session.sites?.name || 'Unknown'} | Status: ${session.status}`);
        console.log(`    Expected Wakes: ${session.expected_wake_count}, Actual: ${session.actual_wake_count || 0}`);
      });
    } else {
      console.log('  ℹ️  No sessions found - this is why no daily sessions are being created!');
    }
  }

  // 5. Test manual session creation for a specific site (if any exist)
  if (sites && sites.length > 0) {
    console.log('\n📋 Step 5: Test manual session creation for first site');
    const testSiteId = sites[0].site_id;

    const { data: testResult, error: testError } = await supabase
      .rpc('fn_midnight_session_opener', { p_site_id: testSiteId });

    if (testError) {
      console.log('❌ Manual session creation failed:', testError.message);
    } else {
      console.log('✅ Manual session creation result:');
      console.log(JSON.stringify(testResult, null, 2));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');

  if (!sites || sites.length === 0) {
    console.log('❌ Problem: No sites with active programs found');
    console.log('   Solution: Create a pilot program and site first');
  } else if (!devices || devices.length === 0) {
    console.log('❌ Problem: No devices assigned to sites');
    console.log('   Solution: Assign devices to sites through the Devices page');
  } else {
    console.log('✅ Sites and devices exist - sessions should be created daily');
    console.log('\n💡 To trigger session creation manually, run:');
    console.log('   SELECT auto_create_daily_sessions();');
    console.log('\n💡 Or call the edge function:');
    console.log(`   curl -X POST ${supabaseUrl}/functions/v1/auto_create_daily_sessions`);
  }
}

main().catch(console.error);
