-- Create an edge function scheduler for session expiration
-- This migration adds the metadata for the scheduled task

-- Notification type for session expiration
INSERT INTO supabase_functions.hooks (hook_table_id, hook_name, hook_function_id, hook_definition_id)
VALUES
  (
    gen_random_uuid(),
    'expire_sessions',
    (SELECT function_id FROM supabase_functions.functions WHERE name = 'expire_sessions'),
    (SELECT definition_id FROM supabase_functions.hook_definitions WHERE name = 'CRON')
  )
ON CONFLICT DO NOTHING;

-- If you're using Supabase directly, you'd create a scheduled Edge Function:
-- This would run at 11:59 PM every day in your application's primary timezone

/*
Example JavaScript edge function code (to be deployed separately):

export async function expire_sessions() {
  // Connect to the database
  const { data, error } = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/expire_incomplete_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  }).then(res => res.json());

  if (error) {
    console.error('Failed to expire sessions:', error);
    return { success: false, error };
  }

  // Now clean up incomplete observations
  const { data: cleanupData, error: cleanupError } = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/cleanup_incomplete_observations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  }).then(res => res.json());

  if (cleanupError) {
    console.error('Failed to clean up observations:', cleanupError);
    return { success: false, error: cleanupError };
  }

  return { 
    success: true, 
    expired: data, 
    cleanup: cleanupData 
  };
}
*/

-- Since we can't create the actual function in a migration, we'll just add a placeholder comment
COMMENT ON FUNCTION expire_incomplete_sessions IS 
'This function should be called by a scheduled Edge Function at 11:59 PM to expire sessions that are still open from the current day.';

COMMENT ON FUNCTION cleanup_incomplete_observations IS 
'This function should be called by a scheduled Edge Function after expiring sessions to clean up incomplete observations.';