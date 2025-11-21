import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔄 Applying connectivity tracking migration...\n');

// Read the SQL file
const sql = readFileSync('./add-connectivity-tracking.sql', 'utf8');

// Split into individual statements (rough split on CREATE/COMMENT)
const statements = sql
  .split(/(?=CREATE|COMMENT ON|GRANT)/g)
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

let successCount = 0;
let errorCount = 0;
const errors = [];

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];
  const preview = statement.substring(0, 80).replace(/\n/g, ' ');

  process.stdout.write(`  ${i + 1}/${statements.length}: ${preview}... `);

  const { error } = await supabase.rpc('exec_sql', {
    sql_query: statement
  }).catch(err => ({ error: err }));

  if (error) {
    console.log('❌ FAILED');
    console.log(`     Error: ${error.message || error}`);
    errors.push({ statement: preview, error: error.message || String(error) });
    errorCount++;
  } else {
    console.log('✅');
    successCount++;
  }
}

console.log(`\n📊 Results:`);
console.log(`   ✅ Success: ${successCount}`);
console.log(`   ❌ Errors: ${errorCount}`);

if (errors.length > 0) {
  console.log(`\n⚠️  Errors encountered:`);
  errors.forEach((e, i) => {
    console.log(`   ${i + 1}. ${e.statement}`);
    console.log(`      ${e.error}`);
  });
}

if (errorCount === 0) {
  console.log(`\n🎉 Connectivity tracking migration applied successfully!`);
  console.log(`   - 4 new functions created`);
  console.log(`   - generate_session_wake_snapshot updated with connectivity`);
  console.log(`\n   Next: Run regenerate-snapshots-with-locf.mjs`);
} else {
  console.log(`\n⚠️  Migration completed with errors. Check above for details.`);
}
