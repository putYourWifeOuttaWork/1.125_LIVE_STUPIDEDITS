import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('Checking sites columns...');
const { data: sites, error: sitesErr } = await supabase.from('sites').select('*').limit(1);
if (!sitesErr && sites.length > 0) {
  console.log('Site columns:', Object.keys(sites[0]));
} else {
  console.log('No sites found or error:', sitesErr?.message);
}

console.log('\nChecking programs columns...');
const { data: programs, error: progErr } = await supabase.from('pilot_programs').select('*').limit(1);
if (!progErr && programs.length > 0) {
  console.log('Program columns:', Object.keys(programs[0]));
} else {
  console.log('No programs found or error:', progErr?.message);
}
