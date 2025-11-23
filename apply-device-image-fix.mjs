#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI';

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = readFileSync('FIX_DEVICE_IMAGES_INSERT.sql', 'utf8');

console.log('Applying fix to fn_wake_ingestion_handler...');

const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ Fix applied successfully!');
console.log('Function fn_wake_ingestion_handler now includes:');
console.log('  - program_id (resolved from lineage)');
console.log('  - site_id (resolved from lineage)');
console.log('  - site_device_session_id (resolved/created)');
console.log('');
console.log('This matches ESP32-CAM protocol (Section 5 of PDF):');
console.log('  Device sends ONLY: device_id, timestamps, image_name, telemetry');
console.log('  Server resolves: company_id, program_id, site_id, session_id');
