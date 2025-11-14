import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔧 Applying Session Creation Fix\n');
console.log('='.repeat(70));

// Read the SQL file
const sql = readFileSync('./fix-session-creation-complete.sql', 'utf8');

console.log('\n1️⃣ Reading fix-session-creation-complete.sql...');
console.log(`   Found ${sql.split('\n').length} lines\n`);

// Split into individual statements (rough split on semicolons outside of $$ blocks)
const statements = [];
let current = '';
let inDollarQuote = false;

for (const line of sql.split('\n')) {
  current += line + '\n';

  // Track $$ blocks
  if (line.includes('$$')) {
    inDollarQuote = !inDollarQuote;
  }

  // If we hit a semicolon outside of $$ blocks, that's a statement boundary
  if (line.trim().endsWith(';') && !inDollarQuote && !line.trim().startsWith('--')) {
    statements.push(current.trim());
    current = '';
  }
}

console.log(`2️⃣ Split into ${statements.length} SQL statements\n`);

// Apply each statement
let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];

  // Skip comments and empty statements
  if (!stmt || stmt.startsWith('/*') || stmt.startsWith('--')) {
    continue;
  }

  // Get a preview of the statement
  const preview = stmt.substring(0, 80).replace(/\n/g, ' ').trim();

  process.stdout.write(`   [${i + 1}/${statements.length}] ${preview}...`);

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: stmt });

    if (error) {
      // Check if it's a benign error (like "already exists")
      if (error.message.includes('already exists') ||
          error.message.includes('does not exist') ||
          error.message.includes('duplicate')) {
        process.stdout.write(' ⚠️ (already applied)\n');
        successCount++;
      } else {
        process.stdout.write(` ❌\n      Error: ${error.message}\n`);
        errorCount++;
      }
    } else {
      process.stdout.write(' ✅\n');
      successCount++;
    }
  } catch (e) {
    process.stdout.write(` ❌\n      Exception: ${e.message}\n`);
    errorCount++;
  }
}

console.log('\n' + '='.repeat(70));
console.log('\n📊 Migration Summary:\n');
console.log(`   ✅ Success: ${successCount}`);
console.log(`   ❌ Errors: ${errorCount}`);
console.log(`   📝 Total: ${statements.length}\n`);

if (errorCount === 0) {
  console.log('🎉 All fixes applied successfully!\n');
  console.log('3️⃣ Testing auto_create_daily_sessions()...\n');

  const { data, error } = await supabase.rpc('auto_create_daily_sessions');

  if (error) {
    console.log('❌ Test failed:', error.message);
  } else {
    console.log('✅ Test successful!\n');
    console.log('Result:', JSON.stringify(data, null, 2));
  }
} else {
  console.log('⚠️  Some statements failed. Please review errors above.\n');
}

console.log('='.repeat(70));

process.exit(errorCount === 0 ? 0 : 1);
