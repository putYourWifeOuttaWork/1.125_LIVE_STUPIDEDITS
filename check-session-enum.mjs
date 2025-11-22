#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking session status values...\n');

// Check submission_sessions statuses
const { data: submissionStatuses } = await supabase
  .from('submission_sessions')
  .select('session_status')
  .limit(100);

console.log('📋 Submission session statuses found:');
const uniqueStatuses = [...new Set(submissionStatuses?.map(s => s.session_status) || [])];
uniqueStatuses.forEach(status => console.log(`  - "${status}"`));

console.log('\n🔍 Checking site_device_sessions...');
const { data: deviceStatuses } = await supabase
  .from('site_device_sessions')
  .select('status')
  .limit(100);

console.log('📋 Device session statuses found:');
const uniqueDeviceStatuses = [...new Set(deviceStatuses?.map(s => s.status) || [])];
uniqueDeviceStatuses.forEach(status => console.log(`  - "${status}"`));
