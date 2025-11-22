import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSite2() {
  // Find "IoT Test Site 2"
  const { data: site2 } = await supabase
    .from('sites')
    .select('site_id, name')
    .ilike('name', '%IoT Test Site 2%')
    .maybeSingle();
  
  console.log('IoT Test Site 2:', site2);
  
  if (!site2) {
    console.log('\nSearching for sites with "2" in name:');
    const { data: sites } = await supabase
      .from('sites')
      .select('site_id, name')
      .or('name.ilike.%2%,name.ilike.%two%')
      .limit(5);
    console.table(sites);
  }
  
  // Check if any device has this site_id
  if (site2) {
    const { data: devicesOnSite2 } = await supabase
      .from('devices')
      .select('device_id, device_code, site_id, program_id')
      .eq('site_id', site2.site_id);
    
    console.log('\nDevices assigned to IoT Test Site 2 in devices table:');
    console.table(devicesOnSite2?.map(d => ({ code: d.device_code })));
  }
  
  // Check junction tables
  console.log('\nChecking device_site_assignments for any Site 2...');
  const { data: siteAssignments } = await supabase
    .from('device_site_assignments')
    .select(`
      device_id,
      devices(device_code),
      site_id,
      sites(name),
      is_active,
      assigned_at
    `)
    .order('assigned_at', { ascending: false })
    .limit(10);
  
  console.table(siteAssignments?.map(a => ({
    device_code: a.devices?.device_code,
    site_name: a.sites?.name,
    is_active: a.is_active,
    assigned_at: a.assigned_at?.substring(0, 10)
  })));
}

checkSite2().catch(console.error);
