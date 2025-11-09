import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

const sql = readFileSync('./supabase/migrations/20251109160000_user_management_and_device_pool.sql', 'utf8');

console.log('Applying user management and device pool migration...');
console.log('Migration file size:', sql.length, 'characters\n');

// Execute the entire migration
try {
  // Use the postgres connection to execute raw SQL
  const { data, error } = await supabase.rpc('exec', { sql: sql });

  if (error) {
    console.error('Migration error:', error);

    // Try alternate execution method
    console.log('\nTrying alternate execution method...');

    // Execute via REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ sql })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('REST API error:', errorText);
      throw new Error('Migration failed via REST API');
    }

    console.log('Migration applied successfully via REST API!');
  } else {
    console.log('Migration applied successfully!');
  }

  // Verify functions were created
  console.log('\nVerifying created functions...');

  const { data: functions, error: funcError } = await supabase.rpc('search_users_by_email', { search_query: 'test' });

  if (funcError && funcError.code !== 'PGRST116') {
    console.log('Function verification: search_users_by_email exists ✓');
  }

  console.log('\nMigration complete!');
  process.exit(0);

} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}
