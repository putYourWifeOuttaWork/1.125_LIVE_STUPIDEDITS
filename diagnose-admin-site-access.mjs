import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function diagnose() {
  console.log('=== ADMIN SITE ACCESS DIAGNOSTIC ===\n');

  try {
    // 1. Check for admin users
    console.log('📊 Step 1: Finding admin users...\n');

    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, email, is_super_admin, is_company_admin, company_id, companies(name)')
      .or('is_super_admin.eq.true,is_company_admin.eq.true');

    if (adminError) {
      console.error('Error fetching admin users:', adminError);
      return;
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.log('⚠️  No admin users found in the database');
      return;
    }

    console.log(`Found ${adminUsers.length} admin user(s):\n`);
    adminUsers.forEach(user => {
      console.log(`  👤 ${user.email}`);
      console.log(`     - Super Admin: ${user.is_super_admin || false}`);
      console.log(`     - Company Admin: ${user.is_company_admin || false}`);
      console.log(`     - Company: ${user.companies?.name || 'N/A'}`);
      console.log('');
    });

    // 2. For each admin, check their program and site access
    for (const admin of adminUsers) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Checking access for: ${admin.email}`);
      console.log('='.repeat(60));

      // Get programs accessible to this admin
      let programsQuery = supabase
        .from('pilot_programs')
        .select('program_id, name, company_id, companies(name)');

      if (admin.is_super_admin) {
        // Super admin sees all programs
        console.log('\n✓ User is Super Admin - should see ALL programs and sites\n');
      } else if (admin.is_company_admin && admin.company_id) {
        // Company admin sees their company's programs
        programsQuery = programsQuery.eq('company_id', admin.company_id);
        console.log(`\n✓ User is Company Admin for: ${admin.companies?.name || admin.company_id}\n`);
      }

      const { data: programs, error: progError } = await programsQuery;

      if (progError) {
        console.error('❌ Error fetching programs:', progError);
        continue;
      }

      if (!programs || programs.length === 0) {
        console.log('⚠️  No programs found for this admin');
        continue;
      }

      console.log(`📁 Programs (${programs.length}):`);
      for (const program of programs) {
        console.log(`\n  🔹 ${program.name}`);
        console.log(`     Program ID: ${program.program_id}`);
        console.log(`     Company: ${program.companies?.name || program.company_id}`);

        // Check pilot_program_users entry
        const { data: ppu } = await supabase
          .from('pilot_program_users')
          .select('role')
          .eq('program_id', program.program_id)
          .eq('user_id', admin.id)
          .maybeSingle();

        if (ppu) {
          console.log(`     ✓ Has explicit access (Role: ${ppu.role})`);
        } else {
          console.log(`     ⚠️  No explicit pilot_program_users entry`);
          if (admin.is_company_admin) {
            console.log(`     → Should still see sites (company admin privilege)`);
          }
        }

        // Check sites in this program
        const { data: sites, error: siteError } = await supabase
          .from('sites')
          .select('site_id, name, company_id')
          .eq('program_id', program.program_id);

        if (siteError) {
          console.log(`     ❌ Error fetching sites: ${siteError.message}`);
        } else if (!sites || sites.length === 0) {
          console.log(`     📍 Sites: None`);
        } else {
          console.log(`     📍 Sites (${sites.length}):`);
          sites.forEach(site => {
            console.log(`        • ${site.name}`);
          });
        }
      }
    }

    // 3. Check RLS helper functions
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('🔍 Checking RLS Helper Functions');
    console.log('='.repeat(60));

    const helperFunctions = [
      'is_super_admin',
      'user_is_company_admin',
      'get_user_company_id',
      'user_has_program_access'
    ];

    for (const funcName of helperFunctions) {
      const { data, error } = await supabase.rpc(funcName, {});

      if (error) {
        console.log(`\n❌ ${funcName}: ERROR - ${error.message}`);
      } else {
        console.log(`\n✓ ${funcName}: Available`);
      }
    }

    // 4. Check current RLS policies on sites table
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('🔐 Current RLS Policies on Sites Table');
    console.log('='.repeat(60));

    const { data: policies, error: policyError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'sites');

    if (policyError) {
      console.log('\n⚠️  Could not retrieve policies:', policyError.message);
    } else if (!policies || policies.length === 0) {
      console.log('\n⚠️  No RLS policies found on sites table');
    } else {
      console.log(`\n✓ Found ${policies.length} policies:\n`);
      policies.forEach(policy => {
        console.log(`  • ${policy.policyname} (${policy.cmd})`);
      });
    }

    console.log('\n=== DIAGNOSTIC COMPLETE ===\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

diagnose();
