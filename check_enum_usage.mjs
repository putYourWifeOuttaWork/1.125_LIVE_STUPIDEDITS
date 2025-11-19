import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkEnumUsage() {
  console.log('🔍 Checking for functions/triggers using wrong enum value...\n');

  // Get all functions that might reference device_event_category
  const { data: functions, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND pg_get_functiondef(p.oid) ILIKE '%device_event_category%'
      ORDER BY p.proname;
    `
  }).catch(err => {
    // Try alternative query
    return supabase.rpc('exec_sql', {
      sql: `
        SELECT routine_name, routine_definition 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
          AND routine_type = 'FUNCTION'
          AND routine_definition ILIKE '%device_event_category%';
      `
    });
  });

  if (error) {
    console.error('Error querying functions:', error);
    
    // Try to get trigger functions directly
    console.log('\n🔧 Checking trigger on devices table...');
    const { data: triggers } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT tgname, pg_get_triggerdef(oid) 
        FROM pg_trigger 
        WHERE tgrelid = 'devices'::regclass;
      `
    }).catch(() => ({ data: null }));
    
    if (triggers) {
      console.log('Triggers on devices table:', triggers);
    }
  }

  console.log('Functions found:', functions?.length || 0);
  if (functions?.length > 0) {
    functions.forEach(f => {
      console.log(`\n📋 ${f.function_name}:`);
      if (f.definition?.includes("'configuration'") || f.definition?.includes('"configuration"')) {
        console.log('   ⚠️  USES WRONG ENUM VALUE: "configuration"');
      }
    });
  }
}

checkEnumUsage().catch(console.error);
