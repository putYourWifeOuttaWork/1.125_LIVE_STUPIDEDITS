#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testNextWakeTimes() {
  try {
    console.log('🔍 Finding a device with a wake schedule...\n');

    // Get a device that has a wake schedule set
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('device_id, device_name, wake_schedule_cron, last_wake_at')
      .not('wake_schedule_cron', 'is', null)
      .limit(1);

    if (devicesError) throw devicesError;

    if (!devices || devices.length === 0) {
      console.log('⚠️  No devices found with wake schedules set.');
      console.log('Please configure a wake schedule on a device first.');
      return;
    }

    const device = devices[0];
    console.log(`📱 Testing with device: ${device.device_name || device.device_id}`);
    console.log(`   Cron: ${device.wake_schedule_cron}`);
    console.log(`   Last Wake: ${device.last_wake_at || 'Never'}\n`);

    console.log('🧪 Calling get_next_wake_times function...\n');

    const { data, error } = await supabase
      .rpc('get_next_wake_times', {
        p_device_id: device.device_id,
        p_count: 5
      });

    if (error) {
      console.error('❌ Error calling function:', error);
      return;
    }

    console.log('✅ Function executed successfully!\n');
    console.log('📅 Next Wake Times:');
    console.log('─────────────────────────────────────────────────────');

    if (data.error) {
      console.log(`⚠️  ${data.error}`);
    } else {
      const wakeTimes = data.wake_times || [];
      wakeTimes.forEach((time, index) => {
        const date = new Date(time);
        console.log(`${index + 1}. ${date.toLocaleString('en-US', {
          timeZone: data.timezone,
          dateStyle: 'medium',
          timeStyle: 'medium'
        })} (${data.timezone})`);
      });

      console.log('─────────────────────────────────────────────────────');
      console.log(`Timezone: ${data.timezone}`);
      console.log(`Cron Expression: ${data.cron_expression}`);
    }

    console.log('\n✨ Test complete!');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
  }
}

testNextWakeTimes();
