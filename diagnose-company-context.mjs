#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('\n=== Company Context Diagnostic Tool ===\n');

async function diagnoseCompanyContext() {
  try {
    // Step 1: Get all companies
    console.log('📊 Step 1: Fetching all companies...');
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('company_id, name')
      .order('name');

    if (companiesError) {
      console.error('❌ Error fetching companies:', companiesError);
      return;
    }

    console.log(`✅ Found ${companies.length} companies:`);
    companies.forEach((company, idx) => {
      console.log(`   ${idx + 1}. ${company.name} (ID: ${company.company_id})`);
    });

    // Step 2: Get all users and their company assignments
    console.log('\n📊 Step 2: Checking user company assignments...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, company_id, is_super_admin, is_company_admin')
      .order('email');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log(`✅ Found ${users.length} users:`);
    for (const user of users) {
      const company = companies.find(c => c.company_id === user.company_id);
      const role = user.is_super_admin ? 'Super Admin' : (user.is_company_admin ? 'Company Admin' : 'Regular User');
      console.log(`   - ${user.email} (${role})`);
      console.log(`     Assigned Company: ${company ? company.name : 'NONE'} (${user.company_id || 'NULL'})`);
    }

    // Step 3: Check active company context for all users
    console.log('\n📊 Step 3: Checking active company context...');
    const { data: contexts, error: contextsError } = await supabase
      .from('user_active_company_context')
      .select('user_id, active_company_id, updated_at');

    if (contextsError) {
      console.error('❌ Error fetching contexts:', contextsError);
      return;
    }

    console.log(`✅ Found ${contexts.length} active company contexts:`);
    for (const context of contexts) {
      const user = users.find(u => u.id === context.user_id);
      const activeCompany = companies.find(c => c.company_id === context.active_company_id);
      const assignedCompany = companies.find(c => c.company_id === user?.company_id);

      console.log(`   - ${user?.email || 'Unknown User'}`);
      console.log(`     Active Context: ${activeCompany ? activeCompany.name : 'NONE'} (${context.active_company_id || 'NULL'})`);
      console.log(`     Assigned Company: ${assignedCompany ? assignedCompany.name : 'NONE'} (${user?.company_id || 'NULL'})`);

      // Flag mismatch for non-super-admins
      if (!user?.is_super_admin && context.active_company_id !== user?.company_id) {
        console.log(`     ⚠️  WARNING: Active context doesn't match assigned company!`);
      }
      console.log(`     Last Updated: ${new Date(context.updated_at).toLocaleString()}`);
    }

    // Step 4: Check for users without active company context
    console.log('\n📊 Step 4: Checking for users without active company context...');
    const usersWithoutContext = users.filter(u => !contexts.find(c => c.user_id === u.id));
    if (usersWithoutContext.length > 0) {
      console.log(`⚠️  Found ${usersWithoutContext.length} users without active company context:`);
      usersWithoutContext.forEach(user => {
        const company = companies.find(c => c.company_id === user.company_id);
        console.log(`   - ${user.email} (Assigned: ${company ? company.name : 'NONE'})`);
      });
    } else {
      console.log('✅ All users have active company context set');
    }

    // Step 5: Check programs per company
    console.log('\n📊 Step 5: Checking programs distribution by company...');
    for (const company of companies) {
      const { count, error: countError } = await supabase
        .from('pilot_programs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.company_id);

      if (countError) {
        console.error(`❌ Error counting programs for ${company.name}:`, countError);
      } else {
        console.log(`   ${company.name}: ${count} programs`);
      }
    }

    // Step 6: Check for programs without company_id
    console.log('\n📊 Step 6: Checking for programs without company_id...');
    const { data: orphanedPrograms, error: orphanError } = await supabase
      .from('pilot_programs')
      .select('program_id, name, company_id')
      .is('company_id', null);

    if (orphanError) {
      console.error('❌ Error checking orphaned programs:', orphanError);
    } else if (orphanedPrograms && orphanedPrograms.length > 0) {
      console.log(`⚠️  Found ${orphanedPrograms.length} programs without company_id:`);
      orphanedPrograms.forEach(program => {
        console.log(`   - ${program.name} (ID: ${program.program_id})`);
      });
    } else {
      console.log('✅ All programs have company_id assigned');
    }

    // Step 7: Test RLS function
    console.log('\n📊 Step 7: Testing get_active_company_id() function...');
    console.log('   Note: This will return NULL when called without authentication');
    console.log('   For authenticated testing, use the frontend app or authenticated client');

    // Summary
    console.log('\n=== Summary ===');
    console.log(`✓ Total Companies: ${companies.length}`);
    console.log(`✓ Total Users: ${users.length}`);
    console.log(`✓ Users with Active Context: ${contexts.length}`);
    console.log(`✓ Users without Active Context: ${usersWithoutContext.length}`);

    // Recommendations
    console.log('\n=== Recommendations ===');
    if (usersWithoutContext.length > 0) {
      console.log('⚠️  Initialize active company context for users without it');
    }

    const mismatches = contexts.filter(ctx => {
      const user = users.find(u => u.id === ctx.user_id);
      return user && !user.is_super_admin && ctx.active_company_id !== user.company_id;
    });

    if (mismatches.length > 0) {
      console.log('⚠️  Fix active company context for non-super-admin users with mismatches');
    }

    if (orphanedPrograms && orphanedPrograms.length > 0) {
      console.log('⚠️  Assign company_id to orphaned programs');
    }

    if (usersWithoutContext.length === 0 && mismatches.length === 0 && (!orphanedPrograms || orphanedPrograms.length === 0)) {
      console.log('✅ Company context is properly configured!');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the diagnostic
diagnoseCompanyContext().then(() => {
  console.log('\n=== Diagnostic Complete ===\n');
  process.exit(0);
});
