#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseVisualizationData() {
  console.log('🔍 COMPREHENSIVE VISUALIZATION DATA AUDIT\n');
  console.log('=' .repeat(80));

  // ============================================================
  // 1. CHECK SITES CONFIGURATION
  // ============================================================
  console.log('\n📍 1. SITES CONFIGURATION CHECK');
  console.log('-'.repeat(80));

  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select('site_id, name, length, width, program_id, snapshot_cadence_hours')
    .order('created_at', { ascending: false })
    .limit(10);

  if (sitesError) {
    console.error('❌ Error fetching sites:', sitesError);
  } else {
    console.log(`Found ${sites.length} sites:\n`);
    sites.forEach(site => {
      const hasLength = site.length !== null && site.length > 0;
      const hasWidth = site.width !== null && site.width > 0;
      const hasCadence = site.snapshot_cadence_hours !== null && site.snapshot_cadence_hours > 0;

      console.log(`  ${hasLength && hasWidth ? '✅' : '❌'} ${site.name}`);
      console.log(`     Dimensions: ${site.length || 'NULL'}ft × ${site.width || 'NULL'}ft`);
      console.log(`     Snapshot Cadence: ${site.snapshot_cadence_hours || 'NULL'} hours`);
      console.log(`     Status: ${hasLength && hasWidth ? 'READY' : 'MISSING DIMENSIONS'}\n`);
    });
  }

  // ============================================================
  // 2. CHECK DEVICE POSITIONING
  // ============================================================
  console.log('\n📍 2. DEVICE POSITIONING CHECK');
  console.log('-'.repeat(80));

  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, site_id, x_position, y_position, is_active, sites(name)')
    .not('site_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (devicesError) {
    console.error('❌ Error fetching devices:', devicesError);
  } else {
    const positioned = devices.filter(d => d.x_position !== null && d.y_position !== null);
    const unpositioned = devices.filter(d => d.x_position === null || d.y_position === null);
    const active = devices.filter(d => d.is_active);

    console.log(`Total devices: ${devices.length}`);
    console.log(`  ✅ With positions: ${positioned.length}`);
    console.log(`  ❌ Missing positions: ${unpositioned.length}`);
    console.log(`  🟢 Active: ${active.length}\n`);

    if (unpositioned.length > 0) {
      console.log('Devices missing positions:');
      unpositioned.forEach(d => {
        console.log(`  ⚠️  ${d.device_code} (${d.sites?.name || 'No site'})`);
      });
      console.log();
    }
  }

  // ============================================================
  // 3. CHECK SESSIONS WITH DATA
  // ============================================================
  console.log('\n📊 3. SESSIONS WITH DATA CHECK');
  console.log('-'.repeat(80));

  const { data: sessions, error: sessionsError } = await supabase
    .from('site_device_sessions')
    .select(`
      session_id,
      session_date,
      status,
      sites(name),
      pilot_programs(name)
    `)
    .order('session_date', { ascending: false })
    .limit(10);

  if (sessionsError) {
    console.error('❌ Error fetching sessions:', sessionsError);
  } else {
    console.log(`Found ${sessions.length} recent sessions:\n`);

    for (const session of sessions) {
      // Count wake payloads
      const { count: payloadCount } = await supabase
        .from('device_wake_payloads')
        .select('*', { count: 'exact', head: true })
        .eq('site_device_session_id', session.session_id);

      // Count snapshots
      const { count: snapshotCount } = await supabase
        .from('session_wake_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.session_id);

      // Count images
      const { count: imageCount } = await supabase
        .from('device_images')
        .select('*', { count: 'exact', head: true })
        .eq('site_device_session_id', session.session_id);

      const hasData = payloadCount > 0 || imageCount > 0;
      const hasSnapshots = snapshotCount > 0;
      const needsSnapshots = hasData && !hasSnapshots;

      console.log(`  ${needsSnapshots ? '⚠️' : hasSnapshots ? '✅' : '⚪'} ${session.session_date} - ${session.sites?.name || 'Unknown'}`);
      console.log(`     Session ID: ${session.session_id}`);
      console.log(`     Status: ${session.status}`);
      console.log(`     Payloads: ${payloadCount || 0} | Images: ${imageCount || 0} | Snapshots: ${snapshotCount || 0}`);

      if (needsSnapshots) {
        console.log(`     ⚠️  HAS DATA BUT NO SNAPSHOTS - NEEDS REGENERATION`);
      }
      console.log();
    }
  }

  // ============================================================
  // 4. CHECK WAKE_PAYLOAD_ID LINKAGES
  // ============================================================
  console.log('\n🔗 4. WAKE_PAYLOAD_ID LINKAGE CHECK');
  console.log('-'.repeat(80));

  // Check telemetry linkages
  const { count: totalTelemetry } = await supabase
    .from('device_telemetry')
    .select('*', { count: 'exact', head: true });

  const { count: linkedTelemetry } = await supabase
    .from('device_telemetry')
    .select('*', { count: 'exact', head: true })
    .not('wake_payload_id', 'is', null);

  const { count: unlinkedTelemetry } = await supabase
    .from('device_telemetry')
    .select('*', { count: 'exact', head: true })
    .is('wake_payload_id', null);

  // Check image linkages
  const { count: totalImages } = await supabase
    .from('device_images')
    .select('*', { count: 'exact', head: true });

  const { count: linkedImages } = await supabase
    .from('device_images')
    .select('*', { count: 'exact', head: true })
    .not('wake_payload_id', 'is', null);

  const { count: unlinkedImages } = await supabase
    .from('device_images')
    .select('*', { count: 'exact', head: true })
    .is('wake_payload_id', null);

  console.log('Telemetry Records:');
  console.log(`  Total: ${totalTelemetry || 0}`);
  console.log(`  ✅ Linked: ${linkedTelemetry || 0} (${totalTelemetry ? Math.round((linkedTelemetry / totalTelemetry) * 100) : 0}%)`);
  console.log(`  ❌ Unlinked: ${unlinkedTelemetry || 0} (${totalTelemetry ? Math.round((unlinkedTelemetry / totalTelemetry) * 100) : 0}%)\n`);

  console.log('Image Records:');
  console.log(`  Total: ${totalImages || 0}`);
  console.log(`  ✅ Linked: ${linkedImages || 0} (${totalImages ? Math.round((linkedImages / totalImages) * 100) : 0}%)`);
  console.log(`  ❌ Unlinked: ${unlinkedImages || 0} (${totalImages ? Math.round((unlinkedImages / totalImages) * 100) : 0}%)\n`);

  // ============================================================
  // 5. CHECK SNAPSHOT FUNCTION
  // ============================================================
  console.log('\n⚙️  5. SNAPSHOT FUNCTION CHECK');
  console.log('-'.repeat(80));

  const { data: functionCheck, error: functionError } = await supabase
    .rpc('generate_session_wake_snapshot', {
      p_session_id: '00000000-0000-0000-0000-000000000000', // Dummy ID
      p_wake_number: 1,
      p_wake_round_start: new Date().toISOString(),
      p_wake_round_end: new Date().toISOString()
    });

  if (functionError) {
    if (functionError.message.includes('Session not found')) {
      console.log('✅ Function exists and is callable (expected error for dummy session)');
    } else {
      console.log('⚠️  Function exists but may have issues:');
      console.log(`   Error: ${functionError.message}`);
    }
  } else {
    console.log('✅ Function executed successfully');
  }

  // ============================================================
  // 6. SUMMARY AND RECOMMENDATIONS
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY AND RECOMMENDATIONS');
  console.log('='.repeat(80) + '\n');

  const issues = [];
  const recommendations = [];

  // Check for sites without dimensions
  const sitesWithoutDimensions = sites?.filter(s => !s.length || !s.width) || [];
  if (sitesWithoutDimensions.length > 0) {
    issues.push(`${sitesWithoutDimensions.length} site(s) missing dimensions`);
    recommendations.push('Update sites table with length and width values');
  }

  // Check for devices without positions
  const devicesWithoutPositions = devices?.filter(d => d.x_position === null || d.y_position === null) || [];
  if (devicesWithoutPositions.length > 0) {
    issues.push(`${devicesWithoutPositions.length} device(s) missing positions`);
    recommendations.push('Add x_position and y_position to all active devices');
  }

  // Check for unlinked telemetry
  if (unlinkedTelemetry > 0) {
    issues.push(`${unlinkedTelemetry} telemetry record(s) not linked to wake payloads`);
    recommendations.push('Run backfill script to link telemetry to wake_payloads');
  }

  // Check for unlinked images
  if (unlinkedImages > 0) {
    issues.push(`${unlinkedImages} image(s) not linked to wake payloads`);
    recommendations.push('Run backfill script to link images to wake_payloads');
  }

  // Check for sessions needing snapshots
  const sessionsNeedingSnapshots = [];
  for (const session of sessions || []) {
    const { count: payloadCount } = await supabase
      .from('device_wake_payloads')
      .select('*', { count: 'exact', head: true })
      .eq('site_device_session_id', session.session_id);

    const { count: snapshotCount } = await supabase
      .from('session_wake_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.session_id);

    if (payloadCount > 0 && snapshotCount === 0) {
      sessionsNeedingSnapshots.push(session);
    }
  }

  if (sessionsNeedingSnapshots.length > 0) {
    issues.push(`${sessionsNeedingSnapshots.length} session(s) have data but no snapshots`);
    recommendations.push('Regenerate snapshots for sessions with data');
  }

  if (issues.length === 0) {
    console.log('🎉 NO ISSUES FOUND - System is ready for visualizations!\n');
  } else {
    console.log('❌ ISSUES FOUND:\n');
    issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });
    console.log('\n✅ RECOMMENDED ACTIONS:\n');
    recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
    console.log();
  }

  // Return structured data for programmatic use
  return {
    sites: sitesWithoutDimensions.map(s => s.site_id),
    devicesNeedingPositions: devicesWithoutPositions.map(d => d.device_id),
    sessionsNeedingSnapshots: sessionsNeedingSnapshots.map(s => s.session_id),
    unlinkedTelemetry,
    unlinkedImages,
    issues,
    recommendations
  };
}

// Run diagnostic
diagnoseVisualizationData()
  .then(results => {
    console.log('\n✅ Diagnostic complete!\n');
    if (results.issues.length === 0) {
      console.log('System is ready. You can proceed with testing visualizations.\n');
    } else {
      console.log('Next steps: Address the issues above before regenerating snapshots.\n');
    }
  })
  .catch(error => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });
