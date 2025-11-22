import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkAssignments() {
  console.log('=== DEVICE ASSIGNMENT INVESTIGATION ===\n');
  
  // Pick a device with data
  const deviceCode = 'DEVICE-ESP32S3-002';
  
  // 1. Check device record
  const { data: device } = await supabase
    .from('devices')
    .select('device_id, device_code, site_id, program_id, mapped_at')
    .eq('device_code', deviceCode)
    .single();
  
  console.log(`1. DEVICES TABLE for ${deviceCode}:`);
  console.table([device]);
  
  // 2. Check program assignments
  const { data: programAssignments } = await supabase
    .from('device_program_assignments')
    .select(`
      assignment_id,
      program_id,
      pilot_programs(name),
      is_active,
      assigned_at,
      unassigned_at
    `)
    .eq('device_id', device.device_id)
    .order('assigned_at', { ascending: false })
    .limit(5);
  
  console.log('\n2. DEVICE_PROGRAM_ASSIGNMENTS (junction table):');
  console.table(programAssignments?.map(a => ({
    program_id_short: a.program_id?.substring(0, 8),
    program_name: a.pilot_programs?.name,
    is_active: a.is_active,
    assigned_at: a.assigned_at?.substring(0, 10),
    unassigned_at: a.unassigned_at?.substring(0, 10) || null
  })));
  
  // 3. Check site assignments  
  const { data: siteAssignments } = await supabase
    .from('device_site_assignments')
    .select(`
      assignment_id,
      site_id,
      sites(name),
      is_active,
      assigned_at,
      unassigned_at
    `)
    .eq('device_id', device.device_id)
    .order('assigned_at', { ascending: false })
    .limit(5);
  
  console.log('\n3. DEVICE_SITE_ASSIGNMENTS (junction table):');
  console.table(siteAssignments?.map(a => ({
    site_id_short: a.site_id?.substring(0, 8),
    site_name: a.sites?.name,
    is_active: a.is_active,
    assigned_at: a.assigned_at?.substring(0, 10),
    unassigned_at: a.unassigned_at?.substring(0, 10) || null
  })));
  
  // 4. Check what sites/programs the device table IDs resolve to
  const { data: deviceSite } = await supabase
    .from('sites')
    .select('site_id, name, site_code')
    .eq('site_id', device.site_id)
    .maybeSingle();
  
  const { data: deviceProgram } = await supabase
    .from('pilot_programs')
    .select('program_id, name')
    .eq('program_id', device.program_id)
    .maybeSingle();
  
  console.log('\n4. DEVICES TABLE COLUMNS RESOLVE TO:');
  console.log('  devices.site_id →', deviceSite?.name);
  console.log('  devices.program_id →', deviceProgram?.name);
  
  console.log('\n5. LATEST ACTIVE JUNCTION TABLE ASSIGNMENT:');
  const latestProgramAssignment = programAssignments?.find(a => a.is_active && !a.unassigned_at);
  const latestSiteAssignment = siteAssignments?.find(a => a.is_active && !a.unassigned_at);
  console.log('  Latest active site →', latestSiteAssignment?.sites?.name);
  console.log('  Latest active program →', latestProgramAssignment?.pilot_programs?.name);
  
  console.log('\n6. CONSISTENCY CHECK:');
  const sitesMatch = deviceSite?.site_id === latestSiteAssignment?.site_id;
  const programsMatch = deviceProgram?.program_id === latestProgramAssignment?.program_id;
  console.log('  Sites match:', sitesMatch ? '✅' : '❌');
  console.log('  Programs match:', programsMatch ? '✅' : '❌');
}

checkAssignments().catch(console.error);
