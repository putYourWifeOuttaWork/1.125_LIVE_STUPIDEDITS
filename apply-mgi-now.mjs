import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.VITE_SUPABASE_URL.replace('https://', 'postgresql://postgres:') + 
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '@db.';

console.log('📦 Applying MGI Automation Migration...\n');

const sql = readFileSync('supabase/migrations/20251121000001_device_image_automation.sql', 'utf8');

// Use node-postgres client
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.jycxolmevsvrxmeinxff:Zc0tsf6IY7Jl9z9Z@aws-0-us-west-1.pooler.supabase.com:6543/postgres'
});

try {
  await client.connect();
  console.log('✅ Connected to database');
  
  await client.query(sql);
  console.log('✅ Migration applied successfully!\n');
  
  // Verify
  const result = await client.query(`
    SELECT trigger_name 
    FROM information_schema.triggers 
    WHERE trigger_name = 'trigger_calculate_and_rollup_mgi'
  `);
  
  if (result.rows.length > 0) {
    console.log('✅ Trigger verified:', result.rows[0].trigger_name);
  }
  
  await client.end();
  console.log('\n🎯 Next step: node seed-iot-test-site-2.mjs\n');
} catch (error) {
  console.error('❌ Error:', error.message);
  await client.end();
  process.exit(1);
}
