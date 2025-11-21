import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function checkSnapshotAutomation() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('Checking snapshot automation setup...\n');

    const cronResult = await client.query(`
      SELECT jobid, jobname, schedule, command, active
      FROM cron.job
      WHERE command LIKE '%snapshot%'
      ORDER BY jobid;
    `);

    console.log('Cron Jobs for Snapshots:');
    if (cronResult.rows.length === 0) {
      console.log('   NO cron jobs found\n');
    } else {
      cronResult.rows.forEach(job => {
        console.log(`   Job ${job.jobid}: ${job.jobname} (active: ${job.active})`);
      });
    }

    const triggerResult = await client.query(`
      SELECT t.tgname, c.relname, p.proname
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE p.proname LIKE '%snapshot%' OR t.tgname LIKE '%snapshot%';
    `);

    console.log('\nTriggers for snapshots:');
    if (triggerResult.rows.length === 0) {
      console.log('   NO triggers found\n');
    } else {
      triggerResult.rows.forEach(t => {
        console.log(`   ${t.tgname} on ${t.relname}`);
      });
    }

    const snapshotResult = await client.query(`
      SELECT COUNT(*) as count FROM session_wake_snapshots;
    `);

    console.log(`\nTotal snapshots in DB: ${snapshotResult.rows[0].count}\n`);

    if (cronResult.rows.length === 0 && triggerResult.rows.length === 0) {
      console.log('RESULT: NO AUTOMATION CONFIGURED');
      console.log('Snapshots must be called manually or from MQTT handler\n');
    } else {
      console.log('RESULT: Automation is configured\n');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkSnapshotAutomation();
