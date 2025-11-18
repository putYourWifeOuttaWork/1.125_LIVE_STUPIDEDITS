import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🔍 AUDITING DEVICE-PROGRAM ASSIGNMENTS\n');

const { data: devices, error } = await supabase
  .from('devices')
  .select('device_id, device_name, device_code, site_id, program_id, company_id');

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log('Found ' + devices.length + ' total devices\n');

const issues = [];

for (const device of devices) {
  if (!device.site_id) {
    console.log('⚠️  ' + device.device_name + ' has no site_id - skipping');
    continue;
  }

  const { data: site } = await supabase
    .from('sites')
    .select('site_id, name, program_id, company_id')
    .eq('site_id', device.site_id)
    .single();

  if (!site) continue;

  const problems = [];

  if (!device.program_id) {
    problems.push('Missing program_id');
  } else if (device.program_id !== site.program_id) {
    problems.push('program_id mismatch');
  }

  if (!device.company_id) {
    problems.push('Missing company_id');
  } else if (device.company_id !== site.company_id) {
    problems.push('company_id mismatch');
  }

  if (problems.length > 0) {
    issues.push({
      device_id: device.device_id,
      device_name: device.device_name,
      device_code: device.device_code,
      site_name: site.name,
      problems: problems,
      correct_program_id: site.program_id,
      correct_company_id: site.company_id
    });
  }
}

if (issues.length === 0) {
  console.log('✅ All devices correctly inherit IDs from their sites!\n');
} else {
  console.log('Found ' + issues.length + ' devices with issues:\n');
  
  issues.forEach((issue, index) => {
    console.log((index + 1) + '. ' + issue.device_name + ' (' + issue.device_code + ')');
    console.log('   Site: ' + issue.site_name);
    issue.problems.forEach(p => console.log('   ❌ ' + p));
    console.log('');
  });

  console.log('🔧 FIXING ISSUES...\n');

  for (const issue of issues) {
    const result = await supabase
      .from('devices')
      .update({
        program_id: issue.correct_program_id,
        company_id: issue.correct_company_id
      })
      .eq('device_id', issue.device_id);

    if (result.error) {
      console.log('   ❌ Failed: ' + issue.device_code);
    } else {
      console.log('   ✅ Fixed: ' + issue.device_code);
    }
  }

  console.log('\n✅ All devices updated!\n');
}
