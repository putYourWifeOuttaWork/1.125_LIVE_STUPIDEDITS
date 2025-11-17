#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 Checking BOTH Session Tables\n');
console.log('=' .repeat(60));

async function main() {
  // 1. Check NEW device sessions table
  console.log('\n1️⃣  NEW TABLE: site_device_sessions (for devices)');
  console.log('-'.repeat(60));

  const { data: deviceSessions, error: deviceError } = await supabase
    .from('site_device_sessions')
    .select('*')
    .order('session_date', { ascending: false })
    .limit(10);

  if (deviceError) {
    console.error('❌ Error:', deviceError.message);
  } else {
    console.log(`Total: ${deviceSessions.length} sessions`);
    if (deviceSessions.length > 0) {
      deviceSessions.forEach(s => {
        console.log(`  ${s.session_date} | Status: ${s.status}`);
      });
    } else {
      console.log('  ℹ️  No device sessions found (this is the new table for IoT devices)');
    }
  }

  // 2. Check OLD submission sessions table
  console.log('\n2️⃣  OLD TABLE: submission_sessions (for human submissions)');
  console.log('-'.repeat(60));

  const { data: submissionSessions, error: submissionError } = await supabase
    .from('submission_sessions')
    .select(`
      session_id,
      session_date,
      session_status,
      site_id,
      sites(name)
    `)
    .order('session_date', { ascending: false })
    .limit(20);

  if (submissionError) {
    console.error('❌ Error:', submissionError.message);
  } else {
    console.log(`Total: ${submissionSessions.length} sessions`);

    // Group by status
    const byStatus = {};
    submissionSessions.forEach(s => {
      const status = s.session_status || 'null';
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(s);
    });

    console.log('\n  📊 By Status:');
    Object.keys(byStatus).forEach(status => {
      console.log(`     ${status}: ${byStatus[status].length}`);
    });

    console.log('\n  📅 Recent Sessions:');
    submissionSessions.slice(0, 10).forEach(s => {
      console.log(`     ${s.session_date} | ${s.sites?.name || 'Unknown'} | Status: ${s.session_status}`);
    });

    // Check for Nov 13
    const nov13 = submissionSessions.filter(s => s.session_date === '2025-11-13');
    if (nov13.length > 0) {
      console.log('\n  🗓️  Nov 13 Sessions:');
      nov13.forEach(s => {
        console.log(`     ${s.sites?.name || 'Unknown'} | Status: ${s.session_status}`);
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('💡 INSIGHT:');
  console.log('   - site_device_sessions = NEW (for IoT devices, just created)');
  console.log('   - submission_sessions = OLD (for human field workers)');
  console.log('   - You likely see old "Active" sessions in the UI from submission_sessions');
  console.log('   - These are different systems that need to be unified in the UI');
}

main().catch(console.error);
