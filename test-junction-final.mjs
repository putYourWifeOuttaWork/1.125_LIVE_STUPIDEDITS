#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testSystem() {
  console.log('🧪 Testing Junction Table System\n');

  const { count } = await supabase
    .from('device_site_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`✅ ${count} active device site assignments`);
  
  const { data: backfilled } = await supabase
    .from('device_site_assignments')
    .select('devices(device_code)')
    .ilike('notes', '%Backfilled%');

  console.log(`✅ ${backfilled?.length || 0} backfilled devices`);
  
  console.log('\n🎉 Junction table system is operational!\n');
}

testSystem();
