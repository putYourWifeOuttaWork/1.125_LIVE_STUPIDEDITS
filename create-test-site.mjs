import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzE0MzYsImV4cCI6MjA2NjcwNzQzNn0.0msVw5lkmycrU1p1qFiUTv7Q6AB-IIdpZejYbekW4sk';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n=== CREATING TEST SITE FOR IOT DEVICE ===\n');

// First get a program
const programs = await supabase
  .from('pilot_programs')
  .select('program_id, name')
  .limit(1);

if (!programs.data || programs.data.length === 0) {
  console.log('Error: No programs found');
  process.exit(1);
}

const program = programs.data[0];
console.log('Using program:', program.name);

// Create a test site using the RPC function
console.log('\nCreating site using RPC...');
const result = await supabase.rpc('create_site_without_history', {
  p_name: 'IoT Test Site',
  p_type: 'Greenhouse',
  p_program_id: program.program_id,
  p_submission_defaults: null,
  p_petri_defaults: null,
  p_gasifier_defaults: null
});

if (result.error) {
  console.log('\nError creating site:', result.error.message);
  console.log('Details:', result.error);
} else {
  console.log('\n✓ Site created successfully!');
  console.log('  Site ID:', result.data.site_id);
  console.log('  Site Name:', result.data.name || 'IoT Test Site');
  console.log('\nYou can now register IoT devices!');
}
