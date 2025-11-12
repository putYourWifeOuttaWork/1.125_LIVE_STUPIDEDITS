/**
 * Apply Phase 1 Migrations
 *
 * Applies all Phase 1 migrations:
 * - Telemetry, Zones, and Alerts
 * - RPC functions for alert preferences
 * - MGI scoring and velocity
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   - VITE_SUPABASE_URL or SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const migrations = [
  {
    name: 'Phase 1 - Telemetry, Zones, Alerts',
    file: 'supabase/migrations/20251113000000_phase1_telemetry_zones_alerts.sql'
  },
  {
    name: 'Phase 1 - RPC Alert Preferences',
    file: 'supabase/migrations/20251113000001_rpc_alert_prefs.sql'
  },
  {
    name: 'Phase 1 - MGI Scoring & Velocity',
    file: 'supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql'
  }
];

async function applyMigration(migration) {
  console.log(`\n📋 Applying: ${migration.name}`);
  console.log(`   File: ${migration.file}`);

  try {
    const sql = readFileSync(migration.file, 'utf8');

    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      // Try direct execution if exec_sql doesn't exist
      const { error: directError } = await supabase.from('_migrations').insert({
        name: migration.name,
        executed_at: new Date().toISOString()
      });

      // Execute SQL directly via REST API
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        },
        body: JSON.stringify({ sql_string: sql })
      });

      if (!response.ok) {
        throw new Error(`Failed to execute migration: ${await response.text()}`);
      }
    }

    console.log(`✅ ${migration.name} applied successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error applying ${migration.name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying Phase 1 Migrations');
  console.log('================================\n');

  let successCount = 0;
  let failCount = 0;

  for (const migration of migrations) {
    const success = await applyMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n================================');
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Please apply them manually via Supabase SQL Editor:');
    console.log('   1. Go to https://supabase.com/dashboard/project/[project-id]/sql');
    console.log('   2. Copy and paste each migration file content');
    console.log('   3. Click "Run"');
  } else {
    console.log('\n🎉 All Phase 1 migrations applied successfully!');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
