#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillDeviceLineage() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Device Lineage Backfill Script');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('🔍 Scanning for devices with incomplete lineage...\n');

  // Step 1: Find devices needing backfill
  const { data: incompleteDevices, error: findError } = await supabase
    .rpc('fn_find_devices_with_incomplete_lineage');

  if (findError) {
    console.error('❌ Error finding incomplete devices:', findError);

    // Fallback: manual query
    console.log('⚠️  Falling back to manual query...\n');

    const { data: devicesData, error: queryError } = await supabase
      .from('devices')
      .select(`
        device_id,
        device_mac,
        device_name,
        provisioning_status,
        site_id,
        program_id,
        company_id,
        device_site_assignments!inner(site_id, program_id, is_active)
      `)
      .eq('device_site_assignments.is_active', true)
      .or('site_id.is.null,program_id.is.null,company_id.is.null');

    if (queryError) {
      console.error('❌ Manual query also failed:', queryError);
      process.exit(1);
    }

    console.log(`📋 Found ${devicesData?.length || 0} devices via manual query\n`);

    if (!devicesData || devicesData.length === 0) {
      console.log('✅ All devices have complete lineage! No backfill needed.\n');
      return;
    }

    // Process manual query results
    await processDevices(devicesData.map(d => ({
      device_id: d.device_id,
      device_mac: d.device_mac,
      device_name: d.device_name,
      provisioning_status: d.provisioning_status,
      site_id_in_assignment: d.device_site_assignments[0]?.site_id,
      program_id_in_assignment: d.device_site_assignments[0]?.program_id,
      issue_description: 'Has assignment but missing device fields'
    })));
    return;
  }

  if (!incompleteDevices || incompleteDevices.length === 0) {
    console.log('✅ All devices have complete lineage! No backfill needed.\n');
    return;
  }

  console.log(`📋 Found ${incompleteDevices.length} devices needing backfill:\n`);

  // Group by issue type
  const issueGroups = {};
  for (const device of incompleteDevices) {
    const issue = device.issue_description;
    if (!issueGroups[issue]) {
      issueGroups[issue] = [];
    }
    issueGroups[issue].push(device);
  }

  for (const [issue, devices] of Object.entries(issueGroups)) {
    console.log(`   📌 ${issue}: ${devices.length} device(s)`);
  }

  console.log('\n' + '─'.repeat(55) + '\n');

  await processDevices(incompleteDevices);
}

async function processDevices(devices) {
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];

    console.log(`[${i + 1}/${devices.length}] Processing: ${device.device_name || device.device_mac}`);
    console.log(`   Status: ${device.provisioning_status}`);
    console.log(`   Issue: ${device.issue_description}`);

    // Get site and program from assignment
    const siteId = device.site_id_in_assignment || device.site_id;
    const programId = device.program_id_in_assignment || device.program_id;

    if (!siteId || !programId) {
      console.log(`   ⏭️  Skipped: Missing site or program assignment\n`);
      skippedCount++;
      continue;
    }

    // Call initialization function
    const { data: result, error } = await supabase
      .rpc('fn_initialize_device_after_mapping', {
        p_device_id: device.device_id,
        p_site_id: siteId,
        p_program_id: programId
      });

    if (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
      errorCount++;
      continue;
    }

    if (!result || !result.success) {
      console.log(`   ❌ Failed: ${result?.message || 'Unknown error'}\n`);
      errorCount++;
      continue;
    }

    console.log(`   ✅ Success!`);
    console.log(`      - Site: ${result.site_name}`);
    console.log(`      - Program: ${result.program_name}`);
    console.log(`      - Company ID: ${result.company_id}`);
    console.log(`      - Next Wake: ${result.next_wake_at}`);
    console.log(`      - Status: active\n`);
    successCount++;
  }

  console.log('═'.repeat(55));
  console.log('\n📊 Backfill Summary:\n');
  console.log(`   ✅ Successfully fixed: ${successCount} device(s)`);
  console.log(`   ❌ Errors: ${errorCount} device(s)`);
  console.log(`   ⏭️  Skipped: ${skippedCount} device(s)`);
  console.log(`   📋 Total processed: ${devices.length} device(s)\n`);

  if (successCount > 0) {
    console.log('✨ Backfill completed successfully!');
    console.log('   All fixed devices now have complete lineage and active status.\n');
  }

  if (errorCount > 0) {
    console.log('⚠️  Some devices failed to update. Please review errors above.');
    console.log('   You may need to fix site/program assignments manually.\n');
  }

  // Verify by checking incomplete count again
  console.log('🔍 Re-scanning for remaining issues...\n');

  const { data: remainingDevices, error: recheckError } = await supabase
    .rpc('fn_find_devices_with_incomplete_lineage');

  if (!recheckError && remainingDevices) {
    if (remainingDevices.length === 0) {
      console.log('✅ Perfect! No remaining devices with incomplete lineage.\n');
    } else {
      console.log(`⚠️  ${remainingDevices.length} device(s) still need attention:`);
      for (const device of remainingDevices) {
        console.log(`   - ${device.device_name || device.device_mac}: ${device.issue_description}`);
      }
      console.log('');
    }
  }
}

// Run backfill
backfillDeviceLineage().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
