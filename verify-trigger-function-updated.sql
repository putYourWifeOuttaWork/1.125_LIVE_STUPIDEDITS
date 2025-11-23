-- Verify that populate_device_data_company_id() has the TRY-EXCEPT blocks

SELECT
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_source
FROM pg_proc p
WHERE p.proname = 'populate_device_data_company_id';

-- Count how many "EXCEPTION WHEN undefined_column" blocks exist
-- Should be 4 (one for each column check)
SELECT
  (pg_get_functiondef(p.oid) LIKE '%EXCEPTION WHEN undefined_column%') as has_exception_handling,
  (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'EXCEPTION WHEN undefined_column', ''))) / length('EXCEPTION WHEN undefined_column') as exception_count
FROM pg_proc p
WHERE p.proname = 'populate_device_data_company_id';
