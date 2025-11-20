import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('📊 Checking available test data...\n');

const { data: sites } = await supabase
  .from('sites')
  .select('site_id, site_name, program_id')
  .limit(5);

console.log('Sites:', sites?.length || 0);
sites?.forEach(s => console.log(`  - ${s.site_name} (program: ${s.program_id ? '✓' : '✗'})`));

const { data: programs } = await supabase
  .from('pilot_programs')
  .select('program_id, program_name, start_date')
  .limit(5);

console.log('\nPrograms:', programs?.length || 0);
programs?.forEach(p => console.log(`  - ${p.program_name} (start: ${p.start_date || 'NULL'})`));

const { data: devices } = await supabase
  .from('devices')
  .select('device_id, device_name, site_id')
  .limit(5);

console.log('\nDevices:', devices?.length || 0);

const { data: images } = await supabase
  .from('device_images')
  .select('image_id, device_id, site_id, captured_at')
  .not('site_id', 'is', null)
  .limit(5);

console.log('\nDevice Images:', images?.length || 0);
