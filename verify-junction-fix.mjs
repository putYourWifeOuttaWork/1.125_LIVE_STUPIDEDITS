#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('🔍 Verifying Junction Table Fix Migration\n');
  console.log('═'.repeat(80));

  try {
    // 1. Check all devices with site_id have junction records
    console.log('\n📊 Checking junction table coverage...');
    const { data: devices, error: devError } = await supabase
      .from('devices')
      .select('device_id, device_code, site_id')
      .not('site_id', 'is', null);

    if (devError) throw devError;

    console.log(`   Found ${devices.length} devices with site assignments`);

    let orphanCount = 0;
    for (const device of devices) {
      const { data: junction, error: jErr } = await supabase
        .from('device_site_assignments')
        .select('assignment_id')
        .eq('device_id', device.device_id)
        .eq('is_active', true)
        .maybeSingle();

      if (jErr) throw jErr;

      if (!junction) {
        orphanCount++;
        console.log(`   ⚠️  ${device.device_code} - Missing junction record`);
      }
    }

    if (orphanCount === 0) {
      console.log('   ✅ All devices have matching junction records!');
    } else {
      console.log(`   ❌ ${orphanCount} devices missing junction records`);
    }

    // 2. Check triggers exist
    console.log('\n📊 Checking triggers...');
    const { data: triggers, error: trigError } = await supabase
      .rpc('pg_get_triggerdef', {});

    // Can't easily check triggers via REST API, so just note it
    console.log('   ℹ️  Trigger verification requires manual check');
    console.log('   Run in SQL Editor: SELECT * FROM pg_trigger WHERE tgname LIKE \'trg_sync%\';');

    // 3. Check backfilled devices
    console.log('\n📊 Checking backfilled devices...');
    const { data: backfilled, error: backError } = await supabase
      .from('device_site_assignments')
      .select('devices(device_code), notes')
      .like('notes', '%Backfilled%');

    if (backError) {
      console.log('   ℹ️  Cannot query backfilled devices (RLS may be blocking)');
    } else if (backfilled && backfilled.length > 0) {
      console.log(`   ✅ Found ${backfilled.length} backfilled devices:`);
      backfilled.forEach((row) => {
        const code = row.devices?.device_code || 'Unknown';
        console.log(`      - ${code}`);
      });
    } else {
      console.log('   ℹ️  No backfilled devices found (or already existed)');
    }

    console.log('\n═'.repeat(80));
    if (orphanCount === 0) {
      console.log('\n🎉 Migration verified successfully!');
      console.log('   Junction tables are now the source of truth.\n');
    } else {
      console.log('\n⚠️  Migration incomplete - some devices still missing junctions\n');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verify();
