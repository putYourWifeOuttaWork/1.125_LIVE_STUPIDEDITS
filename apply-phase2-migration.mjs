#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying Phase 2: Wake Payload Consolidation Migration\n');
  
  // Read the SQL file
  const sql = readFileSync('supabase/migrations/20251123003453_phase2_wake_payload_consolidation.sql', 'utf8');
  
  console.log('📝 Migration content preview:');
  console.log(sql.substring(0, 500) + '...\n');
  
  console.log('⚠️  This migration will:');
  console.log('  1. Add 5 new columns to device_wake_payloads');
  console.log('  2. Create 2 indexes');
  console.log('  3. Update existing 76 records with wake_type and is_complete');
  console.log('  4. Drop device_wake_sessions table (currently empty)\n');
  
  console.log('Press Ctrl+C to abort, or wait 3 seconds to proceed...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\n✅ Proceeding with migration...\n');
  
  // Execute the migration
  // Note: We can't execute multi-statement SQL directly via Supabase client
  // We'll need to use the Edge Function or split into parts
  
  console.log('⚠️  NOTE: This SQL file needs to be applied via Supabase Dashboard or CLI');
  console.log('         Supabase JS client cannot execute multi-statement SQL files.\n');
  console.log('📋 To apply this migration:');
  console.log('   1. Go to Supabase Dashboard → SQL Editor');
  console.log('   2. Paste the contents of:');
  console.log('      supabase/migrations/20251123003453_phase2_wake_payload_consolidation.sql');
  console.log('   3. Run the migration');
  console.log('\nOR use the Supabase CLI:');
  console.log('   supabase db push');
}

applyMigration();
