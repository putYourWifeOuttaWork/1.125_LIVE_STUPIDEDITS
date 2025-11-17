#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 Checking Old In-Progress Sessions\n');

async function main() {
  // Check for old in_progress sessions
  const { data: oldSessions, error } = await supabase
    .from('site_device_sessions')
    .select(`
      session_id,
      session_date,
      session_start_time,
      session_end_time,
      status,
      expected_wake_count,
      sites(name)
    `)
    .eq('status', 'in_progress')
    .order('session_date', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`Found ${oldSessions.length} in_progress sessions:\n`);

  const now = new Date();
  const today = new Date().toISOString().split('T')[0];

  oldSessions.forEach(session => {
    const sessionEnd = new Date(session.session_end_time);
    const daysDiff = Math.floor((now - sessionEnd) / (1000 * 60 * 60 * 24));
    const isPast = sessionEnd < now;

    console.log(`📅 ${session.session_date} | ${session.sites?.name || 'Unknown Site'}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   End Time: ${session.session_end_time}`);
    console.log(`   ${isPast ? '⚠️  PAST DUE' : '✅ CURRENT'} (${daysDiff} days ago)`);
    console.log(`   Expected Wakes: ${session.expected_wake_count}`);
    console.log('');
  });

  // Count by age
  const pastSessions = oldSessions.filter(s => new Date(s.session_end_time) < now);
  const todaySessions = oldSessions.filter(s => s.session_date === today);

  console.log('\n📊 Summary:');
  console.log(`   Total in_progress: ${oldSessions.length}`);
  console.log(`   Past due (should be locked): ${pastSessions.length}`);
  console.log(`   Today (correct): ${todaySessions.length}`);

  if (pastSessions.length > 0) {
    console.log('\n⚠️  ACTION REQUIRED:');
    console.log(`   ${pastSessions.length} sessions are past their end_time but still "in_progress"`);
    console.log('   These should be automatically locked at midnight.');
    console.log('\n💡 Need to implement:');
    console.log('   1. Automatic session locking function');
    console.log('   2. Run at midnight to lock previous day sessions');
  }
}

main().catch(console.error);
