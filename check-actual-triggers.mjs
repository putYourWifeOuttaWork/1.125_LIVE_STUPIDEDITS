import pg from 'pg';
import { config } from 'dotenv';
config();

const { Client } = pg;

async function checkTriggers() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || `postgresql://postgres:${process.env.DB_PASSWORD}@db.jycxolmevsvrxmeinxff.supabase.co:5432/postgres`
  });

  try {
    await client.connect();
    console.log('🔍 Checking actual triggers on device_site_assignments...\n');

    const query = `
      SELECT 
        tgname as trigger_name,
        tgtype,
        tgenabled,
        pg_get_triggerdef(oid) as trigger_def
      FROM pg_trigger
      WHERE tgrelid = 'device_site_assignments'::regclass
        AND tgisinternal = false
      ORDER BY tgname;
    `;

    const { rows } = await client.query(query);

    if (rows.length === 0) {
      console.log('✅ No triggers found on device_site_assignments');
    } else {
      console.log(`Found ${rows.length} trigger(s):\n`);
      rows.forEach((row, i) => {
        console.log(`${i + 1}. Trigger: ${row.trigger_name}`);
        console.log(`   Enabled: ${row.tgenabled}`);
        console.log(`   Definition: ${row.trigger_def.substring(0, 150)}...`);
        console.log('');
      });
    }

    // Also check device_program_assignments
    console.log('\n🔍 Checking triggers on device_program_assignments...\n');
    const query2 = `
      SELECT tgname as trigger_name
      FROM pg_trigger
      WHERE tgrelid = 'device_program_assignments'::regclass
        AND tgisinternal = false;
    `;

    const { rows: rows2 } = await client.query(query2);
    if (rows2.length === 0) {
      console.log('✅ No triggers found on device_program_assignments');
    } else {
      console.log(`Found ${rows2.length} trigger(s):`);
      rows2.forEach(row => console.log(`   - ${row.trigger_name}`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTriggers();
