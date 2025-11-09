#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔧 Recent Submissions Debug Script');
console.log('=' .repeat(60));

async function runDiagnostics() {
  try {
    // Step 1: Check current user
    console.log('\n📋 Step 1: Checking current user session...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('❌ Not authenticated. Please log in first.');
      return;
    }

    console.log('✅ User authenticated:', {
      id: user.id,
      email: user.email
    });

    // Step 2: Get user details from users table
    console.log('\n📋 Step 2: Fetching user details from users table...');
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('id, email, company_id, is_active, is_super_admin, is_sys_admin')
      .eq('id', user.id)
      .single();

    if (userDataError) {
      console.error('❌ Error fetching user data:', userDataError);
      return;
    }

    console.log('✅ User details:', userData);

    // Step 3: Get company details
    if (userData.company_id) {
      console.log('\n📋 Step 3: Fetching company details...');
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('company_id, name')
        .eq('company_id', userData.company_id)
        .single();

      if (companyError) {
        console.error('❌ Error fetching company:', companyError);
      } else {
        console.log('✅ Company:', companyData);
      }
    }

    // Step 4: Get all programs for user's company
    console.log('\n📋 Step 4: Fetching programs...');
    const { data: programs, error: programsError } = await supabase
      .from('pilot_programs')
      .select('program_id, name, status, company_id')
      .eq('company_id', userData.company_id)
      .order('name');

    if (programsError) {
      console.error('❌ Error fetching programs:', programsError);
    } else {
      console.log(`✅ Found ${programs.length} programs:`, programs);
    }

    // Step 5: Get sites for the first program
    if (programs && programs.length > 0) {
      const firstProgram = programs[0];
      console.log(`\n📋 Step 5: Fetching sites for program "${firstProgram.name}"...`);

      const { data: sites, error: sitesError } = await supabase
        .from('sites')
        .select('site_id, name, program_id')
        .eq('program_id', firstProgram.program_id)
        .order('name');

      if (sitesError) {
        console.error('❌ Error fetching sites:', sitesError);
      } else {
        console.log(`✅ Found ${sites.length} sites:`, sites);

        // Step 6: Test the RPC function with the first site
        if (sites && sites.length > 0) {
          const firstSite = sites[0];
          console.log(`\n📋 Step 6: Testing get_recent_submissions_v3 RPC function...`);
          console.log('Parameters:', {
            limit_param: 10,
            program_id_param: firstProgram.program_id,
            site_id_param: firstSite.site_id
          });

          const { data: submissions, error: submissionsError } = await supabase
            .rpc('get_recent_submissions_v3', {
              limit_param: 10,
              program_id_param: firstProgram.program_id,
              site_id_param: firstSite.site_id
            });

          if (submissionsError) {
            console.error('❌ Error calling RPC function:', submissionsError);
          } else {
            console.log(`✅ RPC function returned ${submissions?.length || 0} submissions`);
            if (submissions && submissions.length > 0) {
              console.log('\n📦 First submission:', submissions[0]);
              console.log('\n📊 All submissions summary:');
              submissions.forEach((sub, idx) => {
                console.log(`  ${idx + 1}. ID: ${sub.global_submission_id || 'N/A'} | Site: ${sub.site_name} | Petri: ${sub.petri_count} | Date: ${sub.created_at}`);
              });
            } else {
              console.warn('⚠️ No submissions returned');

              // Step 7: Check if submissions exist in the table
              console.log('\n📋 Step 7: Checking submissions table directly...');
              const { data: directSubmissions, error: directError } = await supabase
                .from('submissions')
                .select('submission_id, site_id, program_id, created_at, temperature, humidity')
                .eq('site_id', firstSite.site_id)
                .order('created_at', { ascending: false })
                .limit(5);

              if (directError) {
                console.error('❌ Error querying submissions directly:', directError);
              } else {
                console.log(`✅ Found ${directSubmissions?.length || 0} submissions directly in table:`, directSubmissions);
              }
            }
          }

          // Step 8: Test without site filter
          console.log(`\n📋 Step 8: Testing RPC function without site filter...`);
          const { data: allSubmissions, error: allError } = await supabase
            .rpc('get_recent_submissions_v3', {
              limit_param: 10,
              program_id_param: firstProgram.program_id,
              site_id_param: null
            });

          if (allError) {
            console.error('❌ Error:', allError);
          } else {
            console.log(`✅ Found ${allSubmissions?.length || 0} submissions across all sites in program`);
          }

          // Step 9: Test without any filters (super admin mode)
          if (userData.is_super_admin) {
            console.log(`\n📋 Step 9: Testing RPC function in super admin mode (no filters)...`);
            const { data: globalSubmissions, error: globalError } = await supabase
              .rpc('get_recent_submissions_v3', {
                limit_param: 10,
                program_id_param: null,
                site_id_param: null
              });

            if (globalError) {
              console.error('❌ Error:', globalError);
            } else {
              console.log(`✅ Found ${globalSubmissions?.length || 0} submissions globally`);
            }
          }
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Diagnostic complete!');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
  }
}

runDiagnostics();
