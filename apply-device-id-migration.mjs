import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function applySQLStatements() {
  console.log('Applying device_id migration to petri_observations...\n');

  // Step 1: Add column
  console.log('Step 1: Adding device_id column...');
  const addColumn = `
    ALTER TABLE petri_observations
    ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(device_id) ON DELETE CASCADE;
  `;
  
  const { error: addError } = await supabase.rpc('exec_sql', { sql_query: addColumn });
  if (addError && !addError.message.includes('already exists')) {
    console.error('Error adding column:', addError);
  } else {
    console.log('Success: Column added or already exists\n');
  }

  // Step 2: Backfill from submissions
  console.log('Step 2: Backfilling device_id from submissions...');
  const backfill = `
    UPDATE petri_observations po
    SET device_id = sub.created_by_device_id
    FROM submissions sub
    WHERE po.submission_id = sub.submission_id
    AND po.device_id IS NULL
    AND sub.created_by_device_id IS NOT NULL;
  `;
  
  const { error: backfillError } = await supabase.rpc('exec_sql', { sql_query: backfill });
  if (backfillError) {
    console.error('Error backfilling:', backfillError);
  } else {
    console.log('Success: Backfilled device_id values\n');
  }

  // Step 3: Create indexes
  console.log('Step 3: Creating indexes...');
  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_petri_observations_device_mgi
    ON petri_observations(device_id, captured_at DESC)
    WHERE mgi_score IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_petri_observations_device_captured
    ON petri_observations(device_id, captured_at DESC);
  `;
  
  const { error: indexError } = await supabase.rpc('exec_sql', { sql_query: createIndexes });
  if (indexError) {
    console.error('Error creating indexes:', indexError);
  } else {
    console.log('Success: Indexes created\n');
  }

  // Verify
  console.log('Verification: Checking results...');
  const { data: stats } = await supabase
    .from('petri_observations')
    .select('device_id', { count: 'exact', head: true });

  console.log('Migration completed!\n');
  console.log('Next: Run test-mgi-visualization.mjs to create test data');
}

applySQLStatements().catch(console.error);
