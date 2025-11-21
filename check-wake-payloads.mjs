#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('🔍 Checking device_wake_payloads population...\n');
  
  const { data: payloads, count, error } = await supabase
    .from('device_wake_payloads')
    .select('*', { count: 'exact' })
    .limit(10)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }
  
  console.log(`Total device_wake_payloads: ${count || 0}\n`);
  
  if (count === 0) {
    console.log('⚠️  NO DATA in device_wake_payloads!');
    console.log('   The MQTT handler is NOT populating this table.');
    console.log('   This is why snapshots show static data!\n');
  } else {
    console.log('✅ device_wake_payloads has data! Sample:');
    payloads?.forEach(p => {
      console.log(`   - Device: ${p.device_id?.substring(0, 8)}...`);
      console.log(`     Wake: ${p.wake_window_index || 'N/A'}`);
      console.log(`     Temp: ${p.temperature}°F, RH: ${p.humidity}%`);
      console.log(`     Image: ${p.image_id ? '✅' : '❌'}`);
      console.log(`     Captured: ${p.captured_at}`);
      console.log('');
    });
  }
}

check().then(() => process.exit(0));
