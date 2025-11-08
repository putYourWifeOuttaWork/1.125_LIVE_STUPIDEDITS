import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzE0MzYsImV4cCI6MjA2NjcwNzQzNn0.0msVw5lkmycrU1p1qFiUTv7Q6AB-IIdpZejYbekW4sk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyDeviceColumns() {
  console.log('Verifying device table schema after migration...\n');

  // Get a sample device record to see which columns exist
  const { data: devices, error } = await supabase
    .from('devices')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error querying devices table:', error.message);
    return;
  }

  if (!devices || devices.length === 0) {
    console.log('⚠️  No devices found in the table');
    return;
  }

  const device = devices[0];
  const columns = Object.keys(device).sort();

  console.log('✅ Successfully queried devices table');
  console.log(`Found ${columns.length} columns:\n`);

  const requiredColumns = [
    'mapped_at',
    'mapped_by_user_id',
    'provisioning_status',
    'device_reported_site_id',
    'device_reported_location'
  ];

  console.log('Checking for required columns:');
  let allPresent = true;

  for (const col of requiredColumns) {
    const exists = columns.includes(col);
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${col}: ${exists ? 'EXISTS' : 'MISSING'}`);
    if (!exists) allPresent = false;
  }

  console.log('\nAll columns in devices table:');
  columns.forEach((col, i) => {
    console.log(`  ${i + 1}. ${col}`);
  });

  console.log('\nSample device record:');
  console.log(JSON.stringify(device, null, 2));

  if (allPresent) {
    console.log('\n✅ SUCCESS: All required columns are present!');
    console.log('You can now proceed to run the junction tables migration.');
  } else {
    console.log('\n❌ MISSING COLUMNS: Please apply the migration first.');
    console.log('Run the SQL from: supabase/migrations/20251108115959_add_missing_device_columns.sql');
  }
}

async function verifyJunctionTables() {
  console.log('\n' + '='.repeat(60));
  console.log('Checking for junction tables...\n');

  const tables = [
    'device_site_assignments',
    'device_program_assignments',
    'site_program_assignments'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${table}: NOT FOUND (${error.message})`);
      } else {
        console.log(`✅ ${table}: EXISTS (${count || 0} records)`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ERROR (${err.message})`);
    }
  }

  // Check for device_code and site_code columns
  console.log('\nChecking for code columns:');

  try {
    const { data: device } = await supabase
      .from('devices')
      .select('device_code')
      .limit(1)
      .maybeSingle();

    console.log(`${device !== null ? '✅' : '❌'} devices.device_code`);
  } catch {
    console.log('❌ devices.device_code');
  }

  try {
    const { data: site } = await supabase
      .from('sites')
      .select('site_code')
      .limit(1)
      .maybeSingle();

    console.log(`${site !== null ? '✅' : '❌'} sites.site_code`);
  } catch {
    console.log('❌ sites.site_code');
  }
}

async function main() {
  await verifyDeviceColumns();
  await verifyJunctionTables();
}

main().catch(console.error);
