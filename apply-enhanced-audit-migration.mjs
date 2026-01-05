import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function testEnhancedAuditLog() {
  console.log('🧪 Testing Enhanced Comprehensive Site Audit Log...\n');

  // Get a sample site_id from the database
  const { data: sites } = await supabase
    .from('sites')
    .select('site_id, name')
    .limit(1)
    .maybeSingle();

  if (!sites) {
    console.log('⚠️  No sites found in database');
    process.exit(0);
  }

  console.log(`Testing with site: ${sites.name} (${sites.site_id})\n`);

  const { data, error } = await supabase
    .rpc('get_comprehensive_site_audit_log', {
      p_site_id: sites.site_id,
      p_start_date: null,
      p_end_date: null,
      p_event_sources: null,
      p_severity_levels: null,
      p_user_id: null,
      p_device_id: null,
      p_limit: 20
    });

  if (error) {
    console.error('❌ Function test failed:', error.message);
    console.error('Error details:', error);
    console.log('\n⚠️  MIGRATION NEEDS TO BE APPLIED ⚠️');
    console.log('File location: /tmp/enhanced_site_audit_log.sql');
    console.log('\nPlease apply this migration using the Supabase Dashboard:');
    console.log('1. Open Supabase Dashboard > SQL Editor');
    console.log('2. Copy the contents of /tmp/enhanced_site_audit_log.sql');
    console.log('3. Paste and run in SQL Editor');
    console.log('\nOr use: cat /tmp/enhanced_site_audit_log.sql | pbcopy  (to copy to clipboard on Mac)');
    process.exit(1);
  }

  console.log(`✅ Function test successful! Returned ${data?.length || 0} events\n`);

  if (data && data.length > 0) {
    // Count events by source
    const eventCounts = {};
    data.forEach(event => {
      eventCounts[event.event_source] = (eventCounts[event.event_source] || 0) + 1;
    });

    console.log('📊 Event sources found:');
    Object.entries(eventCounts).forEach(([source, count]) => {
      console.log(`  - ${source}: ${count} events`);
    });

    console.log('\n📋 Sample events:');
    data.slice(0, 5).forEach((event, i) => {
      console.log(`\n  ${i + 1}. [${event.event_source}] ${event.description}`);
      console.log(`     Time: ${new Date(event.event_timestamp).toLocaleString()}`);
      console.log(`     Severity: ${event.severity}`);
      if (event.device_code) {
        console.log(`     Device: ${event.device_code}`);
      }
      if (event.session_id) {
        console.log(`     Session: ${event.session_id.substring(0, 8)}...`);
      }
    });

    console.log('\n✨ Enhanced audit log is working!\n');
    console.log('New event sources available:');
    console.log('  ✅ session: Daily session lifecycle events');
    console.log('  ✅ wake: Milestone device wake events');
    console.log('  ✅ Plus all existing sources (site, device, alert, command, image, assignment, schedule)\n');
  } else {
    console.log('ℹ️  No audit events found for this site yet.');
    console.log('This is normal if the site is new or has no activity.');
  }
}

testEnhancedAuditLog().catch(console.error);
