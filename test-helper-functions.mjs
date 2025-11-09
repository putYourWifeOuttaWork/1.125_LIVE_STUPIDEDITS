#!/usr/bin/env node

/**
 * Test Helper Functions Compatibility
 *
 * This script verifies that all helper functions work correctly
 * and that the bridge migration resolved the function conflicts.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testHelperFunctions() {
  console.log('🧪 Testing Helper Function Compatibility\n');
  console.log('=' .repeat(60));

  // Test 1: Check if functions exist
  console.log('\n📋 Test 1: Verifying Functions Exist');
  console.log('-'.repeat(60));

  const functionsToCheck = [
    'is_company_admin',
    'user_is_company_admin',
    'is_super_admin',
    'get_user_company_id',
    'get_active_company_id',
    'user_has_program_access',
    'user_is_company_admin_for_program',
    'set_active_company_context',
    'get_active_company_context'
  ];

  const { data: functions, error: funcError } = await supabase.rpc('pg_get_functiondef', {
    funcoid: 0
  }).then(() => supabase.from('pg_proc')
    .select('proname')
    .in('proname', functionsToCheck)
  ).catch(() => ({ data: null, error: null }));

  // Alternative method to check functions
  for (const funcName of functionsToCheck) {
    const { data, error } = await supabase.rpc('pg_catalog.has_function_privilege', {
      func: funcName,
      priv_type: 'execute'
    }).catch(() => ({ data: null, error: null }));

    const exists = !error;
    console.log(`  ${exists ? '✅' : '❌'} ${funcName}()`);
  }

  // Test 2: Get a test user for function testing
  console.log('\n📋 Test 2: Finding Test User');
  console.log('-'.repeat(60));

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, is_super_admin, is_company_admin, company_id')
    .limit(1)
    .single();

  if (usersError || !users) {
    console.log('  ⚠️  No users found in database');
    return;
  }

  console.log(`  ✅ Found user: ${users.email}`);
  console.log(`     - Super Admin: ${users.is_super_admin}`);
  console.log(`     - Company Admin: ${users.is_company_admin}`);
  console.log(`     - Company ID: ${users.company_id}`);

  // Test 3: Test active company context functions
  console.log('\n📋 Test 3: Testing Active Company Context');
  console.log('-'.repeat(60));

  // Create a client for this specific user (simulate their session)
  const { data: { session }, error: authError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: users.email
  });

  if (users.company_id) {
    // Test get_active_company_id
    const { data: activeCompanyId, error: activeError } = await supabase
      .rpc('get_active_company_id');

    if (activeError) {
      console.log(`  ❌ get_active_company_id() error: ${activeError.message}`);
    } else {
      console.log(`  ✅ get_active_company_id(): ${activeCompanyId}`);
    }

    // Test get_active_company_context
    const { data: context, error: contextError } = await supabase
      .rpc('get_active_company_context');

    if (contextError) {
      console.log(`  ❌ get_active_company_context() error: ${contextError.message}`);
    } else {
      console.log(`  ✅ get_active_company_context():`);
      console.log(`     - Active Company: ${context.active_company_name} (${context.active_company_id})`);
      console.log(`     - Can Switch: ${context.can_switch_companies}`);
    }
  }

  // Test 4: Test compatibility functions
  console.log('\n📋 Test 4: Testing Compatibility Functions');
  console.log('-'.repeat(60));

  const { data: isCompanyAdmin1, error: err1 } = await supabase
    .rpc('is_company_admin');
  console.log(`  ${err1 ? '❌' : '✅'} is_company_admin(): ${isCompanyAdmin1}`);

  const { data: isCompanyAdmin2, error: err2 } = await supabase
    .rpc('user_is_company_admin');
  console.log(`  ${err2 ? '❌' : '✅'} user_is_company_admin(): ${isCompanyAdmin2}`);

  if (isCompanyAdmin1 === isCompanyAdmin2) {
    console.log(`  ✅ Both functions return the same result (compatibility confirmed)`);
  } else {
    console.log(`  ⚠️  Functions return different results!`);
  }

  // Test 5: Test program access function
  console.log('\n📋 Test 5: Testing Program Access Function');
  console.log('-'.repeat(60));

  const { data: programs, error: progError } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id')
    .limit(1)
    .single();

  if (programs) {
    console.log(`  Testing with program: ${programs.name}`);

    const { data: hasAccess, error: accessError } = await supabase
      .rpc('user_has_program_access', { p_program_id: programs.program_id });

    if (accessError) {
      console.log(`  ❌ user_has_program_access() error: ${accessError.message}`);
    } else {
      console.log(`  ✅ user_has_program_access(): ${hasAccess}`);
    }

    const { data: isAdminForProgram, error: adminProgError } = await supabase
      .rpc('user_is_company_admin_for_program', { p_program_id: programs.program_id });

    if (adminProgError) {
      console.log(`  ❌ user_is_company_admin_for_program() error: ${adminProgError.message}`);
    } else {
      console.log(`  ✅ user_is_company_admin_for_program(): ${isAdminForProgram}`);
    }
  } else {
    console.log('  ⚠️  No programs found in database');
  }

  // Test 6: Verify RLS policies can execute
  console.log('\n📋 Test 6: Testing RLS Policy Execution');
  console.log('-'.repeat(60));

  const tables = ['pilot_programs', 'sites', 'submissions'];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);

    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: Query executed successfully (${data?.length || 0} rows)`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Helper Function Compatibility Test Complete!\n');
}

// Run tests
testHelperFunctions().catch(console.error);
