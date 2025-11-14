import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔍 Checking Enum Values and Constraints\n');
console.log('='.repeat(70));

// Check airflow_enum
console.log('\n1️⃣ airflow_enum values:\n');
const airflowQuery = `
  SELECT enumlabel
  FROM pg_enum
  WHERE enumtypid = 'airflow_enum'::regtype
  ORDER BY enumsortorder;
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: airflowQuery });
  if (error) throw error;
  data?.forEach(row => console.log('   -', row.enumlabel));
} catch (e) {
  console.log('   Error:', e.message);
}

// Check odor_distance_enum
console.log('\n2️⃣ odor_distance_enum values:\n');
const odorQuery = `
  SELECT enumlabel
  FROM pg_enum
  WHERE enumtypid = 'odor_distance_enum'::regtype
  ORDER BY enumsortorder;
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: odorQuery });
  if (error) throw error;
  data?.forEach(row => console.log('   -', row.enumlabel));
} catch (e) {
  console.log('   Error:', e.message);
}

// Check weather_enum
console.log('\n3️⃣ weather_enum values:\n');
const weatherQuery = `
  SELECT enumlabel
  FROM pg_enum
  WHERE enumtypid = 'weather_enum'::regtype
  ORDER BY enumsortorder;
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: weatherQuery });
  if (error) throw error;
  data?.forEach(row => console.log('   -', row.enumlabel));
} catch (e) {
  console.log('   Error:', e.message);
}

// Check submissions constraints
console.log('\n4️⃣ submissions table check constraints:\n');
const constraintQuery = `
  SELECT conname, pg_get_constraintdef(oid) as definition
  FROM pg_constraint
  WHERE conrelid = 'submissions'::regclass
    AND contype = 'c';
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: constraintQuery });
  if (error) throw error;
  data?.forEach(row => {
    console.log(`   ${row.conname}:`);
    console.log(`   ${row.definition}\n`);
  });
} catch (e) {
  console.log('   Error:', e.message);
}

console.log('='.repeat(70));

process.exit(0);
