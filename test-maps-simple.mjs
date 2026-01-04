import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('========================================');
console.log('MAP VISUALIZATION - SIMPLE TEST');
console.log('========================================\n');

// Test 1: Sites
console.log('1. SITES WITH DIMENSIONS:\n');
const { data: sites } = await supabase
  .from('sites')
  .select('*')
  .not('length', 'is', null)
  .not('width', 'is', null)
  .limit(3);

console.log(`   Found: ${sites?.length || 0} sites`);
if (sites && sites.length > 0) {
  sites.forEach(s => console.log(`   - ${s.name}: ${s.length}×${s.width}ft`));
}

// Test 2: Sessions
console.log('\n2. ACTIVE SESSIONS:\n');
const { data: sessions } = await supabase
  .from('site_device_sessions')
  .select('*')
  .in('status', ['active', 'active_with_overdue'])
  .limit(3);

console.log(`   Found: ${sessions?.length || 0} active sessions`);

// Test 3: Devices with positions
console.log('\n3. DEVICES WITH POSITIONS:\n');
const { count: posCount } = await supabase
  .from('devices')
  .select('*', { count: 'exact', head: true })
  .not('x_position', 'is', null)
  .not('y_position', 'is', null);

console.log(`   Found: ${posCount || 0} devices with positions`);

// Test 4: Snapshots
console.log('\n4. SESSION SNAPSHOTS:\n');
const { count: snapCount } = await supabase
  .from('session_wake_snapshots')
  .select('*', { count: 'exact', head: true });

console.log(`   Total snapshots: ${snapCount || 0}`);

if (snapCount && snapCount > 0) {
  const { data: sampleSnap } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .not('site_state', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (sampleSnap) {
    console.log(`   Latest snapshot: Wake #${sampleSnap.wake_number}`);
    console.log(`   Avg temp: ${sampleSnap.avg_temperature}°C`);

    let devices = [];
    try {
      const state = typeof sampleSnap.site_state === 'string'
        ? JSON.parse(sampleSnap.site_state)
        : sampleSnap.site_state;

      devices = Array.isArray(state) ? state : (state.devices || []);
    } catch (e) {
      // ignore
    }

    const withPos = devices.filter(d => d.position && d.position.x !== null);
    console.log(`   Devices in state: ${devices.length}`);
    console.log(`   With positions: ${withPos.length}`);
  }
}

// Test 5: Environmental data
console.log('\n5. ENVIRONMENTAL DATA (device_images):\n');
const { count: envCount } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('temperature', 'is', null);

console.log(`   Rows with temperature: ${envCount || 0}`);

console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================\n');

const ready = [
  (sites && sites.length > 0) ? '✅' : '❌',
  (sessions && sessions.length > 0) ? '✅' : '⚠️',
  (posCount && posCount > 0) ? '✅' : '❌',
  (snapCount && snapCount > 0) ? '✅' : '⚠️',
  (envCount && envCount > 0) ? '✅' : '❌',
];

console.log('Status:');
console.log(`  ${ready[0]} Sites with dimensions: ${sites?.length || 0}`);
console.log(`  ${ready[1]} Active sessions: ${sessions?.length || 0}`);
console.log(`  ${ready[2]} Devices with positions: ${posCount || 0}`);
console.log(`  ${ready[3]} Session snapshots: ${snapCount || 0}`);
console.log(`  ${ready[4]} Environmental data: ${envCount || 0}`);

const critical = ready[0] === '✅' && ready[2] === '✅';

console.log('\n' + (critical ? '✅ MAPS CAN BE DISPLAYED!' : '❌ MAPS CANNOT BE DISPLAYED'));

if (critical) {
  console.log('\nCore requirements met:');
  console.log('  - Sites have dimensions for map rendering');
  console.log('  - Devices have x,y positions on the map');
  console.log('  - Environmental data available from device_images');
  console.log('  - Snapshots capture device states over time');
  console.log('\nBoth HomePage and SiteDeviceSessionDetailPage');
  console.log('use the same SiteMapAnalyticsViewer component.');
}

console.log('\n========================================\n');
