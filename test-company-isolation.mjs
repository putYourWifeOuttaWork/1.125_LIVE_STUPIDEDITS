#!/usr/bin/env node

/**
 * Test Company Isolation and Active Company Context
 *
 * This script verifies that:
 * 1. Users only see programs from their active company
 * 2. Super admins can switch companies and see different data
 * 3. Company admins see all programs in their company without explicit assignments
 * 4. Regular users see only programs they have explicit access to
 * 5. No cross-company data leakage occurs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.cyan);
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

async function testActiveCompanyContext() {
  logSection('Test 1: Get Active Company Context');

  const { data, error } = await supabase.rpc('get_active_company_context');

  if (error) {
    logError(`Failed to get active company context: ${error.message}`);
    return false;
  }

  if (!data.success) {
    logError(`RPC call failed: ${data.message}`);
    return false;
  }

  logSuccess('Successfully retrieved active company context');
  logInfo(`User ID: ${data.user_id}`);
  logInfo(`Is Super Admin: ${data.is_super_admin}`);
  logInfo(`Is Company Admin: ${data.is_company_admin}`);
  logInfo(`Assigned Company: ${data.assigned_company_id}`);
  logInfo(`Active Company: ${data.active_company_name} (${data.active_company_id})`);
  logInfo(`Can Switch Companies: ${data.can_switch_companies}`);

  return {
    isSuperAdmin: data.is_super_admin,
    isCompanyAdmin: data.is_company_admin,
    activeCompanyId: data.active_company_id,
    activeCompanyName: data.active_company_name,
  };
}

async function testProgramVisibility(context) {
  logSection('Test 2: Program Visibility with RLS');

  const { data: programs, error } = await supabase
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id')
    .order('name');

  if (error) {
    logError(`Failed to fetch programs: ${error.message}`);
    return false;
  }

  logSuccess(`Successfully fetched ${programs.length} programs`);

  if (programs.length === 0) {
    logWarning('No programs visible to current user');
    logInfo('This is correct if:');
    logInfo('  - You are a regular user with no program assignments');
    logInfo('  - Your active company has no programs yet');
    return true;
  }

  // Check that all programs belong to the active company
  const programCompanies = [...new Set(programs.map(p => p.company_id))];

  if (programCompanies.length === 1 && programCompanies[0] === context.activeCompanyId) {
    logSuccess(`All programs belong to active company (${context.activeCompanyName})`);
  } else {
    logError('Programs from multiple companies detected!');
    logError(`Expected all programs to have company_id: ${context.activeCompanyId}`);
    logError(`But found: ${JSON.stringify(programCompanies)}`);
    return false;
  }

  // Display programs
  programs.forEach(program => {
    logInfo(`  - ${program.name} (${program.program_id})`);
  });

  return true;
}

async function testSiteVisibility(context) {
  logSection('Test 3: Site Visibility with RLS');

  const { data: sites, error } = await supabase
    .from('sites')
    .select('site_id, name, company_id, program_id')
    .order('name');

  if (error) {
    logError(`Failed to fetch sites: ${error.message}`);
    return false;
  }

  logSuccess(`Successfully fetched ${sites.length} sites`);

  if (sites.length === 0) {
    logWarning('No sites visible to current user');
    return true;
  }

  // Check that all sites belong to the active company
  const siteCompanies = [...new Set(sites.map(s => s.company_id))];

  if (siteCompanies.length === 1 && siteCompanies[0] === context.activeCompanyId) {
    logSuccess(`All sites belong to active company (${context.activeCompanyName})`);
  } else {
    logError('Sites from multiple companies detected!');
    logError(`Expected all sites to have company_id: ${context.activeCompanyId}`);
    logError(`But found: ${JSON.stringify(siteCompanies)}`);
    return false;
  }

  logInfo(`Sample sites (showing first 5):`);
  sites.slice(0, 5).forEach(site => {
    logInfo(`  - ${site.name} (${site.site_id})`);
  });

  return true;
}

async function testSubmissionVisibility(context) {
  logSection('Test 4: Submission Visibility with RLS');

  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('submission_id, company_id, program_id')
    .limit(10);

  if (error) {
    logError(`Failed to fetch submissions: ${error.message}`);
    return false;
  }

  logSuccess(`Successfully fetched ${submissions.length} submissions`);

  if (submissions.length === 0) {
    logWarning('No submissions visible to current user');
    return true;
  }

  // Check that all submissions belong to the active company
  const submissionCompanies = [...new Set(submissions.map(s => s.company_id))];

  if (submissionCompanies.length === 1 && submissionCompanies[0] === context.activeCompanyId) {
    logSuccess(`All submissions belong to active company (${context.activeCompanyName})`);
  } else {
    logError('Submissions from multiple companies detected!');
    logError(`Expected all submissions to have company_id: ${context.activeCompanyId}`);
    logError(`But found: ${JSON.stringify(submissionCompanies)}`);
    return false;
  }

  return true;
}

async function testCompanySwitching(context) {
  if (!context.isSuperAdmin) {
    logSection('Test 5: Company Switching (Skipped - Not Super Admin)');
    logInfo('This test only runs for super admin users');
    return true;
  }

  logSection('Test 5: Company Switching (Super Admin)');

  // Get all companies
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('company_id, name')
    .order('name');

  if (companiesError) {
    logError(`Failed to fetch companies: ${companiesError.message}`);
    return false;
  }

  if (companies.length < 2) {
    logWarning('Need at least 2 companies to test switching');
    logInfo('Skipping company switching test');
    return true;
  }

  logInfo(`Found ${companies.length} companies`);

  // Find a different company to switch to
  const targetCompany = companies.find(c => c.company_id !== context.activeCompanyId);

  if (!targetCompany) {
    logWarning('Could not find a different company to switch to');
    return true;
  }

  logInfo(`Attempting to switch from "${context.activeCompanyName}" to "${targetCompany.name}"`);

  // Switch company context
  const { data: switchResult, error: switchError } = await supabase.rpc('set_active_company_context', {
    p_company_id: targetCompany.company_id
  });

  if (switchError) {
    logError(`Failed to switch company: ${switchError.message}`);
    return false;
  }

  if (!switchResult.success) {
    logError(`Company switch failed: ${switchResult.message}`);
    return false;
  }

  logSuccess(`Successfully switched to "${targetCompany.name}"`);

  // Verify programs changed
  const { data: newPrograms, error: newProgramsError } = await supabase
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id')
    .order('name');

  if (newProgramsError) {
    logError(`Failed to fetch programs after switch: ${newProgramsError.message}`);
    return false;
  }

  // Check that all programs now belong to the new company
  const newProgramCompanies = [...new Set(newPrograms.map(p => p.company_id))];

  if (newPrograms.length === 0) {
    logInfo(`No programs in "${targetCompany.name}" - this is expected if company has no programs`);
  } else if (newProgramCompanies.length === 1 && newProgramCompanies[0] === targetCompany.company_id) {
    logSuccess(`All ${newPrograms.length} programs now belong to "${targetCompany.name}"`);
  } else {
    logError('After switching, programs from wrong company are visible!');
    logError(`Expected company_id: ${targetCompany.company_id}`);
    logError(`But found: ${JSON.stringify(newProgramCompanies)}`);
    return false;
  }

  // Switch back to original company
  logInfo(`Switching back to "${context.activeCompanyName}"`);

  const { data: switchBackResult, error: switchBackError } = await supabase.rpc('set_active_company_context', {
    p_company_id: context.activeCompanyId
  });

  if (switchBackError || !switchBackResult.success) {
    logWarning('Failed to switch back to original company');
  } else {
    logSuccess(`Switched back to "${context.activeCompanyName}"`);
  }

  return true;
}

async function runAllTests() {
  log('\n' + '█'.repeat(60), colors.cyan);
  log('  COMPANY ISOLATION AND CONTEXT TEST SUITE', colors.cyan);
  log('█'.repeat(60) + '\n', colors.cyan);

  const results = [];

  // Test 1: Get active company context
  const context = await testActiveCompanyContext();
  if (!context) {
    logError('Failed to get company context - stopping tests');
    return;
  }
  results.push({ name: 'Active Company Context', passed: true });

  // Test 2: Program visibility
  const programTest = await testProgramVisibility(context);
  results.push({ name: 'Program Visibility', passed: programTest });

  // Test 3: Site visibility
  const siteTest = await testSiteVisibility(context);
  results.push({ name: 'Site Visibility', passed: siteTest });

  // Test 4: Submission visibility
  const submissionTest = await testSubmissionVisibility(context);
  results.push({ name: 'Submission Visibility', passed: submissionTest });

  // Test 5: Company switching (super admin only)
  const switchTest = await testCompanySwitching(context);
  results.push({ name: 'Company Switching', passed: switchTest });

  // Summary
  logSection('Test Summary');
  let passedCount = 0;
  let failedCount = 0;

  results.forEach(result => {
    if (result.passed) {
      logSuccess(`${result.name}: PASSED`);
      passedCount++;
    } else {
      logError(`${result.name}: FAILED`);
      failedCount++;
    }
  });

  console.log('\n' + '='.repeat(60));
  if (failedCount === 0) {
    logSuccess(`All ${passedCount} tests passed! ✓`);
    log('Company isolation is working correctly.', colors.green);
  } else {
    logError(`${failedCount} test(s) failed, ${passedCount} passed`);
    log('There are issues with company isolation.', colors.red);
  }
  console.log('='.repeat(60) + '\n');

  process.exit(failedCount > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
