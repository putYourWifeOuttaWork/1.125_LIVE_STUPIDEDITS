import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findBadEnum() {
  console.log('🔍 Searching for trigger on devices table...\n');

  // Check what triggers exist on devices
  const { data, error } = await supabase
    .from('pg_trigger')
    .select('*')
    .limit(5);

  console.log('Result:', { data, error });

  // Try alternate approach - get the function source
  console.log('\n📝 Getting function definitions...\n');
  
  const functions = [
    'log_device_assignment_change',
    'trg_devices_audit',
    'trg_log_device_change',
    'audit_device_changes'
  ];

  for (const fname of functions) {
    const { data: funcData, error: funcError } = await supabase.rpc('pg_get_functiondef', {
      func_oid: `public.${fname}`
    }).catch(() => ({ data: null, error: 'Not found' }));

    console.log(`${fname}:`, funcError || 'exists');
  }
}

findBadEnum().catch(console.error);
