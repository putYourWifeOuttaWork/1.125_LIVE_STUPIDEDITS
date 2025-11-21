#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndGenerateSnapshots() {
  console.log('🔍 Checking for active sessions...\n');

  // Get active sessions
  const { data: sessions, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (sessionError) {
    console.error('❌ Error fetching sessions:', sessionError);
    return;
  }

  console.log(`✅ Found ${sessions.length} recent sessions\n`);

  if (sessions.length === 0) {
    console.log('⚠️  No sessions found. Cannot generate snapshots.');
    return;
  }

  // Show session details
  for (const session of sessions) {
    console.log(`📅 Session: ${session.session_id}`);
    console.log(`   Site: ${session.site_id}`);
    console.log(`   Program: ${session.program_id}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Start: ${session.session_start_date}`);
    console.log(`   End: ${session.session_end_date}`);
    console.log('');
  }

  // Try to generate snapshots for the first session
  const firstSession = sessions[0];
  console.log(`🔨 Attempting to generate snapshots for session ${firstSession.session_id}...\n`);

  // Call the generate function
  const { data: result, error: genError } = await supabase
    .rpc('generate_all_wake_snapshots_for_session', {
      p_session_id: firstSession.session_id
    });

  if (genError) {
    console.error('❌ Error generating snapshots:', genError);

    console.log('⚠️  Function may not exist or session has no data to snapshot.');
    return;
  }

  console.log('✅ Snapshots generated:', result);

  // Check if snapshots were created
  const { data: snapshots, error: snapError } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, wake_round_start')
    .eq('session_id', firstSession.session_id)
    .order('wake_number', { ascending: true });

  if (snapError) {
    console.error('❌ Error fetching snapshots:', snapError);
    return;
  }

  console.log(`\n✅ Found ${snapshots.length} snapshots for session:`);
  snapshots.forEach(s => {
    console.log(`   Wake #${s.wake_number}: ${s.wake_round_start}`);
  });
}

checkAndGenerateSnapshots().then(() => process.exit(0));
