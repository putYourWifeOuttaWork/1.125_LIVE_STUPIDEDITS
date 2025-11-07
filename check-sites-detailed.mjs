import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('\nChecking sites table in detail...\n');

const { data: sites, error, count } = await supabase
  .from('sites')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false });

if (error) {
  console.log('Error:', error.message);
  console.log('Details:', error);
} else {
  console.log(`Total sites in database: ${count}`);
  if (sites && sites.length > 0) {
    console.log('\nSites found:');
    sites.forEach((site, idx) => {
      console.log(`\n  ${idx + 1}. Site ID: ${site.site_id}`);
      console.log(`     Name: ${site.name || site.site_name || 'No name'}`);
      console.log(`     Program ID: ${site.program_id}`);
      console.log(`     Created: ${site.created_at}`);
    });
  } else {
    console.log('\n⚠️  No sites found in the database.');
    console.log('\nTroubleshooting:');
    console.log('1. Did the site creation show a success message?');
    console.log('2. Try refreshing your web app page');
    console.log('3. Check if there were any error messages');
  }
}
