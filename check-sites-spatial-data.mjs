import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Analyzing SITES table 2D/Spatial structure...\n');

const { data: sites, error } = await supabase
  .from('sites')
  .select('*')
  .limit(2);

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log(`Found ${sites.length} sites\n`);

const site = sites[0];

console.log('🗺️  KEY 2D/Spatial Data in Sites Table:');
console.log('=====================================\n');

console.log('1. WALL_DETAILS (defines room boundaries):');
console.log('   ', JSON.stringify(site.wall_details, null, 2), '\n');

console.log('2. ZONES (environmental zones):');
console.log('   ', JSON.stringify(site.zones, null, 2), '\n');

console.log('3. AIRFLOW_VECTORS (air movement):');
console.log('   ', JSON.stringify(site.airflow_vectors, null, 2), '\n');

console.log('4. DOOR_DETAILS (entry/exit points):');
console.log('   ', JSON.stringify(site.door_details, null, 2), '\n');

console.log('5. PLATFORM_DETAILS (elevated areas):');
console.log('   ', JSON.stringify(site.platform_details, null, 2), '\n');

console.log('6. FAN_DETAILS (ventilation):');
console.log('   ', JSON.stringify(site.fan_details, null, 2), '\n');

console.log('\n📐 Site Dimensions:');
console.log('==================');
console.log(`  Length: ${site.length} ft`);
console.log(`  Width: ${site.width} ft`);
console.log(`  Height: ${site.height} ft`);
console.log(`  Square Footage: ${site.square_footage}`);
console.log(`  Cubic Footage: ${site.cubic_footage}`);

console.log('\n✅ This structure is PERFECT for 2D visualization!');
console.log('   - X,Y coordinates in wall_details define room shape');
console.log('   - Zones can overlay environmental data');
console.log('   - We need to add DEVICE positions (x, y) to map them');
