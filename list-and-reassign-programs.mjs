#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

console.log('\n=== Program Company Assignment Tool ===\n');

async function listAndReassignPrograms() {
  try {
    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('company_id, name')
      .order('name');

    if (companiesError) throw companiesError;

    console.log('Available Companies:');
    companies.forEach((company, idx) => {
      console.log(`  ${idx + 1}. ${company.name} (${company.company_id})`);
    });

    // Get all programs
    const { data: programs, error: programsError } = await supabase
      .from('pilot_programs')
      .select('program_id, name, company_id, description, start_date, end_date, status')
      .order('name');

    if (programsError) throw programsError;

    console.log(`\n=== All Programs (${programs.length} total) ===\n`);

    for (let i = 0; i < programs.length; i++) {
      const program = programs[i];
      const company = companies.find(c => c.company_id === program.company_id);

      console.log(`\n--- Program ${i + 1} of ${programs.length} ---`);
      console.log(`Name: ${program.name}`);
      console.log(`Description: ${program.description || 'N/A'}`);
      console.log(`Status: ${program.status}`);
      console.log(`Date Range: ${program.start_date} to ${program.end_date}`);
      console.log(`Current Company: ${company ? company.name : 'NONE'}`);
      console.log(`Program ID: ${program.program_id}`);
      console.log(`Company ID: ${program.company_id || 'NULL'}`);

      // Ask if reassignment is needed
      const shouldReassign = await question(`\nReassign this program to a different company? (y/n): `);

      if (shouldReassign.toLowerCase() === 'y' || shouldReassign.toLowerCase() === 'yes') {
        console.log('\nSelect new company:');
        companies.forEach((c, idx) => {
          console.log(`  ${idx + 1}. ${c.name}`);
        });

        const companyChoice = await question('Enter company number (or press Enter to skip): ');
        const choiceNum = parseInt(companyChoice);

        if (choiceNum >= 1 && choiceNum <= companies.length) {
          const newCompany = companies[choiceNum - 1];
          console.log(`\nReassigning "${program.name}" to "${newCompany.name}"...`);

          // Update the program
          const { error: updateError } = await supabase
            .from('pilot_programs')
            .update({ company_id: newCompany.company_id })
            .eq('program_id', program.program_id);

          if (updateError) {
            console.error(`❌ Error updating program: ${updateError.message}`);
          } else {
            console.log(`✅ Successfully reassigned to ${newCompany.name}`);

            // Also need to update related data
            console.log('   Updating related sites...');
            const { error: sitesError } = await supabase
              .from('sites')
              .update({ company_id: newCompany.company_id })
              .eq('program_id', program.program_id);

            if (sitesError) {
              console.error(`   ⚠️  Error updating sites: ${sitesError.message}`);
            } else {
              console.log('   ✅ Sites updated');
            }

            console.log('   Updating related submissions...');
            const { error: submissionsError } = await supabase
              .from('submissions')
              .update({ company_id: newCompany.company_id })
              .eq('program_id', program.program_id);

            if (submissionsError) {
              console.error(`   ⚠️  Error updating submissions: ${submissionsError.message}`);
            } else {
              console.log('   ✅ Submissions updated');
            }
          }
        } else {
          console.log('Skipped.');
        }
      }
    }

    // Summary
    console.log('\n=== Final Summary ===');
    const { data: finalPrograms } = await supabase
      .from('pilot_programs')
      .select('program_id, name, company_id');

    for (const company of companies) {
      const count = finalPrograms.filter(p => p.company_id === company.company_id).length;
      console.log(`${company.name}: ${count} programs`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
  }
}

listAndReassignPrograms().then(() => {
  console.log('\n=== Complete ===\n');
  process.exit(0);
});
