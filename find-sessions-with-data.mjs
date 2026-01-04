#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findSessionsWithData() {
  console.log('🔍 Finding sessions with actual visualization data...\n');

  // Get recent sessions
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, site_id, session_date, completed_wake_count, sites(name, site_code)')
    .order('session_date', { ascending: false })
    .limit(10);

  if (!sessions || sessions.length === 0) {
    console.log('No sessions found');
    return;
  }

  console.log('Checking recent sessions for viewable data...\n');

  const sessionsWithData = [];

  for (const session of sessions) {
    // Check if this session has snapshots with actual telemetry
    const { data: snapshots } = await supabase
      .from('session_wake_snapshots')
      .select('snapshot_id, avg_temperature, avg_humidity, new_images_this_round')
      .eq('session_id', session.session_id);

    const hasData = snapshots && snapshots.some(s =>
      s.avg_temperature !== null ||
      s.avg_humidity !== null ||
      (s.new_images_this_round && s.new_images_this_round > 0)
    );

    const dataScore = {
      totalSnapshots: snapshots?.length || 0,
      withTemperature: snapshots?.filter(s => s.avg_temperature !== null).length || 0,
      withHumidity: snapshots?.filter(s => s.avg_humidity !== null).length || 0,
      totalImages: snapshots?.reduce((sum, s) => sum + (s.new_images_this_round || 0), 0) || 0,
    };

    if (hasData || dataScore.totalSnapshots > 0) {
      sessionsWithData.push({
        ...session,
        ...dataScore,
        viewable: hasData
      });
    }
  }

  console.log('=' .repeat(80));
  console.log('SESSIONS WITH VISUALIZATION DATA');
  console.log('=' .repeat(80));

  if (sessionsWithData.length === 0) {
    console.log('\n⚠️  No sessions with viewable data found.\n');
    console.log('Run backfill and regenerate scripts to populate data.\n');
    return;
  }

  sessionsWithData.forEach((session, i) => {
    const status = session.viewable ? '✅ VIEWABLE' : '⚠️  EMPTY';
    console.log(`\n${status} #${i + 1}: ${session.sites.name} - ${session.session_date}`);
    console.log(`Session ID: ${session.session_id}`);
    console.log(`Completed wakes: ${session.completed_wake_count}`);
    console.log(`Snapshots: ${session.totalSnapshots}`);
    console.log(`  - With temperature: ${session.withTemperature}`);
    console.log(`  - With humidity: ${session.withHumidity}`);
    console.log(`  - Total images: ${session.totalImages}`);

    if (session.viewable) {
      console.log(`\n📍 View this session at:`);
      console.log(`   /programs/{programId}/sites/${session.site_id}/sessions/${session.session_id}`);
    }
  });

  console.log('\n' + '=' .repeat(80));

  const viewableSessions = sessionsWithData.filter(s => s.viewable);
  if (viewableSessions.length > 0) {
    console.log(`\n✅ Found ${viewableSessions.length} session(s) with viewable data!`);
    console.log('\nBest session to view:');
    const best = viewableSessions[0];
    console.log(`  ${best.sites.name} - ${best.session_date}`);
    console.log(`  Session ID: ${best.session_id}`);
  } else {
    console.log('\n⚠️  No sessions have complete visualization data yet.');
    console.log('\nTo populate data:');
    console.log('1. Run: node backfill-wake-payload-data.mjs');
    console.log('2. Run: node regenerate-session-snapshots.mjs');
  }

  console.log('\n');
}

findSessionsWithData().catch(console.error);
