import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JAN4_SESSION_ID = '4889eee2-6836-4f52-bbe4-9391e0930f88';
const DEC25_SESSION_ID = 'b730e2c1-ed91-4e94-876f-25fec46ace65';

console.log('========================================');
console.log('JAN 4TH SESSION DATA DIAGNOSIS');
console.log('========================================\n');

// Step 1: Get session details
console.log('1. SESSION DETAILS:\n');

const { data: jan4Session, error: jan4Error } = await supabase
  .from('site_device_sessions')
  .select('session_id, site_id, program_id, status, created_at, locked_at, sites!inner(name)')
  .eq('session_id', JAN4_SESSION_ID)
  .single();

if (jan4Error) {
  console.log('❌ Error fetching Jan 4th session:', jan4Error.message);
} else {
  console.log('✅ Jan 4th Session Found:');
  console.log(`   Site: ${jan4Session.sites.name}`);
  console.log(`   Site ID: ${jan4Session.site_id}`);
  console.log(`   Program ID: ${jan4Session.program_id}`);
  console.log(`   Status: ${jan4Session.status}`);
  console.log(`   Created: ${jan4Session.created_at}`);
  console.log(`   Locked: ${jan4Session.locked_at || 'N/A'}`);
}

// Step 2: Check if snapshots exist for Jan 4th session
console.log('\n2. JAN 4TH SESSION SNAPSHOTS:\n');

const { data: jan4Snapshots, count: jan4Count } = await supabase
  .from('session_wake_snapshots')
  .select('wake_number, wake_round_start, created_at', { count: 'exact' })
  .eq('session_id', JAN4_SESSION_ID)
  .order('wake_number', { ascending: true });

if (jan4Count === 0) {
  console.log('❌ NO SNAPSHOTS FOUND for Jan 4th session!');
  console.log('   This is the root cause - snapshots were never created.');
} else {
  console.log(`✅ Found ${jan4Count} snapshots for Jan 4th session`);
  if (jan4Snapshots && jan4Snapshots.length > 0) {
    console.log(`   First wake: #${jan4Snapshots[0].wake_number} at ${jan4Snapshots[0].wake_round_start}`);
    console.log(`   Last wake: #${jan4Snapshots[jan4Snapshots.length - 1].wake_number} at ${jan4Snapshots[jan4Snapshots.length - 1].wake_round_start}`);
  }
}

// Step 3: Check total snapshots for the site
let first1000 = null;
if (jan4Session) {
  console.log('\n3. SITE-WIDE SNAPSHOT COUNT:\n');

  const { count: totalSiteSnapshots } = await supabase
    .from('session_wake_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', jan4Session.site_id)
    .eq('program_id', jan4Session.program_id);

  console.log(`   Total snapshots for site: ${totalSiteSnapshots}`);

  if (totalSiteSnapshots > 1000) {
    console.log('   ⚠️  EXCEEDS 1000 LIMIT - This is problematic!');
  }

  // Step 4: Check chronological position
  console.log('\n4. CHRONOLOGICAL POSITION ANALYSIS:\n');

  const { data: first1000Data } = await supabase
    .from('session_wake_snapshots')
    .select('session_id, wake_round_start')
    .eq('site_id', jan4Session.site_id)
    .eq('program_id', jan4Session.program_id)
    .order('wake_round_start', { ascending: true })
    .limit(1000);

  first1000 = first1000Data;

  if (first1000) {
    const jan4InFirst1000 = first1000.filter(s => s.session_id === JAN4_SESSION_ID);
    const dec25InFirst1000 = first1000.filter(s => s.session_id === DEC25_SESSION_ID);

    console.log('   Snapshots in first 1000 (what useSiteSnapshots fetches):');
    console.log(`     Jan 4th: ${jan4InFirst1000.length} snapshots`);
    console.log(`     Dec 25th: ${dec25InFirst1000.length} snapshots`);

    if (jan4InFirst1000.length === 0 && jan4Count > 0) {
      console.log('\n   ❌ ROOT CAUSE CONFIRMED:');
      console.log('      Jan 4th snapshots exist but are NOT in the first 1000 chronological snapshots.');
      console.log('      The useSiteSnapshots hook only fetches the first 1000, so Jan 4th data is invisible.');
    } else if (jan4InFirst1000.length > 0) {
      console.log('\n   ✅ Jan 4th snapshots ARE in first 1000.');
      console.log('      Problem must be elsewhere (filtering logic, session_id mismatch, etc.)');
    }
  }

  // Step 5: Check date ranges
  console.log('\n5. DATE RANGE COMPARISON:\n');

  const { data: dateRange } = await supabase
    .from('session_wake_snapshots')
    .select('session_id, wake_round_start, sites!inner(name)')
    .eq('site_id', jan4Session.site_id)
    .eq('program_id', jan4Session.program_id)
    .order('wake_round_start', { ascending: true });

  if (dateRange && dateRange.length > 0) {
    const earliestDate = dateRange[0].wake_round_start;
    const latestDate = dateRange[dateRange.length - 1].wake_round_start;

    console.log('   Site snapshot date range:');
    console.log(`     Earliest: ${earliestDate}`);
    console.log(`     Latest: ${latestDate}`);

    if (jan4Snapshots && jan4Snapshots.length > 0) {
      const jan4Earliest = jan4Snapshots[0].wake_round_start;
      const jan4Latest = jan4Snapshots[jan4Snapshots.length - 1].wake_round_start;
      console.log('   Jan 4th snapshot date range:');
      console.log(`     Earliest: ${jan4Earliest}`);
      console.log(`     Latest: ${jan4Latest}`);
    }
  }
}

