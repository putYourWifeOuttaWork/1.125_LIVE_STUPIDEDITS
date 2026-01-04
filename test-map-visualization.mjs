import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('========================================');
console.log('MAP VISUALIZATION FLOW TEST');
console.log('========================================\n');

// Test 1: Check sites have dimensions
console.log('1. SITE DIMENSIONS CHECK:\n');

const { data: sites, error: sitesError } = await supabase
  .from('sites')
  .select('site_id, name, length, width, map_image_url, site_template_id')
  .not('length', 'is', null)
  .not('width', 'is', null)
  .limit(5);

if (sitesError) {
  console.log('❌ Error:', sitesError.message);
} else {
  console.log(`✅ Found ${sites.length} sites with dimensions`);
  sites.forEach(site => {
    console.log(`   ${site.name}: ${site.length}ft × ${site.width}ft`);
    console.log(`      Map image: ${site.map_image_url ? '✅ Yes' : '❌ No'}`);
  });
}

// Test 2: Check active sessions with snapshots
console.log('\n2. ACTIVE SESSIONS WITH SNAPSHOTS:\n');

const { data: activeSessions, error: sessionsError } = await supabase
  .from('site_device_sessions')
  .select(`
    session_id,
    site_id,
    status,
    scheduled_start,
    scheduled_end,
    sites!inner(name, length, width)
  `)
  .in('status', ['active', 'active_with_overdue'])
  .limit(3);

