#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: companies } = await supabase.from('companies').select('*');
  console.log('\nCompanies:', JSON.stringify(companies, null, 2));

  const { data: programs } = await supabase.from('pilot_programs').select('*');
  console.log('\nPrograms:', JSON.stringify(programs, null, 2));
}

check();
