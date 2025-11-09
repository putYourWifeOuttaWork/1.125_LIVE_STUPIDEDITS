import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// You'll need to provide the user's email
const userEmail = process.argv[2] || 'matt@sandhillgrowers.com';
const companyName = process.argv[3] || 'Sandhill Growers';

async function diagnoseSiteAccess() {
  console.log('=== SITE ACCESS DIAGNOSTIC ===\n');
  console.log(`Checking access for: ${userEmail}`);
  console.log(`Company: ${companyName}\n`);

  try {
    // 1. Get user info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, is_super_admin, is_company_admin, company_id, companies(name)')
      .eq('email', userEmail)
      .single();

    if (userError || !userData) {
      console.error('❌ User not found:', userError);
      return;
    }

    console.log('✓ User found:');
    console.log(`  - ID: ${userData.id}`);
    console.log(`  - Email: ${userData.email}`);
    console.log(`  - Super Admin: ${userData.is_super_admin}`);
    console.log(`  - Company Admin: ${userData.is_company_admin}`);
    console.log(`  - Company ID: ${userData.company_id}`);
    console.log(`  - Company Name: ${userData.companies?.name || 'N/A'}\n`);

    // 2. Get programs for this company
    const { data: programs, error: programError } = await supabase
      .from('pilot_programs')
      .select('program_id, name, company_id')
      .eq('company_id', userData.company_id);

    if (programError) {
      console.error('❌ Error fetching programs:', programError);
      return;
    }

    console.log(`✓ Found ${programs?.length || 0} programs for company:\n`);
    programs?.forEach(p => {
      console.log(`  - ${p.name} (${p.program_id})`);
    });

    if (!programs || programs.length === 0) {
      console.log('\n⚠️ No programs found for this company');
      return;
    }

    // 3. For each program, check pilot_program_users entries
    console.log('\n--- Program Access ---');
    for (const program of programs) {
      const { data: access, error: accessError } = await supabase
        .from('pilot_program_users')
        .select('user_id, role')
        .eq('program_id', program.program_id)
        .eq('user_id', userData.id);

      if (access && access.length > 0) {
        console.log(`✓ ${program.name}: Has explicit access (Role: ${access[0].role})`);
      } else {
        console.log(`⚠️ ${program.name}: NO explicit access in pilot_program_users`);
      }
    }

    // 4. For each program, check sites
    console.log('\n--- Sites Check ---');
    for (const program of programs) {
      const { data: sites, error: siteError } = await supabase
        .from('sites')
        .select('site_id, name, company_id, program_id')
        .eq('program_id', program.program_id);

      if (siteError) {
        console.log(`❌ ${program.name}: Error fetching sites - ${siteError.message}`);
      } else if (!sites || sites.length === 0) {
        console.log(`  ${program.name}: No sites exist`);
      } else {
        console.log(`✓ ${program.name}: ${sites.length} sites exist`);
        sites.forEach(s => {
          console.log(`    - ${s.name} (company_id: ${s.company_id})`);
        });
      }
    }

    // 5. Test RLS policies directly
    console.log('\n--- RLS Policy Test ---');
    const testProgramId = programs[0].program_id;
    
    // Check if is_super_admin function works
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    console.log(`  is_super_admin(): ${isSuperAdmin}`);

    // Check if user_is_company_admin function works
    const { data: isCompanyAdmin } = await supabase.rpc('user_is_company_admin');
    console.log(`  user_is_company_admin(): ${isCompanyAdmin}`);

    // Check if user_has_program_access function works
    const { data: hasProgramAccess } = await supabase.rpc('user_has_program_access', { 
      p_program_id: testProgramId 
    });
    console.log(`  user_has_program_access(${testProgramId}): ${hasProgramAccess}`);

    // Check company admin for program
    const { data: isCompanyAdminForProgram } = await supabase.rpc('user_is_company_admin_for_program', { 
      p_program_id: testProgramId 
    });
    console.log(`  user_is_company_admin_for_program(${testProgramId}): ${isCompanyAdminForProgram}`);

    console.log('\n=== DIAGNOSIS COMPLETE ===');

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

diagnoseSiteAccess();
