-- Find ALL triggers on device_telemetry table
SELECT
  t.tgname as trigger_name,
  p.proname as function_name,
  CASE t.tgtype::integer & 1
    WHEN 1 THEN 'ROW'
    ELSE 'STATEMENT'
  END as trigger_level,
  CASE t.tgtype::integer & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END as trigger_timing,
  CASE
    WHEN t.tgtype::integer & 4 = 4 THEN 'INSERT '
    ELSE ''
  END ||
  CASE
    WHEN t.tgtype::integer & 8 = 8 THEN 'DELETE '
    ELSE ''
  END ||
  CASE
    WHEN t.tgtype::integer & 16 = 16 THEN 'UPDATE '
    ELSE ''
  END as trigger_event,
  pg_get_triggerdef(t.oid) as full_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'device_telemetry'
  AND NOT t.tgisinternal
ORDER BY t.tgname;
