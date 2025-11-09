#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use service role key for admin access
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n=== Company Context Diagnostic Tool (Admin) ===\n');

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
    const issues = [];
    for (const context of contexts) {
      const user = users.find(u => u.id === context.user_id);
      const activeCompany = companies.find(c => c.company_id === context.active_company_id);
      const assignedCompany = companies.find(c => c.company_id === user?.company_id);

      console.log(`\n   - ${user?.email || 'Unknown User'}`);
      console.log(`     Active Context: ${activeCompany ? activeCompany.name : 'NONE'} (${context.active_company_id || 'NULL'})`);
      console.log(`     Assigned Company: ${assignedCompany ? assignedCompany.name : 'NONE'} (${user?.company_id || 'NULL'})`);

      // Flag mismatch for non-super-admins
      if (!user?.is_super_admin && context.active_company_id !== user?.company_id) {
        console.log(`     ⚠️  WARNING: Active context doesn't match assigned company!`);
        issues.push({
          type: 'mismatch',
          user_id: user.id,
          email: user.email,
          active_company: activeCompany?.name,
          assigned_company: assignedCompany?.name
        });
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
        issues.push({
          type: 'missing_context',
          user_id: user.id,
          email: user.email,
          assigned_company: company?.name
        });
      });
    } else {
      console.log('✅ All users have active company context set');
    }

    // Step 5: Check programs per company
    console.log('\n📊 Step 5: Checking programs distribution by company...');
    const programsByCompany = {};
    for (const company of companies) {
      const { data: programs, error: programsError } = await supabase
        .from('pilot_programs')
        .select('program_id, name')
        .eq('company_id', company.company_id);

      if (programsError) {
        console.error(`❌ Error fetching programs for ${company.name}:`, programsError);
      } else {
        console.log(`\n   ${company.name}: ${programs.length} programs`);
        if (programs.length > 0 && programs.length <= 5) {
          programs.forEach(p => console.log(`     - ${p.name}`));
        }
        programsByCompany[company.company_id] = programs;
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
        issues.push({
          type: 'orphaned_program',
          program_id: program.program_id,
          program_name: program.name
        });
      });
    } else {
      console.log('✅ All programs have company_id assigned');
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log(`✓ Total Companies: ${companies.length}`);
    console.log(`✓ Total Users: ${users.length}`);
    console.log(`✓ Users with Active Context: ${contexts.length}`);
    console.log(`✓ Users without Active Context: ${usersWithoutContext.length}`);
    console.log(`✓ Total Issues Found: ${issues.length}`);

    // Detailed Issues
    if (issues.length > 0) {
      console.log('\n=== Issues Requiring Attention ===');
      issues.forEach((issue, idx) => {
        console.log(`\n${idx + 1}. ${issue.type.toUpperCase()}`);
        console.log(`   ${JSON.stringify(issue, null, 2)}`);
      });
    }

    // Recommendations
    console.log('\n=== Recommendations ===');
    if (usersWithoutContext.length > 0) {
      console.log('⚠️  Run fix script to initialize active company context for users without it');
    }

    const mismatches = issues.filter(i => i.type === 'mismatch');
    if (mismatches.length > 0) {
      console.log('⚠️  Run fix script to correct active company context for non-super-admin users');
    }

    if (orphanedPrograms && orphanedPrograms.length > 0) {
      console.log('⚠️  Assign company_id to orphaned programs manually');
    }

    if (issues.length === 0) {
      console.log('✅ Company context is properly configured!');
      console.log('✅ No issues found - all users and programs are correctly assigned');
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
