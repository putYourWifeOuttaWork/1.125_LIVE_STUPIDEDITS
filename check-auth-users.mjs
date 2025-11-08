import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkAuthUsers() {
  console.log('\n=== Checking auth.users vs public.users Sync ===\n');

  // Get Matt's record from public.users table
  const { data: publicUser, error: publicError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'matt@grmtek.com')
    .maybeSingle();

  if (publicError) {
    console.error('Error fetching from public.users:', publicError);
    return;
  }

  if (!publicUser) {
    console.log('❌ Matt not found in public.users table');
    return;
  }

  console.log('✅ public.users record:');
  console.log('  - ID:', publicUser.id);
  console.log('  - Email:', publicUser.email);
  console.log('  - Company ID:', publicUser.company_id);
  console.log('  - Is Company Admin:', publicUser.is_company_admin);

  // Use admin API to check auth.users
  const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('\nError fetching auth.users:', authError);
    return;
  }

  const mattAuthUser = authUsers.find(u => u.email === 'matt@grmtek.com');

  if (!mattAuthUser) {
    console.log('\n❌ Matt not found in auth.users table');
    return;
  }

  console.log('\n✅ auth.users record:');
  console.log('  - ID:', mattAuthUser.id);
  console.log('  - Email:', mattAuthUser.email);
  console.log('  - Created:', mattAuthUser.created_at);

  // Compare IDs
  console.log('\n=== ID Comparison ===');
  if (publicUser.id === mattAuthUser.id) {
    console.log('✅ IDs MATCH - This is good!');
    console.log('   Both tables have ID:', publicUser.id);
  } else {
    console.log('❌ IDs DO NOT MATCH - This is the problem!');
    console.log('   public.users ID:', publicUser.id);
    console.log('   auth.users ID:  ', mattAuthUser.id);
    console.log('\n💡 SOLUTION: Update public.users to match auth.users ID');
  }

  // List all users to see the situation
  console.log('\n=== All Users Comparison ===');
  const { data: allPublicUsers } = await supabase
    .from('users')
    .select('id, email, company_id, is_company_admin');

  console.log('\nPublic Users:', allPublicUsers?.length || 0);
  allPublicUsers?.forEach(u => {
    const authMatch = authUsers.find(au => au.email === u.email);
    const match = authMatch && authMatch.id === u.id ? '✅' : '❌';
    console.log(`  ${match} ${u.email}: public=${u.id.substring(0, 8)}, auth=${authMatch ? authMatch.id.substring(0, 8) : 'NOT FOUND'}`);
  });
}

checkAuthUsers().catch(console.error);
