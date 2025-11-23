#!/usr/bin/env node
import pg from 'pg';
import { config } from 'dotenv';
config();

const { Client } = pg;

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.VITE_DATABASE_URL
  });
  
  await client.connect();
  
  console.log('📋 Checking device_wake_payloads schema...\n');
  
  // Get column info
  const result = await client.query(`
    SELECT 
      column_name, 
      data_type, 
      is_nullable,
      column_default
    FROM information_schema.columns 
    WHERE table_name = 'device_wake_payloads'
    ORDER BY ordinal_position;
  `);
  
  console.log('Current columns:');
  console.table(result.rows);
  
  // Check row count
  const countResult = await client.query('SELECT COUNT(*) FROM device_wake_payloads');
  console.log(`\n📊 Total rows: ${countResult.rows[0].count}`);
  
  // Check device_wake_sessions
  console.log('\n📋 Checking device_wake_sessions table...\n');
  try {
    const sessionsCount = await client.query('SELECT COUNT(*) FROM device_wake_sessions');
    console.log(`📊 device_wake_sessions rows: ${sessionsCount.rows[0].count}`);
  } catch (err) {
    console.log('❌ device_wake_sessions table does not exist or is inaccessible');
  }
  
  await client.end();
}

checkSchema();
