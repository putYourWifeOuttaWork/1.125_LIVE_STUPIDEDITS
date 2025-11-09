import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Checking current user_role and export_rights values...\n');

const { data: users, error } = await supabase
  .from('users')
  .select('user_role, export_rights, email')
  .limit(5);

if (error) {
  console.error('Error:', error.message);
} else {
  console.log('Sample user data:');
  console.log(users);
  
  // Try to insert a test value
  console.log('\nTrying to check enum constraints...');
}

process.exit(0);
