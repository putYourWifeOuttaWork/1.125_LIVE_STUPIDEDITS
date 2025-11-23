#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSession() {
  console.log('=== Finding Session from Screenshot ===\n');
  console.log('Screenshot shows:');
  console.log('  Date: November 19, 2025');
  console.log('  Site: Iot Test Site 2');
  console.log('  Expected wakes: 31');
  console.log('  Completed: 0 (wrong!)');
  console.log('');

  // Find this session
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, expected_wake_count, completed_wake_count, sites(name)')
    .eq('session_date', '2025-11-19');

  console.log(`Sessions on Nov 19:`);
  sessions?.forEach(s => {
    console.log(`\n  Site: ${s.sites?.name}`);
    console.log(`  Session ID: ${s.session_id}`);
    console.log(`  Expected: ${s.expected_wake_count}`);
    console.log(`  Completed (stored): ${s.completed_wake_count}`);
    
    if (s.expected_wake_count === 31) {
      console.log('  ⬅️ THIS IS THE ONE FROM THE SCREENSHOT!');
    }
  });

  // Check payloads for the expected=31 session
  const targetSession = sessions?.find(s => s.expected_wake_count === 31);
  
  if (targetSession) {
    console.log(`\n=== Checking Payloads for Target Session ===`);
    const { data: payloads } = await supabase
      .from('device_wake_payloads')
      .select('payload_id, payload_status, overage_flag')
      .eq('site_device_session_id', targetSession.session_id);

    console.log(`\nPayloads linked to this session: ${payloads?.length || 0}`);
    
    if (payloads && payloads.length > 0) {
      const stats = {
        complete_not_overage: payloads.filter(p => p.payload_status === 'complete' && !p.overage_flag).length,
        complete_overage: payloads.filter(p => p.payload_status === 'complete' && p.overage_flag).length,
        failed: payloads.filter(p => p.payload_status === 'failed').length,
      };
      console.log(`  Complete (not overage): ${stats.complete_not_overage}`);
      console.log(`  Complete (overage): ${stats.complete_overage}`);
      console.log(`  Failed: ${stats.failed}`);
    }
  }
}

checkSession().then(() => process.exit(0)).catch(console.error);
