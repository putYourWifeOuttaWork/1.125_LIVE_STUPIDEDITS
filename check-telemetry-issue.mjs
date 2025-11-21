import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const telemetryId = '27d5db36-21a4-44e6-8429-8ce726e74a82';
  
  console.log('Checking telemetry record:', telemetryId);
  
  const { data: telemetry, error } = await supabase
    .from('device_telemetry')
    .select('*')
    .eq('telemetry_id', telemetryId)
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('\nTelemetry Record:');
  console.log('  Device ID:', telemetry.device_id);
  console.log('  Company ID:', telemetry.company_id);
  console.log('  Program ID:', telemetry.program_id, telemetry.program_id ? '✅' : '❌ NULL');
  console.log('  Site ID:', telemetry.site_id, telemetry.site_id ? '✅' : '❌ NULL');
  console.log('  Session ID:', telemetry.site_device_session_id, telemetry.site_device_session_id ? '✅' : '❌ NULL');
  console.log('  Temperature:', telemetry.temperature);
  console.log('  Humidity:', telemetry.humidity);
  console.log('  Created:', telemetry.created_at);
  
  // Get device info
  const { data: device } = await supabase
    .from('devices')
    .select('device_id, site_id, program_id, company_id')
    .eq('device_id', telemetry.device_id)
    .single();
  
  console.log('\nDevice Record (what it SHOULD have):');
  console.log('  Site ID:', device.site_id);
  console.log('  Program ID:', device.program_id);
  console.log('  Company ID:', device.company_id);
  
  console.log('\n🔍 Analysis:');
  console.log('  Telemetry was created BEFORE the fix was applied');
  console.log('  Edge function needs to be redeployed with updated code');
  console.log('  Database migrations need to be applied');
}

check();
