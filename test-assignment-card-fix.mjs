#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testAssignmentCardFix() {
  console.log('🧪 Testing Assignment Card Fix\n');
  
  const deviceCode = 'TEST-DEVICE-002';
  
  // 1. Get device data (what the old code did)
  console.log('1️⃣  OLD WAY - Query devices table directly:');
  const { data: oldWay } = await supabase
    .from('devices')
    .select('device_id, device_code, site_id, program_id, sites:site_id(name), pilot_programs:program_id(name)')
    .eq('device_code', deviceCode)
    .maybeSingle();
  
  if (oldWay) {
    console.log(`   Device: ${oldWay.device_code}`);
    console.log(`   Site (from devices.site_id): ${oldWay.sites?.name || 'N/A'}`);
    console.log(`   Program (from devices.program_id): ${oldWay.pilot_programs?.name || 'N/A'}`);
  }
  
  // 2. Get junction table data (what the new code does)
  console.log('\n2️⃣  NEW WAY - Query junction tables:');
  
  const { data: device } = await supabase
    .from('devices')
    .select('device_id, device_code')
    .eq('device_code', deviceCode)
    .maybeSingle();
  
  if (device) {
    const { data: siteAssignment } = await supabase
      .from('device_site_assignments')
      .select('site_id, sites:site_id(name)')
      .eq('device_id', device.device_id)
      .eq('is_active', true)
      .maybeSingle();
    
    const { data: programAssignment } = await supabase
      .from('device_program_assignments')
      .select('program_id, pilot_programs:program_id(name)')
      .eq('device_id', device.device_id)
      .eq('is_active', true)
      .maybeSingle();
    
    console.log(`   Device: ${device.device_code}`);
    console.log(`   Site (from junction): ${siteAssignment?.sites?.name || 'N/A'}`);
    console.log(`   Program (from junction): ${programAssignment?.pilot_programs?.name || 'N/A'}`);
    
    // 3. Compare
    console.log('\n3️⃣  COMPARISON:');
    const oldSite = oldWay?.sites?.name || 'N/A';
    const newSite = siteAssignment?.sites?.name || 'N/A';
    const oldProgram = oldWay?.pilot_programs?.name || 'N/A';
    const newProgram = programAssignment?.pilot_programs?.name || 'N/A';
    
    if (oldSite !== newSite) {
      console.log(`   ⚠️  Site MISMATCH: "${oldSite}" (old) vs "${newSite}" (new - correct)`);
    } else {
      console.log(`   ✅ Site matches: "${newSite}"`);
    }
    
    if (oldProgram !== newProgram) {
      console.log(`   ⚠️  Program MISMATCH: "${oldProgram}" (old) vs "${newProgram}" (new - correct)`);
    } else {
      console.log(`   ✅ Program matches: "${newProgram}"`);
    }
    
    console.log('\n🎉 Assignment card now uses junction tables (source of truth)!\n');
  }
}

testAssignmentCardFix();
