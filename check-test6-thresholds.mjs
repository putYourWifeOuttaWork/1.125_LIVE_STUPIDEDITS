import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkThresholds() {
  console.log('Searching for test6 device...\n');

  // Search for test6 device
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, company_id')
    .ilike('device_name', '%test6%')
    .limit(5);

  if (!devices || devices.length === 0) {
    console.log('❌ No devices found with "test6" in name');
    
    // Try by MAC address
    const { data: byMac } = await supabase
      .from('devices')
      .select('device_id, device_code, device_name, company_id')
      .eq('device_code', 'ZZ:C7:B4:99:99:99')
      .single();
    
    if (byMac) {
      console.log('✅ Found by MAC:', byMac);
      await checkDeviceThresholds(byMac);
    }
    return;
  }

  console.log(`Found ${devices.length} device(s):`);
  devices.forEach((d, i) => {
    console.log(`${i + 1}. ${d.device_name} (${d.device_code})`);
  });
  console.log('');

  // Check the first one
  await checkDeviceThresholds(devices[0]);
}

async function checkDeviceThresholds(device) {
  console.log('✅ Device Details:');
  console.log(`   Name: ${device.device_name}`);
  console.log(`   Code: ${device.device_code}`);
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
    console.log(`   ✅ EXISTS (ID: ${companyThresholds.threshold_config_id})`);
    console.log(`   Temperature: ${companyThresholds.temp_min_warning}°F - ${companyThresholds.temp_max_warning}°F (warning)`);
    console.log(`              ${companyThresholds.temp_min_critical}°F - ${companyThresholds.temp_max_critical}°F (critical)`);
    console.log(`   Humidity:    ${companyThresholds.rh_min_warning}% - ${companyThresholds.rh_max_warning}% (warning)`);
    console.log(`              ${companyThresholds.rh_min_critical}% - ${companyThresholds.rh_max_critical}% (critical)`);
    console.log(`   Last Updated: ${new Date(companyThresholds.updated_at).toLocaleString()}\n`);
  } else {
    console.log('   ❌ No company defaults configured\n');
  }

  // Get device-specific override
  const { data: deviceThresholds } = await supabase
    .from('device_alert_thresholds')
    .select('*')
    .eq('device_id', device.device_id)
    .maybeSingle();

  console.log('🔧 Device-Specific Override:');
  if (deviceThresholds) {
    console.log(`   ✅ OVERRIDE ACTIVE (ID: ${deviceThresholds.threshold_config_id})`);
    console.log(`   Temperature: ${deviceThresholds.temp_min_warning}°F - ${deviceThresholds.temp_max_warning}°F (warning)`);
    console.log(`              ${deviceThresholds.temp_min_critical}°F - ${deviceThresholds.temp_max_critical}°F (critical)`);
    console.log(`   Humidity:    ${deviceThresholds.rh_min_warning}% - ${deviceThresholds.rh_max_warning}% (warning)`);
    console.log(`              ${deviceThresholds.rh_min_critical}% - ${deviceThresholds.rh_max_critical}% (critical)`);
    console.log(`   Last Updated: ${new Date(deviceThresholds.updated_at).toLocaleString()}\n`);

    // Show differences
    if (companyThresholds) {
      console.log('🔍 Differences from Company Defaults:');
      const fields = [
        { key: 'temp_min_warning', label: 'Temp Min Warning' },
        { key: 'temp_min_critical', label: 'Temp Min Critical' },
        { key: 'temp_max_warning', label: 'Temp Max Warning' },
        { key: 'temp_max_critical', label: 'Temp Max Critical' },
        { key: 'rh_min_warning', label: 'RH Min Warning' },
        { key: 'rh_min_critical', label: 'RH Min Critical' },
        { key: 'rh_max_warning', label: 'RH Max Warning' },
        { key: 'rh_max_critical', label: 'RH Max Critical' },
      ];
      
      let hasDiff = false;
      fields.forEach(({ key, label }) => {
        if (deviceThresholds[key] !== companyThresholds[key]) {
          console.log(`   🔸 ${label}: ${companyThresholds[key]} → ${deviceThresholds[key]}`);
          hasDiff = true;
        }
      });
      
      if (!hasDiff) {
        console.log('   ✅ No differences - all values match company defaults');
      }
    }
  } else {
    console.log('   ❌ No device override configured');
    console.log('   ℹ️  Device uses company defaults');
  }
}

checkThresholds();
