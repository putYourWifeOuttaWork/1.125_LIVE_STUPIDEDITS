#!/usr/bin/env node

/**
 * Test Multi-Tenancy Fix
 *
 * This script tests the multi-tenancy fixes for company admin access.
 * It verifies that:
 * 1. The user has correct company assignment
 * 2. The user can see programs in their company
 * 3. RLS policies are working correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('===========================================');
  console.log('Multi-Tenancy Fix Verification');
  console.log('===========================================\n');

  try {
    // Test 1: Check if diagnostic functions exist
    console.log('TEST 1: Checking diagnostic functions...');
    const { data: debugData, error: debugError } = await supabase.rpc('get_user_access_debug');

    if (debugError) {
      console.error('❌ Diagnostic function not available:', debugError.message);
      console.log('   This likely means migrations have not been applied yet.\n');
    } else {
      console.log('✅ Diagnostic functions are available\n');

      // Test 2: Get user access debug info
      console.log('TEST 2: User Access Debug Info');
      console.log('----------------------------------------');
      console.log('User ID:', debugData.user_id);
      console.log('Company ID:', debugData.company_id);
      console.log('Company Name:', debugData.company_name);
      console.log('Is Super Admin:', debugData.is_super_admin);
      console.log('Is Company Admin:', debugData.is_company_admin);
      console.log('Programs in Company:', debugData.programs_in_company);
      console.log('Explicit Program Access Count:', debugData.explicit_program_access_count);
      console.log('Access Summary:', debugData.access_summary);
      console.log('');
    }

    // Test 3: List visible programs
    console.log('TEST 3: Listing visible programs...');
    const { data: visiblePrograms, error: programsError } = await supabase.rpc('list_visible_programs');

    if (programsError) {
      console.error('❌ Error listing programs:', programsError.message);
      console.log('');
    } else {
      if (visiblePrograms && visiblePrograms.length > 0) {
        console.log(`✅ Found ${visiblePrograms.length} visible programs:\n`);
        visiblePrograms.forEach((prog, idx) => {
          console.log(`${idx + 1}. ${prog.program_name}`);
          console.log(`   Company: ${prog.company_name}`);
          console.log(`   Access Reason: ${prog.access_reason}\n`);
        });
      } else {
        console.log('⚠️  No programs visible to current user\n');
      }
    }

    // Test 4: Query programs directly
    console.log('TEST 4: Querying programs directly via pilot_programs_with_progress...');
    const { data: programs, error: directError } = await supabase
      .from('pilot_programs_with_progress')
      .select('program_id, name, company_id, status, total_sites, total_submissions')
      .order('name');

    if (directError) {
      console.error('❌ Error querying programs:', directError.message);
      console.log('');
    } else {
      if (programs && programs.length > 0) {
        console.log(`✅ Found ${programs.length} programs via direct query:\n`);
        programs.forEach((prog, idx) => {
          console.log(`${idx + 1}. ${prog.name}`);
          console.log(`   Status: ${prog.status}`);
          console.log(`   Sites: ${prog.total_sites}, Submissions: ${prog.total_submissions}\n`);
        });
      } else {
        console.log('⚠️  No programs returned from direct query\n');
      }
    }

    // Test 5: Check if Sandhill Growers company exists
    console.log('TEST 5: Checking Sandhill Growers company...');
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('company_id, name, description')
      .eq('name', 'Sandhill Growers');

    if (companyError) {
      console.error('❌ Error querying companies:', companyError.message);
      console.log('   Note: Companies table may have RLS enabled');
      console.log('');
    } else {
      if (companies && companies.length > 0) {
        console.log('✅ Sandhill Growers company exists:');
        console.log(`   Company ID: ${companies[0].company_id}`);
        console.log(`   Description: ${companies[0].description?.substring(0, 60)}...\n`);
      } else {
        console.log('⚠️  Sandhill Growers company not found\n');
      }
    }

    // Test 6: Check current user's details
    console.log('TEST 6: Checking current authenticated user...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('❌ No authenticated user:', authError?.message || 'Not logged in');
      console.log('   Please log in first to run these tests.\n');
    } else {
      console.log('✅ Authenticated user:');
      console.log(`   Email: ${user.email}`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Full Name: ${user.user_metadata?.full_name || 'Not set'}\n`);
    }

  } catch (error) {
    console.error('Unexpected error during tests:', error.message);
  }

  console.log('===========================================');
  console.log('Test Complete');
  console.log('===========================================\n');
}

// Run the tests
runTests().catch(console.error);
