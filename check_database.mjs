import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n=== CHECKING YOUR DATABASE ===\n');

// Step 1: Check devices
console.log('STEP 1: Checking devices table...');
const { data: devices, error: devicesError } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, site_id, is_active')
  .limit(5);

if (devicesError) {
  console.log('❌ Error checking devices:', devicesError.message);
} else {
  console.log(`✓ Devices table exists!`);
  console.log(`  Total devices found: ${devices.length}`);
  if (devices.length > 0) {
    console.log('\n  Your devices:');
    devices.forEach(d => {
      console.log(`    - ${d.device_name} (MAC: ${d.device_mac}) [Active: ${d.is_active}]`);
    });
  } else {
    console.log('  ⚠️  No devices registered yet - we need to add one!');
  }
}

// Step 2: Check sites
console.log('\n\nSTEP 2: Checking sites...');
const { data: sites, error: sitesError } = await supabase
  .from('sites')
  .select('*')
  .limit(5);

if (sitesError) {
  console.log('❌ Error checking sites:', sitesError.message);
} else {
  console.log(`✓ Sites table exists!`);
  console.log(`  Total sites found: ${sites.length}`);
  if (sites.length > 0) {
    console.log('\n  Your sites:');
    sites.forEach(s => {
      const siteName = s.site_name || s.name || 'Unnamed Site';
      console.log(`    - ${siteName} (ID: ${s.site_id})`);
    });
  } else {
    console.log('  ⚠️  No sites found - you need to create one in your web app first!');
  }
}

// Step 3: Check programs
console.log('\n\nSTEP 3: Checking pilot programs...');
const { data: programs, error: programsError } = await supabase
  .from('pilot_programs')
  .select('program_id, name')
  .limit(5);

if (programsError) {
  console.log('❌ Error checking programs:', programsError.message);
} else {
  console.log(`✓ Programs table exists!`);
  console.log(`  Total programs found: ${programs.length}`);
  if (programs.length > 0) {
    console.log('\n  Your programs:');
    programs.forEach(p => {
      console.log(`    - ${p.name} (ID: ${p.program_id})`);
    });
  } else {
    console.log('  ⚠️  No programs found - you need to create one in your web app first!');
  }
}

// Step 4: Store data for next script
const result = {
  devices: devices || [],
  sites: sites || [],
  programs: programs || []
};

console.log('\n\n=== NEXT STEPS ===\n');

if (devices && devices.length > 0) {
  console.log('✓ You already have devices registered!');
  console.log('  We can proceed with testing the MQTT connection.\n');
} else if (sites && sites.length > 0 && programs && programs.length > 0) {
  console.log('⚠️  You need to register a test device.');
  console.log('  Run the next script to register one automatically.\n');
  const siteName = sites[0].site_name || sites[0].name || 'Unnamed Site';
  console.log(`  Will use site: ${siteName}`);
  console.log(`  Will use program: ${programs[0].name}`);
} else {
  console.log('⚠️  You need to create a site and program first.');
  console.log('  Please use your web app to create these before setting up devices.\n');
}

console.log('=== END OF CHECK ===\n');

// Export for next step
export default result;
