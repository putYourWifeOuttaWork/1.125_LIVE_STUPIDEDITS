import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('Checking site defaults for temperature and humidity...\n');

const { data, error } = await supabase
  .from('sites')
  .select('site_id, site_name, default_temperature, default_indoor_temperature, default_humidity, default_indoor_humidity, default_weather, submission_defaults')
  .in('site_id', [
    '163ff865-6c91-4a12-ad1a-3189e5a4ed1f',
    '6f324a67-6e03-4d0f-a3da-df68d8e70a10'
  ]);

if (error) {
  console.log('Error:', error);
} else {
  console.log('Site Defaults:');
  data.forEach(site => {
    console.log(`\n${site.site_name}:`);
    console.log(`  default_temperature: ${site.default_temperature}`);
    console.log(`  default_indoor_temperature: ${site.default_indoor_temperature}`);
    console.log(`  default_humidity: ${site.default_humidity}`);
    console.log(`  default_indoor_humidity: ${site.default_indoor_humidity}`);
    console.log(`  default_weather: ${site.default_weather}`);
    console.log(`  submission_defaults: ${JSON.stringify(site.submission_defaults)}`);
  });
}

process.exit(0);
