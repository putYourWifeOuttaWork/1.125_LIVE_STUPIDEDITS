#!/usr/bin/env node

/**
 * Apply Junction Tables Migration
 * This script applies the critical 20251108120000_add_junction_tables_and_codes.sql migration
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseServiceKey) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY not found in environment');
  console.error('   This migration requires service role access to modify schema');
  console.error('');
  console.error('   Please add to your .env file:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  console.error('');
  console.error('   You can find this key in your Supabase Dashboard:');
  console.error('   Settings → API → service_role key (secret)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║   Applying Junction Tables Migration                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('⚠️  IMPORTANT: This migration will:');
console.log('   1. Add device_code column to devices table');
console.log('   2. Add site_code column to sites table');
console.log('   3. Create device_site_assignments junction table');
console.log('   4. Create device_program_assignments junction table');
console.log('   5. Create site_program_assignments junction table');
console.log('   6. Migrate existing device/site relationships to junction tables');
console.log('   7. Set up RLS policies for all new tables\n');

async function applyMigration() {
  try {
    // Read the migration file
    const migrationPath = join(__dirname, 'supabase', 'migrations', '20251108120000_add_junction_tables_and_codes.sql');
    console.log(`📄 Reading migration file: ${migrationPath}\n`);

    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('⚙️  Executing migration...\n');

    // Note: Supabase JS client doesn't support raw SQL execution
    // We need to use the REST API or rpc method
    console.log('❌ ERROR: Cannot apply migration via JavaScript client');
    console.log('');
    console.log('📋 MANUAL STEPS REQUIRED:');
    console.log('');
    console.log('1. Go to your Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new');
    console.log('');
    console.log('2. Copy the contents of this file:');
    console.log('   supabase/migrations/20251108120000_add_junction_tables_and_codes.sql');
    console.log('');
    console.log('3. Paste into the SQL Editor and click "Run"');
    console.log('');
    console.log('4. After successful execution, run:');
    console.log('   node verify-schema-complete.mjs');
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   ALTERNATIVE: Use Supabase CLI                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('If you have Supabase CLI installed:');
    console.log('  supabase db push');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigration();
