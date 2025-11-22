#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking submission_sessions columns...\n');

const { data, error } = await supabase
  .from('submission_sessions')
  .select('*')
  .limit(1);

if (data && data[0]) {
  console.log('📋 submission_sessions columns:');
  Object.keys(data[0]).forEach(col => console.log(`  - ${col}`));
}

console.log('\n🔍 Checking site_device_sessions columns...\n');

const { data: deviceData, error: deviceError } = await supabase
  .from('site_device_sessions')
  .select('*')
  .limit(1);

if (deviceData && deviceData[0]) {
  console.log('📋 site_device_sessions columns:');
  Object.keys(deviceData[0]).forEach(col => console.log(`  - ${col}`));
}
