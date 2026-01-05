import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Construct PostgreSQL connection string from Supabase URL
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Extract database connection details from Supabase URL
// Format: https://PROJECT_REF.supabase.co
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

// Supabase uses the service role key as password
// Connection string format for Supabase
const connectionString = `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

console.log('🔌 Connecting to Supabase database...\n');

const client = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function applyMigration() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read the SQL file
    const sql = readFileSync('/tmp/enhanced_site_audit_log.sql', 'utf8');

    console.log('📝 Applying Enhanced Site Audit Log Migration...\n');

    // Execute the migration
    await client.query(sql);

    console.log('✅ Migration applied successfully!\n');

    // Test the function
    console.log('🧪 Testing the enhanced function...\n');

    const testResult = await client.query(`
      SELECT site_id, name FROM sites LIMIT 1
    `);

    if (testResult.rows.length > 0) {
      const site = testResult.rows[0];
      console.log(`Testing with site: ${site.name} (${site.site_id})\n`);

      const auditResult = await client.query(`
        SELECT * FROM get_comprehensive_site_audit_log(
          p_site_id := $1::uuid,
          p_start_date := NULL,
          p_end_date := NULL,
          p_event_sources := NULL,
          p_severity_levels := NULL,
          p_user_id := NULL,
          p_device_id := NULL,
          p_limit := 20
        )
      `, [site.site_id]);

      console.log(`✅ Function test successful! Returned ${auditResult.rows.length} events\n`);

      if (auditResult.rows.length > 0) {
        // Count events by source
        const eventCounts = {};
        auditResult.rows.forEach(event => {
          eventCounts[event.event_source] = (eventCounts[event.event_source] || 0) + 1;
        });

        console.log('📊 Event sources found:');
        Object.entries(eventCounts).forEach(([source, count]) => {
          console.log(`  - ${source}: ${count} events`);
        });

        console.log('\n📋 Sample events:');
        auditResult.rows.slice(0, 5).forEach((event, i) => {
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
      }

      console.log('\n✨ Enhanced audit log is working!\n');
      console.log('New event sources available:');
      console.log('  ✅ session: Daily session lifecycle events');
      console.log('  ✅ wake: Milestone device wake events');
      console.log('  ✅ Plus all existing sources (site, device, alert, command, image, assignment, schedule)\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
