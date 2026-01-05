import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyFunction() {
  console.log('🔍 Checking database connection...\n');

  try {
    // Read the SQL file
    const sql = readFileSync('./APPLY_GET_USER_COMPANY_FUNCTION.sql', 'utf-8');

    // Extract the CREATE FUNCTION statement
    const createFunctionSQL = sql
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .split('\n')
      .filter(line => !line.trim().startsWith('--')) // Remove single-line comments
      .join('\n')
      .split('-- Test the function')[0] // Remove test section
      .trim();

    console.log('📝 Creating get_user_company() function...\n');

    // Use the Supabase Admin API to execute raw SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ query: createFunctionSQL })
    });

    // Alternative: Execute via direct query using Supabase client
    // Since Supabase doesn't expose a direct SQL execution endpoint,
    // we'll use a workaround by calling from_sql if available

    // For now, let's create via migration approach
    console.log('⚠️  Direct SQL execution not available via Supabase JS client.');
    console.log('📋 Please apply the SQL manually:\n');
    console.log('1. Go to your Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the SQL from APPLY_GET_USER_COMPANY_FUNCTION.sql');
    console.log('4. Click "Run" to execute\n');

    console.log('Alternatively, here\'s the SQL to apply:\n');
    console.log('─'.repeat(80));
    console.log(createFunctionSQL);
    console.log('─'.repeat(80));
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyFunction().catch(console.error);
