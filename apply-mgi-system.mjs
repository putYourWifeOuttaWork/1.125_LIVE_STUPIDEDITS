import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('Applying MGI System Migration...\n');

const sql = readFileSync('/tmp/mgi_system.sql', 'utf8');

try {
  // Try to execute as a single transaction
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
  
  console.log('Migration applied successfully!');
  console.log('\nChanges:');
  console.log('  - Added wake_payload_id to device_images and device_telemetry');
  console.log('  - Added MGI velocity, speed, and scoring fields');
  console.log('  - Added latest MGI tracking to devices');
  console.log('  - Added snapshot cadence to sites');
  console.log('  - Created site_snapshots table');
  console.log('  - Created MGI calculation triggers');
  console.log('  - Created snapshot generation functions');
  
} catch (err) {
  console.error('Unexpected error:', err.message);
  process.exit(1);
}
