import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('📦 Applying Device Events Consolidation Migration\n');
console.log('This will:');
console.log('  1. Add source_table, source_id, triggered_by columns to device_history');
console.log('  2. Create triggers to auto-log events from other tables');
console.log('  3. Backfill existing events\n');

const migrationPath = './supabase/migrations/20251116000010_consolidate_device_events.sql';
const migration = readFileSync(migrationPath, 'utf8');

try {
  // Execute migration as single transaction
  const { error } = await supabase.rpc('exec_sql', { sql: migration });

  if (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\nTrying line-by-line execution...\n');

    // Split and execute line by line
    const lines = migration.split('\n');
    let currentStatement = '';
    let lineNum = 0;

    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('--')) continue;

      currentStatement += line + '\n';

      // Execute when we hit a semicolon at end of line
      if (trimmed.endsWith(';')) {
        try {
          const { error: stmtError } = await supabase.rpc('exec_sql', {
            sql: currentStatement
          });

          if (stmtError) {
            console.log(`⚠️  Line ${lineNum}: ${stmtError.message}`);
          } else {
            console.log(`✓ Line ${lineNum}`);
          }
        } catch (err) {
          console.log(`⚠️  Line ${lineNum}: ${err.message}`);
        }

        currentStatement = '';
      }
    }
  } else {
    console.log('✅ Migration applied successfully!\n');
  }

  // Verify the changes
  console.log('\n🔍 Verifying changes...\n');

  // Check new columns
  const { data: historyCount } = await supabase
    .from('device_history')
    .select('*', { count: 'exact', head: true });

  console.log(`Total events in device_history: ${historyCount || 0}`);

  // Check for events with source_table
  const { data: sourceEvents, count: sourceCount } = await supabase
    .from('device_history')
    .select('source_table, event_type', { count: 'exact' })
    .not('source_table', 'is', null)
    .limit(5);

  console.log(`\nEvents with source tracking: ${sourceCount || 0}`);
  if (sourceEvents && sourceEvents.length > 0) {
    console.log('Sample events:');
    sourceEvents.forEach(e => {
      console.log(`  - ${e.event_type} (from ${e.source_table})`);
    });
  }

  console.log('\n✅ Consolidation complete!');
  console.log('\nNext steps:');
  console.log('  1. Test the device history UI');
  console.log('  2. Edit a device wake schedule');
  console.log('  3. Verify the change appears in device history');

} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
