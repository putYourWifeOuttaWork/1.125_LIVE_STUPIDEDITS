#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 Checking All Device Sessions\n');

async function main() {
  // Get all sessions
  const { data: allSessions, error } = await supabase
    .from('site_device_sessions')
    .select(`
      session_id,
      session_date,
      session_start_time,
      session_end_time,
      status,
      expected_wake_count,
      sites(name, site_id)
    `)
    .order('session_date', { ascending: false })
    .limit(50);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`Found ${allSessions.length} sessions total\n`);

  // Group by status
  const byStatus = {};
  allSessions.forEach(s => {
    if (!byStatus[s.status]) byStatus[s.status] = [];
    byStatus[s.status].push(s);
  });

  console.log('📊 Sessions by Status:');
  Object.keys(byStatus).forEach(status => {
    console.log(`   ${status}: ${byStatus[status].length}`);
  });

  console.log('\n📅 Recent Sessions:');
  allSessions.slice(0, 10).forEach(session => {
    const now = new Date();
    const sessionEnd = new Date(session.session_end_time);
    const isPast = sessionEnd < now;

    console.log(`\n${session.session_date} | ${session.sites?.name || 'Unknown'}`);
    console.log(`   Status: ${session.status} ${isPast && session.status === 'in_progress' ? '⚠️  SHOULD BE LOCKED' : ''}`);
    console.log(`   Expected Wakes: ${session.expected_wake_count}`);
  });

  // Check for Nov 13 specifically
  const nov13Sessions = allSessions.filter(s => s.session_date === '2025-11-13');
  if (nov13Sessions.length > 0) {
    console.log('\n\n🗓️  Nov 13 Sessions (mentioned by user):');
    nov13Sessions.forEach(s => {
      console.log(`   ${s.sites?.name || 'Unknown'} - Status: ${s.status}`);
    });
  } else {
    console.log('\n\nℹ️  No sessions found for Nov 13, 2025');
  }
}

main().catch(console.error);