if (sessionsError) {
  console.log('❌ Error:', sessionsError.message);
} else {
  console.log(`✅ Found ${activeSessions.length} active sessions\n`);

  for (const session of activeSessions) {
    console.log(`   Session: ${session.session_id}`);
    console.log(`   Site: ${session.sites.name}`);
    console.log(`   Dimensions: ${session.sites.length}ft × ${session.sites.width}ft`);

    // Check snapshots for this session
    const { count: snapshotCount } = await supabase
      .from('session_wake_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.session_id);

    console.log(`   Snapshots: ${snapshotCount || 0}`);

    if (snapshotCount && snapshotCount > 0) {
      // Get latest snapshot
      const { data: latestSnapshot } = await supabase
        .from('session_wake_snapshots')
        .select('wake_number, site_state, avg_temperature, avg_humidity, avg_mgi')
        .eq('session_id', session.session_id)
        .order('wake_number', { ascending: false })
        .limit(1)
        .single();

      if (latestSnapshot) {
        console.log(`   Latest wake: #${latestSnapshot.wake_number}`);
        console.log(`   Avg temp: ${latestSnapshot.avg_temperature}°C`);
        console.log(`   Avg humidity: ${latestSnapshot.avg_humidity}%`);
        console.log(`   Avg MGI: ${latestSnapshot.avg_mgi}`);

        // Check if site_state has device positions
        let siteState;
        try {
          siteState = typeof latestSnapshot.site_state === 'string'
            ? JSON.parse(latestSnapshot.site_state)
            : latestSnapshot.site_state;
        } catch (e) {
          console.log('   ⚠️  Error parsing site_state');
        }

        if (siteState && siteState.devices) {
          const devicesWithPositions = siteState.devices.filter(d =>
            d.position && d.position.x !== null && d.position.y !== null
          );
          console.log(`   Devices in snapshot: ${siteState.devices.length}`);
          console.log(`   Devices with positions: ${devicesWithPositions.length}`);

          // Sample device
          if (devicesWithPositions.length > 0) {
            const sample = devicesWithPositions[0];
            console.log(`   Sample device: ${sample.device_code || sample.device_id}`);
            console.log(`      Position: (${sample.position.x}, ${sample.position.y})`);
            console.log(`      Temperature: ${sample.telemetry?.temperature || sample.telemetry?.latest_temperature || 'N/A'}`);
            console.log(`      MGI: ${sample.mgi_state?.current_mgi || sample.mgi_state?.latest_mgi_score || 'N/A'}`);
          }
        }
      }
    }
    console.log('');
  }
}

// Test 3: Check device positions in devices table
console.log('\n3. DEVICE POSITION DATA:\n');

const { data: devicesWithPos, error: devError } = await supabase
  .from('devices')
  .select('device_id, device_code, x_position, y_position, site_id')
  .not('site_id', 'is', null)
  .not('x_position', 'is', null)
  .not('y_position', 'is', null)
  .limit(10);

if (devError) {
  console.log('❌ Error:', devError.message);
} else {
  console.log(`✅ Found ${devicesWithPos.length} devices with positions`);
  devicesWithPos.slice(0, 3).forEach(d => {
    console.log(`   ${d.device_code}: (${d.x_position}, ${d.y_position})`);
  });
}

// Test 4: Check environmental data availability
console.log('\n4. ENVIRONMENTAL DATA FROM DEVICE_IMAGES:\n');

const { data: recentImages, error: imgError } = await supabase
  .from('device_images')
  .select('image_id, device_id, captured_at, temperature, humidity, mgi_score, status')
  .not('temperature', 'is', null)
  .eq('status', 'complete')
  .order('captured_at', { ascending: false })
  .limit(5);

if (imgError) {
  console.log('❌ Error:', imgError.message);
} else {
  console.log(`✅ Found ${recentImages.length} recent images with environmental data`);
  if (recentImages.length > 0) {
    const sample = recentImages[0];
    console.log(`   Latest: ${sample.captured_at}`);
    console.log(`   Temperature: ${sample.temperature}°C`);
    console.log(`   Humidity: ${sample.humidity}%`);
    console.log(`   MGI: ${sample.mgi_score}`);
  }
}

// Test 5: End-to-end flow validation
console.log('\n5. END-TO-END VALIDATION:\n');

const { data: testSession } = await supabase
  .from('site_device_sessions')
  .select(`
    session_id,
    site_id,
    sites!inner(name, length, width, map_image_url)
  `)
  .in('status', ['active', 'active_with_overdue'])
  .limit(1)
  .single();

if (testSession) {
  console.log(`Testing session: ${testSession.session_id}`);
  console.log(`Site: ${testSession.sites.name}\n`);

  const checks = [];

  // Check 1: Site has dimensions
  if (testSession.sites.length > 0 && testSession.sites.width > 0) {
    checks.push({ check: 'Site dimensions', status: '✅', value: `${testSession.sites.length}×${testSession.sites.width}ft` });
  } else {
    checks.push({ check: 'Site dimensions', status: '❌', value: 'Missing' });
  }

  // Check 2: Site has map image
  if (testSession.sites.map_image_url) {
    checks.push({ check: 'Site map image', status: '✅', value: 'Present' });
  } else {
    checks.push({ check: 'Site map image', status: '⚠️', value: 'Optional - not set' });
  }

  // Check 3: Devices exist with positions
  const { count: deviceCount } = await supabase
    .from('devices')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', testSession.site_id)
    .not('x_position', 'is', null)
    .not('y_position', 'is', null);

  if (deviceCount && deviceCount > 0) {
    checks.push({ check: 'Devices with positions', status: '✅', value: `${deviceCount} devices` });
  } else {
    checks.push({ check: 'Devices with positions', status: '❌', value: 'No positioned devices' });
  }

  // Check 4: Snapshots exist
  const { count: snapCount } = await supabase
    .from('session_wake_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', testSession.session_id);

  if (snapCount && snapCount > 0) {
    checks.push({ check: 'Session snapshots', status: '✅', value: `${snapCount} snapshots` });
  } else {
    checks.push({ check: 'Session snapshots', status: '⚠️', value: 'No snapshots yet' });
  }

  // Check 5: Environmental data available
  const { count: envCount } = await supabase
    .from('device_images')
    .select('*', { count: 'exact', head: true })
    .eq('site_device_session_id', testSession.session_id)
    .not('temperature', 'is', null);

  if (envCount && envCount > 0) {
    checks.push({ check: 'Environmental data', status: '✅', value: `${envCount} readings` });
  } else {
    checks.push({ check: 'Environmental data', status: '⚠️', value: 'No data yet' });
  }

  console.log('Prerequisites for map visualization:\n');
  checks.forEach(({ check, status, value }) => {
    console.log(`   ${status} ${check}: ${value}`);
  });

  const criticalPassed = checks.filter(c =>
    ['Site dimensions', 'Devices with positions'].includes(c.check) && c.status === '✅'
  ).length === 2;

  console.log('\n' + (criticalPassed ? '✅ MAP SHOULD BE VISIBLE' : '❌ MAP CANNOT BE DISPLAYED'));
} else {
  console.log('⚠️  No active sessions found to test');
}

console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================\n');

const allChecks = [
  sites && sites.length > 0 ? '✅' : '❌',
  activeSessions && activeSessions.length > 0 ? '✅' : '❌',
  devicesWithPos && devicesWithPos.length > 0 ? '✅' : '❌',
  recentImages && recentImages.length > 0 ? '✅' : '❌',
];

console.log('Component Status:');
console.log(`  ${allChecks[0]} Sites with dimensions`);
console.log(`  ${allChecks[1]} Active sessions`);
console.log(`  ${allChecks[2]} Devices with positions`);
console.log(`  ${allChecks[3]} Environmental data (device_images)`);

const allPassed = allChecks.every(c => c === '✅');

if (allPassed) {
  console.log('\n✅ ALL SYSTEMS GO - Maps should be fully functional!');
  console.log('   The map visualization flow is complete:');
  console.log('   1. Site dimensions configured');
  console.log('   2. Devices positioned on site maps');
  console.log('   3. Environmental data from device_images');
  console.log('   4. Snapshots capture device states over time');
  console.log('   5. Timeline playback enabled for historical sessions');
} else {
  console.log('\n⚠️  SOME COMPONENTS NEED ATTENTION');
  console.log('   Check the details above for missing elements');
}

console.log('\n========================================\n');
