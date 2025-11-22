import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findMismatches() {
  console.log('=== SEARCHING FOR ASSIGNMENT MISMATCHES ===\n');
  
  // Get all devices with their direct assignments
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, site_id, program_id')
    .not('site_id', 'is', null)
    .not('program_id', 'is', null)
    .limit(20);
  
  const mismatches = [];
  
  for (const device of devices || []) {
    // Get active junction assignment
    const { data: siteAssignment } = await supabase
      .from('device_site_assignments')
      .select('site_id')
      .eq('device_id', device.device_id)
      .eq('is_active', true)
      .is('unassigned_at', null)
      .maybeSingle();
    
    const { data: programAssignment } = await supabase
      .from('device_program_assignments')
      .select('program_id')
      .eq('device_id', device.device_id)
      .eq('is_active', true)
      .is('unassigned_at', null)
      .maybeSingle();
    
    // Check for mismatches
    if (device.site_id !== siteAssignment?.site_id || device.program_id !== programAssignment?.program_id) {
      mismatches.push({
        device_code: device.device_code,
        devices_table: {
          site_id: device.site_id?.substring(0, 8),
          program_id: device.program_id?.substring(0, 8)
        },
        junction_tables: {
          site_id: siteAssignment?.site_id?.substring(0, 8),
          program_id: programAssignment?.program_id?.substring(0, 8)
        }
      });
    }
  }
  
  if (mismatches.length === 0) {
    console.log('✅ NO MISMATCHES FOUND! All devices are consistent.');
  } else {
    console.log(`⚠️  FOUND ${mismatches.length} MISMATCHES:\n`);
    console.table(mismatches);
  }
}

findMismatches().catch(console.error);
