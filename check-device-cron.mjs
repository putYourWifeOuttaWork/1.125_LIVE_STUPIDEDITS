#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

const deviceId = '2b8a8468-1c92-4553-a044-edb60b0ba7c5';

console.log(`🔍 Checking device ${deviceId} cron schedule...\n`);

try {
  const { data: device, error } = await supabase
    .from('devices')
    .select('device_id, device_name, wake_schedule_cron, next_wake_at, last_wake_at')
    .eq('device_id', deviceId)
    .single();

  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log('Device Data:');
    console.log(`  Name: ${device.device_name}`);
    console.log(`  Cron: ${device.wake_schedule_cron}`);
    console.log(`  Next Wake: ${device.next_wake_at}`);
    console.log(`  Last Wake: ${device.last_wake_at}`);
  }
} catch (err) {
  console.log('❌ Exception:', err.message);
}
