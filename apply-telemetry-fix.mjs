import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const sql = fs.readFileSync('/tmp/fix_telemetry_trigger.sql', 'utf8');

const client = new Client({ connectionString });

async function applyFix() {
  try {
    await client.connect();
    console.log('✅ Connected');
    
    await client.query(sql);
    console.log('✅ Fixed telemetry trigger function!');
    
    await client.end();
  } catch (error) {
    console.error('❌', error.message);
    process.exit(1);
  }
}

applyFix();
