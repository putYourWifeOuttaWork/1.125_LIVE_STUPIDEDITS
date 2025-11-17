/*
  # Midnight Jobs Edge Function

  Runs daily at midnight to:
  1. Create new device sessions for the day
  2. Lock expired sessions from previous days

  This function combines:
  - auto_create_daily_sessions() - Creates new sessions
  - lock_all_expired_sessions() - Locks old sessions

  Scheduling:
  - Call via external cron service (cron-job.org, etc.)
  - Schedule: 0 0 * * * (midnight UTC)
  - URL: https://YOUR_PROJECT.supabase.co/functions/v1/midnight_jobs
  - Header: Authorization: Bearer SERVICE_ROLE_KEY
*/

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results = {
    success: true,
    executed_at: new Date().toISOString(),
    session_creation: null as any,
    session_locking: null as any,
    errors: [] as string[],
  };

  try {
    console.log('🌙 Midnight Jobs: Starting execution');

    // ==========================================
    // JOB 1: Lock Expired Sessions
    // ==========================================
    console.log('🔒 Job 1: Locking expired sessions...');

    const { data: lockData, error: lockError } = await supabase.rpc('lock_all_expired_sessions');

    if (lockError) {
      console.error('❌ Error locking sessions:', lockError.message);
      results.errors.push(`Lock sessions: ${lockError.message}`);
      results.session_locking = { error: lockError.message };
    } else {
      console.log('✅ Sessions locked:', lockData);
      results.session_locking = lockData;
    }

    // ==========================================
    // JOB 2: Create New Sessions
    // ==========================================
    console.log('📝 Job 2: Creating new device sessions...');

    const { data: createData, error: createError } = await supabase.rpc('auto_create_daily_sessions');

    if (createError) {
      console.error('❌ Error creating sessions:', createError.message);
      results.errors.push(`Create sessions: ${createError.message}`);
      results.session_creation = { error: createError.message };
    } else {
      console.log('✅ Sessions created:', createData);
      results.session_creation = createData;
    }

    // ==========================================
    // Final Status
    // ==========================================
    if (results.errors.length > 0) {
      results.success = false;
    }

    console.log('🌙 Midnight Jobs: Complete', {
      success: results.success,
      errors: results.errors.length,
    });

    return new Response(JSON.stringify(results), {
      status: results.success ? 200 : 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('💥 Fatal error in midnight_jobs:', err);

    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        executed_at: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
