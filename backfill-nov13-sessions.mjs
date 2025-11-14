import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔄 Backfilling Missing Sessions for Nov 13, 2025\n');
console.log('='.repeat(70));

// Get all active sites with active programs
const { data: sites, error: sitesError } = await supabase
  .from('sites')
  .select(`
    site_id,
    name,
    program_id,
    pilot_programs!inner(
      program_id,
      name,
      status
    )
  `)
  .eq('pilot_programs.status', 'active');

if (sitesError) {
  console.error('Error fetching sites:', sitesError);
  process.exit(1);
}

console.log(`\nFound ${sites.length} sites with active programs\n`);

// Backfill for Nov 13, 2025
const backfillDate = '2025-11-13';
const results = [];

for (const site of sites) {
  console.log(`Processing: ${site.name} (${site.site_id})`);

  // Check if session already exists
  const { data: existing } = await supabase
    .from('device_site_sessions')
    .select('session_id')
    .eq('site_id', site.site_id)
    .eq('session_date', backfillDate)
    .maybeSingle();

  if (existing) {
    console.log(`  ✓ Session already exists: ${existing.session_id}`);
    results.push({ site: site.name, status: 'exists', session_id: existing.session_id });
    continue;
  }

  // Create session using the function
  const { data: result, error } = await supabase.rpc('fn_create_or_update_device_session', {
    p_site_id: site.site_id,
    p_session_date: backfillDate
  });

  if (error) {
    console.log(`  ✗ Error: ${error.message}`);
    results.push({ site: site.name, status: 'error', error: error.message });
  } else {
    console.log(`  ✓ Created: ${result.session_id}`);
    results.push({ site: site.name, status: 'created', session_id: result.session_id });
  }
}

console.log('\n' + '='.repeat(70));
console.log('📊 BACKFILL SUMMARY\n');

const created = results.filter(r => r.status === 'created').length;
const existed = results.filter(r => r.status === 'exists').length;
const errors = results.filter(r => r.status === 'error').length;

console.log(`Total sites processed: ${results.length}`);
console.log(`✓ Sessions created: ${created}`);
console.log(`✓ Sessions already existed: ${existed}`);
console.log(`✗ Errors: ${errors}`);

if (errors > 0) {
  console.log('\nErrors:');
  results.filter(r => r.status === 'error').forEach(r => {
    console.log(`  - ${r.site}: ${r.error}`);
  });
}

console.log('\n' + '='.repeat(70));

process.exit(0);
