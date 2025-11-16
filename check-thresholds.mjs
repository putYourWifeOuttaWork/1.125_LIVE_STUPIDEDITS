import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkThresholds() {
  console.log('Checking Alert Thresholds for ZZ:C7:B4:99:99:99\n');

  // Get the device
  const { data: device } = await supabase
    .from('devices')
    .select('device_id, device_code, company_id')
    .eq('device_code', 'ZZ:C7:B4:99:99:99')
    .single();

  if (!device) {
    console.log('❌ Device not found');
    return;
  }

  console.log('✅ Device Found:');
  console.log(`   Device ID: ${device.device_id}`);
  console.log(`   Company ID: ${device.company_id}\n`);

  // Get company default thresholds
  const { data: companyThresholds } = await supabase
    .from('device_alert_thresholds')
    .select('*')
    .eq('company_id', device.company_id)
    .is('device_id', null)
    .maybeSingle();

  console.log('📋 Company Default Thresholds:');
  if (companyThresholds) {
    console.log(`   ID: ${companyThresholds.threshold_config_id}`);
    console.log(`   Temp Min Warning: ${companyThresholds.temp_min_warning}°F`);
    console.log(`   Temp Min Critical: ${companyThresholds.temp_min_critical}°F`);
    console.log(`   Temp Max Warning: ${companyThresholds.temp_max_warning}°F`);
    console.log(`   Temp Max Critical: ${companyThresholds.temp_max_critical}°F`);
    console.log(`   RH Min Warning: ${companyThresholds.rh_min_warning}%`);
    console.log(`   RH Min Critical: ${companyThresholds.rh_min_critical}%`);
    console.log(`   RH Max Warning: ${companyThresholds.rh_max_warning}%`);
    console.log(`   RH Max Critical: ${companyThresholds.rh_max_critical}%`);
    console.log(`   Updated: ${companyThresholds.updated_at}\n`);
  } else {
    console.log('   ❌ No company defaults found\n');
  }

  // Get device-specific override
  const { data: deviceThresholds } = await supabase
    .from('device_alert_thresholds')
    .select('*')
    .eq('device_id', device.device_id)
    .maybeSingle();

  console.log('🔧 Device-Specific Override:');
  if (deviceThresholds) {
    console.log(`   ✅ OVERRIDE EXISTS`);
    console.log(`   ID: ${deviceThresholds.threshold_config_id}`);
    console.log(`   Temp Min Warning: ${deviceThresholds.temp_min_warning}°F`);
    console.log(`   Temp Min Critical: ${deviceThresholds.temp_min_critical}°F`);
    console.log(`   Temp Max Warning: ${deviceThresholds.temp_max_warning}°F`);
    console.log(`   Temp Max Critical: ${deviceThresholds.temp_max_critical}°F`);
    console.log(`   RH Min Warning: ${deviceThresholds.rh_min_warning}%`);
    console.log(`   RH Min Critical: ${deviceThresholds.rh_min_critical}%`);
    console.log(`   RH Max Warning: ${deviceThresholds.rh_max_warning}%`);
    console.log(`   RH Max Critical: ${deviceThresholds.rh_max_critical}%`);
    console.log(`   Updated: ${deviceThresholds.updated_at}\n`);

    // Show differences
    if (companyThresholds) {
      console.log('🔍 Differences from Company Defaults:');
      const fields = [
        'temp_min_warning', 'temp_min_critical', 
        'temp_max_warning', 'temp_max_critical',
        'rh_min_warning', 'rh_min_critical',
        'rh_max_warning', 'rh_max_critical'
      ];
      
      let hasDiff = false;
      fields.forEach(field => {
        if (deviceThresholds[field] !== companyThresholds[field]) {
          console.log(`   🔸 ${field}: ${companyThresholds[field]} → ${deviceThresholds[field]}`);
          hasDiff = true;
        }
      });
      
      if (!hasDiff) {
        console.log('   ✅ No differences - values match company defaults');
      }
    }
  } else {
    console.log('   ❌ No device override - using company defaults');
  }
}

checkThresholds();