// Step 6: Compare with Dec 25th (working session)
console.log('\n6. COMPARISON WITH DEC 25TH (WORKING SESSION):\n');

const { data: dec25Snapshots, count: dec25Count } = await supabase
  .from('session_wake_snapshots')
  .select('wake_number, wake_round_start', { count: 'exact' })
  .eq('session_id', DEC25_SESSION_ID)
  .order('wake_number', { ascending: true });

console.log(`   Dec 25th snapshots: ${dec25Count}`);
if (dec25Snapshots && dec25Snapshots.length > 0) {
  console.log(`   First: ${dec25Snapshots[0].wake_round_start}`);
  console.log(`   Last: ${dec25Snapshots[dec25Snapshots.length - 1].wake_round_start}`);
}

// Step 7: Check session_id consistency
console.log('\n7. SESSION_ID CONSISTENCY CHECK:\n');

if (jan4Snapshots && jan4Snapshots.length > 0) {
  const { data: sampleSnapshot } = await supabase
    .from('session_wake_snapshots')
    .select('session_id, site_id, program_id')
    .eq('session_id', JAN4_SESSION_ID)
    .limit(1)
    .single();

  if (sampleSnapshot) {
    console.log(`   Snapshot session_id: ${sampleSnapshot.session_id}`);
    console.log(`   Expected session_id: ${JAN4_SESSION_ID}`);
    console.log(`   Match: ${sampleSnapshot.session_id === JAN4_SESSION_ID ? '✅' : '❌'}`);
  }
}

// Summary
console.log('\n========================================');
console.log('DIAGNOSIS SUMMARY');
console.log('========================================\n');

if (jan4Count === 0) {
  console.log('❌ PROBLEM: No snapshots exist for Jan 4th session');
  console.log('   SOLUTION: Investigate why snapshots are not being created.');
  console.log('   Check: create_session_wake_snapshot function, triggers, or manual creation.');
} else if (first1000) {
  const jan4InFirst1000 = first1000.filter(s => s.session_id === JAN4_SESSION_ID);
  if (jan4InFirst1000.length === 0) {
    console.log('❌ PROBLEM: Jan 4th snapshots exist but are beyond the 1000 row fetch limit');
    console.log('   CAUSE: useSiteSnapshots fetches site-wide (no session filter), limited to 1000 rows');
    console.log('   SOLUTION OPTIONS:');
    console.log('   1. Add .eq("session_id", sessionId) to the Supabase query in useSiteSnapshots');
    console.log('   2. Create a new useSessionSnapshots hook specifically for session detail pages');
    console.log('   3. Implement pagination or increase limit for session detail views');
  } else {
    console.log('⚠️  UNEXPECTED: Jan 4th snapshots are in first 1000 but still filtering to 0');
    console.log('   INVESTIGATE: Frontend filtering logic, session_id comparison, or data structure mismatch');
  }
}

console.log('\n========================================\n');
