import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Query to check existing enum types
const query = `
SELECT 
  t.typname as enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN ('user_role', 'export_rights', 'user_role_enum')
GROUP BY t.typname
ORDER BY t.typname;
`;

console.log('Checking for existing enum types...\n');

const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });

if (error) {
  console.log('Cannot query enums directly, checking users table schema...');
  
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
    .limit(1);
  
  if (!usersError && users && users.length > 0) {
    console.log('\nUsers table columns:');
    console.log(Object.keys(users[0]));
  }
} else {
  console.log('Existing enum types:');
  console.log(data);
}

process.exit(0);
