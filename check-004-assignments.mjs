import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function check004() {
  const deviceCode = 'DEVICE-ESP32S3-004';
  
  // 1. Check device record
  const { data: device } = await supabase
    .from('devices')
    .select('device_id, device_code, site_id, program_id, mapped_at')
    .eq('device_code', deviceCode)
    .single();
  
  console.log(`=== DEVICE ${deviceCode} ASSIGNMENT CHECK ===\n`);
  console.log('1. DEVICES TABLE:');
  console.log('   device_code:', device.device_code);
  console.log('   device.site_id:', device.site_id?.substring(0, 8));
  console.log('   device.program_id:', device.program_id?.substring(0, 8));
  
  // Resolve IDs
  const { data: deviceSite } = await supabase
    .from('sites')
    .select('name')
    .eq('site_id', device.site_id)
    .maybeSingle();
  
  const { data: deviceProgram } = await supabase
    .from('pilot_programs')
    .select('name')
    .eq('program_id', device.program_id)
    .maybeSingle();
  
  console.log('   → Resolves to: Site =', deviceSite?.name, ', Program =', deviceProgram?.name);
  
  // 2. Check junction tables
  const { data: siteAssignment } = await supabase
    .from('device_site_assignments')
    .select('site_id, sites(name), is_active, assigned_at')
    .eq('device_id', device.device_id)
    .eq('is_active', true)
    .is('unassigned_at', null)
    .maybeSingle();
  
  const { data: programAssignment } = await supabase
    .from('device_program_assignments')
    .select('program_id, pilot_programs(name), is_active, assigned_at')
    .eq('device_id', device.device_id)
    .eq('is_active', true)
    .is('unassigned_at', null)
    .maybeSingle();
  
  console.log('\n2. ACTIVE JUNCTION TABLE ASSIGNMENTS:');
  console.log('   Site:', siteAssignment?.sites?.name);
  console.log('   Program:', programAssignment?.pilot_programs?.name);
  
  console.log('\n3. CONSISTENCY:');
  console.log('   devices.site_id matches junction:', deviceSite?.name === siteAssignment?.sites?.name ? '✅' : '❌');
  console.log('   devices.program_id matches junction:', deviceProgram?.name === programAssignment?.pilot_programs?.name ? '✅' : '❌');
  
  if (deviceSite?.name !== siteAssignment?.sites?.name) {
    console.log('\n⚠️  MISMATCH FOUND!');
    console.log('   devices table says:', deviceSite?.name);
    console.log('   junction table says:', siteAssignment?.sites?.name);
  }
}

check004().catch(console.error);
