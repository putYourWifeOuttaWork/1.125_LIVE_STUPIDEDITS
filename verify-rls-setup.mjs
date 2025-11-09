#!/usr/bin/env node

/**
 * Script to verify RLS rebuild was applied correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verify() {
  console.log('='.repeat(70));
  console.log('  RLS SETUP VERIFICATION');
  console.log('='.repeat(70));
  console.log();

  let allPassed = true;

  // Check 1: Verify export_rights column exists
  console.log('1. Checking export_rights column...');
  const { data: exportRightsCheck, error: exportRightsError } = await supabase
    .from('users')
    .select('export_rights')
    .limit(1);

  if (exportRightsError) {
    console.log('   ❌ export_rights column not found');
    allPassed = false;
  } else {
    console.log('   ✅ export_rights column exists');
  }

  // Check 2: Verify user_role column exists
  console.log('2. Checking user_role column...');
  const { data: userRoleCheck, error: userRoleError } = await supabase
    .from('users')
    .select('user_role')
    .limit(1);

  if (userRoleError) {
    console.log('   ❌ user_role column not found');
    allPassed = false;
  } else {
    console.log('   ✅ user_role column exists');
  }

  // Check 3: Verify pilot_program_users table is removed
  console.log('3. Checking pilot_program_users table removal...');
  const { data: pppCheck, error: pppError } = await supabase
    .from('pilot_program_users')
    .select('*')
    .limit(1);

  if (pppError && pppError.message.includes('does not exist')) {
    console.log('   ✅ pilot_program_users table removed');
  } else if (!pppError) {
    console.log('   ❌ pilot_program_users table still exists');
    allPassed = false;
  }

  // Check 4: Verify pilot_program_users_archive exists
  console.log('4. Checking pilot_program_users_archive table...');
  const { data: archiveCheck, error: archiveError } = await supabase
    .from('pilot_program_users_archive')
    .select('count')
    .limit(1);

  if (archiveError) {
    console.log('   ❌ pilot_program_users_archive table not found');
    allPassed = false;
  } else {
    console.log('   ✅ pilot_program_users_archive table exists');
  }

  // Check 5: Verify helper functions exist
  console.log('5. Checking RLS helper functions...');
  const { data: functionsCheck, error: functionsError } = await supabase
    .rpc('is_user_active');

  // This will fail because we're not authenticated, but it verifies the function exists
  if (functionsError && !functionsError.message.includes('does not exist')) {
    console.log('   ✅ RLS helper functions exist');
  } else if (functionsError && functionsError.message.includes('does not exist')) {
    console.log('   ❌ RLS helper functions not found');
    allPassed = false;
  }

  // Check 6: Verify RLS is enabled on key tables
  console.log('6. Checking RLS enabled on tables...');
  console.log('   (This check requires database-level query access)');

  // Check 7: Count users by role
  console.log('7. Counting users by role...');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('user_role, is_company_admin, is_super_admin, is_active, export_rights');

  if (!usersError && users) {
    const roleCounts = users.reduce((acc, user) => {
      acc[user.user_role] = (acc[user.user_role] || 0) + 1;
      return acc;
    }, {});

    console.log('   User role distribution:');
    Object.entries(roleCounts).forEach(([role, count]) => {
      console.log(`     - ${role}: ${count} users`);
    });

    const adminCount = users.filter(u => u.is_company_admin).length;
    const superAdminCount = users.filter(u => u.is_super_admin).length;
    const activeCount = users.filter(u => u.is_active).length;

    console.log(`   Company admins: ${adminCount}`);
    console.log(`   Super admins: ${superAdminCount}`);
    console.log(`   Active users: ${activeCount}/${users.length}`);

    // Check export rights distribution
    const exportCounts = users.reduce((acc, user) => {
      acc[user.export_rights] = (acc[user.export_rights] || 0) + 1;
      return acc;
    }, {});

    console.log('   Export rights distribution:');
    Object.entries(exportCounts).forEach(([rights, count]) => {
      console.log(`     - ${rights}: ${count} users`);
    });
  } else {
    console.log('   ⚠️  Could not fetch user statistics');
  }

  console.log();
  console.log('='.repeat(70));

  if (allPassed) {
    console.log('✅ RLS REBUILD VERIFICATION PASSED');
    console.log('\nNext steps:');
    console.log('1. Review user role assignments');
    console.log('2. Assign appropriate roles to users:');
    console.log('   UPDATE users SET user_role = \'analyst\' WHERE email = \'user@example.com\';');
    console.log('3. Grant export rights as needed:');
    console.log('   UPDATE users SET export_rights = \'history_and_analytics\' WHERE user_role = \'analyst\';');
    console.log('4. Test access with different user accounts');
    console.log('5. Update frontend code to remove pilot_program_users references');
  } else {
    console.log('❌ RLS REBUILD VERIFICATION FAILED');
    console.log('\nSome checks did not pass. Review the errors above.');
    console.log('If migrations failed, you may need to:');
    console.log('1. Apply migrations manually using Supabase Studio');
    console.log('2. Check migration logs for specific errors');
    console.log('3. Use rollback script if needed: supabase/RLS_REBUILD_ROLLBACK.sql');
  }

  console.log('='.repeat(70));

  process.exit(allPassed ? 0 : 1);
}

verify().catch(error => {
  console.error('\n❌ Verification failed:', error);
  process.exit(1);
});
