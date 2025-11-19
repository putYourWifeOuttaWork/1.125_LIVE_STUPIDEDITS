-- Check NOT NULL constraints on devices table
SELECT
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END AS nullable,
  pg_get_expr(ad.adbin, ad.adrelid) AS default_value
FROM pg_attribute a
LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
WHERE a.attrelid = 'devices'::regclass
AND a.attnum > 0
AND NOT a.attisdropped
ORDER BY a.attnum;
