-- Check for ALL versions of this function
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosrc LIKE '%DATE_PART%' as has_old_code,
  p.prosrc LIKE '%EXTRACT(EPOCH FROM%' as has_new_code,
  LENGTH(p.prosrc) as code_length
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'generate_session_wake_snapshot'
  AND n.nspname = 'public';
