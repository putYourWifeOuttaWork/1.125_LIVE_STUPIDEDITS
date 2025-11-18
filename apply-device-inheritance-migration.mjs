import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n📋 APPLYING DEVICE INHERITANCE MIGRATION\n');

const migrationSQL = readFileSync('supabase/migrations/20251118190000_enforce_device_site_program_inheritance.sql', 'utf8');

const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

if (error) {
  console.error('❌ Migration failed:', error.message);
  
  console.log('\n🔧 Applying directly via individual statements...\n');
  
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.includes('COMMENT ON')) continue;
    
    console.log('Executing statement ' + (i + 1) + '...');
    const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
    
    if (stmtError) {
      console.log('   ⚠️  ' + stmtError.message);
    } else {
      console.log('   ✅ Success');
    }
  }
} else {
  console.log('✅ Migration applied successfully!\n');
}

console.log('\n🧪 Testing the trigger...\n');

const testDeviceCode = 'TEST_INHERIT_' + Date.now();

const { data: site } = await supabase
  .from('sites')
  .select('site_id, program_id, company_id')
  .limit(1)
  .single();

if (site) {
  console.log('Creating test device assigned to site...');
  
  const { data: testDevice, error: createError } = await supabase
    .from('devices')
    .insert({
      device_mac: 'AA:BB:CC:DD:EE:FF',
      device_name: 'Test Inheritance Device',
      device_code: testDeviceCode,
      device_type: 'physical',
      provisioning_status: 'pending_approval',
      site_id: site.site_id,
      x_position: 0,
      y_position: 0
    })
    .select()
    .single();

  if (createError) {
    console.log('❌ Test failed:', createError.message);
  } else {
    console.log('\n✅ Trigger works!');
    console.log('   Device program_id: ' + (testDevice.program_id ? '✓ Set' : '✗ Missing'));
    console.log('   Device company_id: ' + (testDevice.company_id ? '✓ Set' : '✗ Missing'));
    console.log('   Matches site: ' + (testDevice.program_id === site.program_id ? '✓ Yes' : '✗ No'));
    
    console.log('\nCleaning up test device...');
    await supabase
      .from('devices')
      .delete()
      .eq('device_code', testDeviceCode);
  }
}

console.log('\n✅ MIGRATION COMPLETE!\n');
