import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const connectionString = process.env.VITE_SUPABASE_DB_URL;

if (!connectionString) {
  console.error('❌ Missing VITE_SUPABASE_DB_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

console.log('🚀 Applying MGI Complete System Migration...\n');

try {
  await client.connect();
  
  const sql = readFileSync('/tmp/mgi_complete_system.sql', 'utf8');
  
  await client.query(sql);
  
  console.log('✅ Migration applied successfully!');
  console.log('\n📊 Changes applied:');
  console.log('  • Added wake_payload_id FK to device_images and device_telemetry');
  console.log('  • Added MGI scoring fields to device_images (mgi_score, mgi_velocity, mgi_speed)');
  console.log('  • Added latest MGI tracking to devices table');
  console.log('  • Added snapshot cadence configuration to sites table');
  console.log('  • Created site_snapshots table for timeline visualization');
  console.log('  • Created MGI scoring trigger (calls Roboflow edge function)');
  console.log('  • Created velocity calculation trigger (per-day comparison)');
  console.log('  • Created speed calculation trigger (average since program start)');
  console.log('  • Created device latest MGI update trigger');
  console.log('  • Created generate_site_snapshot() RPC function');
  console.log('  • Created generate_due_site_snapshots() RPC function');
  
  console.log('\n🔧 Next Steps:');
  console.log('  1. Deploy score_mgi_image edge function for Roboflow integration');
  console.log('  2. Update MQTT handler to populate wake_payload_id in device_images/telemetry');
  console.log('  3. Update MQTT handler to stop writing to petri_observations');
  console.log('  4. Configure pg_cron job for periodic snapshot generation');
  console.log('  5. Test MGI scoring with real device image');
  
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  console.error('Details:', err);
  process.exit(1);
} finally {
  await client.end();
}
