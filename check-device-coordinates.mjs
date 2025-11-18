import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking device coordinate storage...\n');

// Check all devices for coordinate data
const { data: devices, error: deviceError } = await supabase
  .from('devices')
  .select('device_id, device_code, device_name, x_position, y_position, placement_json, site_id')
  .order('created_at', { ascending: true });

if (deviceError) {
  console.error('❌ Error fetching devices:', deviceError);
  process.exit(1);
}

console.log(`📊 Total devices: ${devices.length}\n`);

// Analyze coordinate storage patterns
let hasXYColumns = 0;
let hasPlacementJSON = 0;
let hasXYinJSON = 0;
let hasNeither = 0;
let hasBoth = 0;

const details = [];

devices.forEach(device => {
  const hasColumns = device.x_position !== null && device.y_position !== null;
  const hasJSON = device.placement_json !== null;
  const hasXYinJSONData = hasJSON &&
    (device.placement_json.x !== undefined || device.placement_json.y !== undefined);

  if (hasColumns) hasXYColumns++;
  if (hasJSON) hasPlacementJSON++;
  if (hasXYinJSONData) hasXYinJSON++;

  if (hasColumns && hasXYinJSONData) {
    hasBoth++;
  } else if (!hasColumns && !hasXYinJSONData) {
    hasNeither++;
  }

  details.push({
    device_code: device.device_code || device.device_id.slice(0, 8),
    device_name: device.device_name,
    site_id: device.site_id ? device.site_id.slice(0, 8) : 'null',
    x_position: device.x_position,
    y_position: device.y_position,
    placement_json_x: hasJSON ? device.placement_json.x : undefined,
    placement_json_y: hasJSON ? device.placement_json.y : undefined,
    placement_height: hasJSON ? device.placement_json.height : undefined,
    placement_notes: hasJSON ? device.placement_json.notes : undefined,
  });
});

console.log('📈 Summary:');
console.log('===========');
console.log(`Devices with x_position/y_position columns: ${hasXYColumns}`);
console.log(`Devices with placement_json: ${hasPlacementJSON}`);
console.log(`Devices with x/y in placement_json: ${hasXYinJSON}`);
console.log(`Devices with BOTH column AND JSON coords: ${hasBoth}`);
console.log(`Devices with NEITHER: ${hasNeither}\n`);

console.log('📋 Device Details:');
console.log('==================');
console.table(details);

console.log('\n💡 Migration Strategy:');
console.log('======================');
if (hasXYinJSON > 0 && hasXYColumns === 0) {
  console.log('✅ Need to migrate: placement_json.x/y → x_position/y_position columns');
} else if (hasXYColumns > 0 && hasXYinJSON === 0) {
  console.log('✅ Columns already populated, JSON needs cleanup');
} else if (hasBoth > 0) {
  console.log('⚠️  Both exist - need to reconcile which is source of truth');
} else if (hasNeither > 0) {
  console.log('❌ Some devices have NO coordinates at all - need manual entry');
}

console.log('\n📝 Sample placement_json structures:');
const samplesWithJSON = devices.filter(d => d.placement_json).slice(0, 3);
samplesWithJSON.forEach(d => {
  console.log(`\nDevice: ${d.device_code || 'Unknown'}`);
  console.log(JSON.stringify(d.placement_json, null, 2));
});
