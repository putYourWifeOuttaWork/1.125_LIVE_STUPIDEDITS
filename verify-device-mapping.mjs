#!/usr/bin/env node

/**
 * Verification Script: Check device mapping and junction table records
 *
 * This script verifies that device mapping created all expected database records:
 * 1. Device record updated with site_id and program_id
 * 2. Junction table records in device_site_assignments
 * 3. Junction table records in device_program_assignments
 * 4. Assignment history tracking
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║   Device Mapping Verification Tool                            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function verifyDeviceMapping() {
  // Step 1: Find test device
  console.log('📱 Step 1: Finding test device...\n');

  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select(`
      device_id,
      device_mac,
      device_code,
      device_name,
      site_id,
      program_id,
      provisioning_status,
      is_active,
      mapped_at,
      mapped_by_user_id,
      created_at,
      sites:site_id (
        site_id,
        name
      ),
      pilot_programs:program_id (
        program_id,
        name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(5);

  if (devicesError) {
    console.error('❌ Error fetching devices:', devicesError.message);
    return;
  }

  if (!devices || devices.length === 0) {
    console.log('⚠️  No devices found in database');
    return;
  }

  console.log(`✅ Found ${devices.length} device(s):\n`);

  devices.forEach((device, index) => {
    const status = device.provisioning_status === 'mapped' ? '✅ MAPPED' :
                   device.provisioning_status === 'pending_mapping' ? '⏳ PENDING' :
                   device.provisioning_status;

    console.log(`   ${index + 1}. ${device.device_code || device.device_mac}`);
    console.log(`      Status: ${status}`);
    console.log(`      Site: ${device.sites?.name || '(none)'}`);
    console.log(`      Program: ${device.pilot_programs?.name || '(none)'}`);
    console.log(`      Active: ${device.is_active ? 'Yes' : 'No'}`);
    if (device.mapped_at) {
      console.log(`      Mapped: ${new Date(device.mapped_at).toLocaleString()}`);
    }
    console.log('');
  });

  // Step 2: Check for mapped devices and verify junction tables
  const mappedDevices = devices.filter(d => d.provisioning_status === 'mapped');

  if (mappedDevices.length === 0) {
    console.log('ℹ️  No mapped devices found yet. Map a device through the UI first.\n');
    console.log('   To map a device:');
    console.log('   1. Run: npm run dev');
    console.log('   2. Navigate to /devices page');
    console.log('   3. Click "Map" on a pending device');
    console.log('   4. Complete the mapping form\n');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('🔍 Step 2: Verifying junction table records for mapped devices...\n');

  for (const device of mappedDevices) {
    console.log(`📊 Device: ${device.device_code || device.device_mac}`);
    console.log('─'.repeat(60));

    // Check device_site_assignments
    const { data: siteAssignments, error: siteError } = await supabase
      .from('device_site_assignments')
      .select(`
        assignment_id,
        site_id,
        program_id,
        is_primary,
        is_active,
        assigned_at,
        assigned_by_user_id,
        unassigned_at,
        unassigned_by_user_id,
        reason,
        notes
      `)
      .eq('device_id', device.device_id)
      .order('assigned_at', { ascending: false });

    if (siteError) {
      console.log(`   ❌ Error fetching site assignments: ${siteError.message}`);
    } else if (!siteAssignments || siteAssignments.length === 0) {
      console.log('   ⚠️  NO site assignments found in junction table!');
      console.log('   This indicates the mapping function may not be creating junction records.');
    } else {
      console.log(`   ✅ Site Assignments: ${siteAssignments.length} record(s)`);
      siteAssignments.forEach((assignment, i) => {
        const status = assignment.is_active ? '🟢 ACTIVE' : '⚫ INACTIVE';
        console.log(`\n      Assignment ${i + 1}: ${status}`);
        console.log(`         Assigned: ${new Date(assignment.assigned_at).toLocaleString()}`);
        if (assignment.unassigned_at) {
          console.log(`         Unassigned: ${new Date(assignment.unassigned_at).toLocaleString()}`);
        }
        if (assignment.reason) {
          console.log(`         Reason: ${assignment.reason}`);
        }
        console.log(`         Primary: ${assignment.is_primary ? 'Yes' : 'No'}`);
      });
      console.log('');
    }

    // Check device_program_assignments
    const { data: programAssignments, error: programError } = await supabase
      .from('device_program_assignments')
      .select(`
        assignment_id,
        program_id,
        is_primary,
        is_active,
        assigned_at,
        assigned_by_user_id,
        unassigned_at,
        unassigned_by_user_id,
        reason,
        notes
      `)
      .eq('device_id', device.device_id)
      .order('assigned_at', { ascending: false });

    if (programError) {
      console.log(`   ❌ Error fetching program assignments: ${programError.message}`);
    } else if (!programAssignments || programAssignments.length === 0) {
      console.log('   ⚠️  NO program assignments found in junction table!');
      console.log('   This indicates the mapping function may not be creating junction records.');
    } else {
      console.log(`   ✅ Program Assignments: ${programAssignments.length} record(s)`);
      programAssignments.forEach((assignment, i) => {
        const status = assignment.is_active ? '🟢 ACTIVE' : '⚫ INACTIVE';
        console.log(`\n      Assignment ${i + 1}: ${status}`);
        console.log(`         Assigned: ${new Date(assignment.assigned_at).toLocaleString()}`);
        if (assignment.unassigned_at) {
          console.log(`         Unassigned: ${new Date(assignment.unassigned_at).toLocaleString()}`);
        }
        if (assignment.reason) {
          console.log(`         Reason: ${assignment.reason}`);
        }
        console.log(`         Primary: ${assignment.is_primary ? 'Yes' : 'No'}`);
      });
      console.log('');
    }

    // Verify integrity
    const activeSiteAssignments = siteAssignments?.filter(a => a.is_active) || [];
    const activeProgramAssignments = programAssignments?.filter(a => a.is_active) || [];

    console.log('   🔐 Integrity Checks:');

    if (activeSiteAssignments.length === 1) {
      console.log('      ✅ Exactly 1 active site assignment');
    } else if (activeSiteAssignments.length === 0) {
      console.log('      ❌ No active site assignments (expected 1)');
    } else {
      console.log(`      ⚠️  Multiple active site assignments: ${activeSiteAssignments.length} (should be 1)`);
    }

    if (activeProgramAssignments.length === 1) {
      console.log('      ✅ Exactly 1 active program assignment');
    } else if (activeProgramAssignments.length === 0) {
      console.log('      ❌ No active program assignments (expected 1)');
    } else {
      console.log(`      ⚠️  Multiple active program assignments: ${activeProgramAssignments.length} (should be 1)`);
    }

    const inactiveSiteAssignments = siteAssignments?.filter(a => !a.is_active) || [];
    const inactiveProgramAssignments = programAssignments?.filter(a => !a.is_active) || [];

    if (inactiveSiteAssignments.length > 0 || inactiveProgramAssignments.length > 0) {
      console.log(`      ✅ Assignment history preserved (${inactiveSiteAssignments.length} site + ${inactiveProgramAssignments.length} program)`);
    }

    console.log('\n');
  }

  // Step 3: Summary
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📋 SUMMARY\n');

  const totalDevices = devices.length;
  const pendingDevices = devices.filter(d => d.provisioning_status === 'pending_mapping').length;
  const mappedDevicesCount = devices.filter(d => d.provisioning_status === 'mapped').length;
  const inactiveDevices = devices.filter(d => !d.is_active).length;

  console.log(`   Total Devices: ${totalDevices}`);
  console.log(`   ⏳ Pending Mapping: ${pendingDevices}`);
  console.log(`   ✅ Mapped: ${mappedDevicesCount}`);
  console.log(`   ⚫ Inactive: ${inactiveDevices}\n`);

  if (pendingDevices > 0) {
    console.log(`   👉 ${pendingDevices} device(s) ready to be mapped through the UI\n`);
  }

  if (mappedDevicesCount === 0) {
    console.log('   ℹ️  Tip: Map a pending device to test junction table functionality\n');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

verifyDeviceMapping()
  .then(() => {
    console.log('✅ Verification complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error.message);
    console.error(error);
    process.exit(1);
  });
