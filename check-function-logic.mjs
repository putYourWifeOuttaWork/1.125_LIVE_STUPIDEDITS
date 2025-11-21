import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.VITE_SUPABASE_DB_URL;

const client = new pg.Client({ connectionString });
await client.connect();

console.log('🔍 Checking function definition in database...\n');

const result = await client.query(`
  SELECT 
    pg_get_functiondef(p.oid) as definition
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'generate_session_wake_snapshot'
    AND n.nspname = 'public'
`);

if (result.rows.length === 0) {
  console.log('❌ Function not found!');
} else {
  const def = result.rows[0].definition;
  
  // Check for the problematic patterns
  if (def.includes("DATE_PART('day'")) {
    console.log('❌ Function still uses DATE_PART (old version)');
    console.log('\nLine with DATE_PART:');
    const lines = def.split('\n');
    lines.forEach((line, i) => {
      if (line.includes("DATE_PART('day'")) {
        console.log('  Line', i+1, ':', line.trim());
      }
    });
  } else if (def.includes('EXTRACT(EPOCH FROM')) {
    console.log('✅ Function uses EXTRACT(EPOCH FROM ...) (new version)');
  } else {
    console.log('⚠️  Cannot determine version');
  }
  
  // Show the relevant section
  console.log('\nProgram day calculation:');
  const lines = def.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('program_day') || line.includes('total_days')) {
      console.log('  Line', i+1, ':', line.trim());
    }
  });
}

await client.end();
