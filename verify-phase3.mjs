import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.VITE_SUPABASE_URL.replace('https://', 'postgresql://postgres:')
  .replace('.supabase.co', '.supabase.co:5432/postgres');

const client = new pg.Client({
  connectionString: dbUrl,
  password: process.env.SUPABASE_DB_PASSWORD || 'your-password-here'
});

console.log('Verifying Phase 3 Triggers...\n');

try {
  await client.connect();
  
  // Check triggers exist
  console.log('1. Checking triggers...');
  const triggers = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table
    FROM information_schema.triggers
    WHERE trigger_name LIKE 'trg_increment%'
    ORDER BY trigger_name;
  `);
  
  triggers.rows.forEach(t => {
    console.log(`   ✅ ${t.trigger_name} on ${t.event_object_table} (${t.event_manipulation})`);
  });
  
  // Check functions exist
  console.log('\n2. Checking functions...');
  const functions = await client.query(`
    SELECT proname 
    FROM pg_proc 
    WHERE proname LIKE '%device%count%' OR proname LIKE 'recalculate%'
    ORDER BY proname;
  `);
  
  functions.rows.forEach(f => {
    console.log(`   ✅ ${f.proname}()`);
  });
  
  // Check device counters (sample)
  console.log('\n3. Checking device counters (sample devices)...');
  const devices = await client.query(`
    SELECT 
      device_code,
      total_wakes,
      total_images_taken,
      total_alerts,
      total_images_expected_to_date,
      last_wake_at
    FROM devices
    WHERE total_wakes > 0 OR total_images_taken > 0
    ORDER BY total_wakes DESC
    LIMIT 5;
  `);
  
  if (devices.rows.length === 0) {
    console.log('   ℹ️  No devices with activity yet');
  } else {
    devices.rows.forEach(d => {
      console.log(`   ✅ ${d.device_code}: ${d.total_wakes} wakes, ${d.total_images_taken} images, ${d.total_alerts} alerts`);
    });
  }
  
  // Check pg_cron job
  console.log('\n4. Checking scheduled job...');
  try {
    const jobs = await client.query(`
      SELECT jobname, schedule, command
      FROM cron.job
      WHERE jobname = 'recalculate-expected-images';
    `);
    
    if (jobs.rows.length > 0) {
      console.log(`   ✅ Job scheduled: ${jobs.rows[0].schedule}`);
    } else {
      console.log('   ⚠️  pg_cron job not found (may need manual setup)');
    }
  } catch (err) {
    console.log('   ℹ️  pg_cron not available (expected on some Supabase plans)');
  }
  
  console.log('\n✅ Phase 3 verification complete!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await client.end();
}
