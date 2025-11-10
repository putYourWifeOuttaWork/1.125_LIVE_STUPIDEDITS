#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('Applying lab view timezone fix...\n');

  const sql = readFileSync('./supabase/migrations/20251110190000_fix_lab_views_timezone.sql', 'utf8');

  // Extract just the CREATE VIEW statement (skip the comment block)
  const viewSQL = sql.split('CREATE OR REPLACE VIEW')[1];
  const fullSQL = 'CREATE OR REPLACE VIEW' + viewSQL;

  try {
    // Execute using raw SQL via the REST API
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: fullSQL })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('✓ View updated successfully');
    console.log('\nChanges:');
    console.log('- vw_site_day_sessions now uses actual timezone from sites table');
    console.log('- Falls back to UTC if timezone is null');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.log('\nPlease apply this SQL manually via Supabase dashboard:');
    console.log('\n' + fullSQL);
  }
}

applyMigration().then(() => process.exit(0));
