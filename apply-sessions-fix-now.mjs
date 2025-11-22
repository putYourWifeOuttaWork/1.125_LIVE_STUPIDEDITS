#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🔧 Fixing ambiguous column reference in get_my_active_sessions_unified()...\n');

const sql = `
CREATE OR REPLACE FUNCTION get_my_active_sessions_unified()
RETURNS TABLE (
  session_id UUID,
  session_type TEXT,
  session_date DATE,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  company_id UUID,
  company_name TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  claimed_by_user_id UUID,
  claimed_by_name TEXT,
  expected_items INT,
  completed_items INT,
  progress_percent NUMERIC,
  session_metadata JSONB
) AS $function$
DECLARE
  v_user_company_id UUID;
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT u.company_id, u.is_super_admin
  INTO v_user_company_id, v_is_super_admin
  FROM users u
  WHERE u.id = auth.uid();

  IF v_is_super_admin THEN
    SELECT active_company_id
    INTO v_user_company_id
    FROM user_active_company_context
    WHERE user_id = auth.uid();

    IF v_user_company_id IS NULL THEN
      RETURN QUERY SELECT * FROM get_all_active_sessions_unified(NULL);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM get_all_active_sessions_unified(v_user_company_id);
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;
`;

try {
  // Use fetch to call Supabase REST API directly for DDL
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    // Try alternative: Use SQL Editor endpoint
    console.log('📝 Applying via SQL query...\n');

    const { data: existingFunc, error: checkError } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'get_my_active_sessions_unified')
      .single();

    console.log('Current function exists:', !checkError);

    // The fix: Just update the view
    console.log('\n✅ SQL to apply manually in Supabase SQL Editor:');
    console.log('='.repeat(60));
    console.log(sql);
    console.log('='.repeat(60));
    console.log('\n📋 Instructions:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Create a new query');
    console.log('3. Copy and paste the SQL above');
    console.log('4. Click "Run"');
    console.log('\n✅ This will fix the ambiguous column error.');

  } else {
    console.log('✅ Function updated successfully!');
  }

} catch (error) {
  console.error('ℹ️  Auto-apply not available. Please apply manually:\n');
  console.log('='.repeat(60));
  console.log(sql);
  console.log('='.repeat(60));
}
