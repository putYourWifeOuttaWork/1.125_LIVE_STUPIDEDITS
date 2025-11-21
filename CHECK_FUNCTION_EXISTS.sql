-- Check if the function exists and get its definition
SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'generate_session_wake_snapshot'
  AND n.nspname = 'public';
