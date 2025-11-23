#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('📋 Checking device_wake_payloads current state...\n');
  
  // Get sample record to see columns
  const { data, error } = await supabase
    .from('device_wake_payloads')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  if (data && data.length > 0) {
    console.log('Sample record columns:');
    console.log(Object.keys(data[0]));
    console.log('\nSample record:');
    console.log(JSON.stringify(data[0], null, 2));
  }
  
  // Count total
  const { count } = await supabase
    .from('device_wake_payloads')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 Total device_wake_payloads: ${count}`);
  
  // Check device_wake_sessions
  try {
    const { count: sessionsCount, error: sessError } = await supabase
      .from('device_wake_sessions')
      .select('*', { count: 'exact', head: true });
    
    if (sessError) {
      console.log('\n❌ device_wake_sessions error:', sessError.message);
    } else {
      console.log(`\n📊 device_wake_sessions rows: ${sessionsCount || 0}`);
    }
  } catch (err) {
    console.log('\n❌ device_wake_sessions table issue');
  }
}

checkSchema();
