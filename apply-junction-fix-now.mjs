#!/usr/bin/env node

import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const { Client } = pg;

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');

    // Read the migration SQL
    const sql = readFileSync('/tmp/migration-fix-junction.sql', 'utf8');

    console.log('🚀 Applying Junction Table System Fix Migration...\n');
    console.log('This migration will:');
    console.log('  1. Fix fn_assign_device_to_site to create junction records');
    console.log('  2. Fix fn_remove_device_from_site to deactivate junctions');
    console.log('  3. Create auto-sync triggers');
    console.log('  4. Backfill ~5 devices with missing junction records\n');

    // Execute the full migration
    const result = await client.query(sql);

    console.log('✅ Migration applied successfully!\n');

    // Verify backfill
    const verifyQuery = `
      SELECT COUNT(*) as devices_with_assignments,
             COUNT(dsa.assignment_id) as devices_with_junctions
      FROM devices d
      LEFT JOIN device_site_assignments dsa ON dsa.device_id = d.device_id AND dsa.is_active = true
      WHERE d.site_id IS NOT NULL;
    `;

    const { rows } = await client.query(verifyQuery);
    console.log('📊 Verification:');
    console.log(`   Devices with site_id: ${rows[0].devices_with_assignments}`);
    console.log(`   Devices with junction records: ${rows[0].devices_with_junctions}`);

    if (rows[0].devices_with_assignments === rows[0].devices_with_junctions) {
      console.log('   ✅ All devices have matching junction records!\n');
    } else {
      console.log('   ⚠️  Some devices still missing junction records\n');
    }

    // Check which devices were backfilled
    const backfillCheck = `
      SELECT d.device_code, dsa.notes
      FROM devices d
      JOIN device_site_assignments dsa ON dsa.device_id = d.device_id
      WHERE dsa.notes LIKE '%Backfilled%'
      ORDER BY d.device_code;
    `;

    const { rows: backfilled } = await client.query(backfillCheck);
    if (backfilled.length > 0) {
      console.log(`📦 Backfilled ${backfilled.length} devices:`);
      backfilled.forEach(row => console.log(`   - ${row.device_code}`));
      console.log('');
    }

    console.log('🎉 Migration complete! Junction tables are now source of truth.\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
