#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function setup() {
  const { data: companies } = await supabase.from('companies').select('company_id, name').limit(1);
  const companyId = companies[0].company_id;
  console.log('Company:', companies[0].name);

  const { data: programs } = await supabase.from('pilot_programs').select('*').eq('company_id', companyId);

  if (!programs || programs.length === 0) {
    console.log('Creating test program...');
    const { data: newProgram, error } = await supabase
      .from('pilot_programs')
      .insert({
        company_id: companyId,
        program_name: 'Lab Testing Program',
        program_description: 'Program for testing Lab UI features',
        start_date: '2025-11-01',
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Created program:', newProgram.program_name);
    }
  } else {
    console.log('Program already exists:', programs[0].program_name);
  }
}

setup();
