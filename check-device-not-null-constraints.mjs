import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking devices table constraints...\n');

// Query to find NOT NULL constraints on devices table
const { data, error } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'devices'
    AND table_schema = 'public'
    ORDER BY ordinal_position;
  `
});

if (error) {
  // Try alternate method
  const query = `
    SELECT
      a.attname as column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
      a.attnotnull as not_null,
      pg_get_expr(ad.adbin, ad.adrelid) as default_value
    FROM pg_attribute a
    LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE a.attrelid = 'devices'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    ORDER BY a.attnum;
  `;
  
  const { data: cols, error: err2 } = await supabase.rpc('exec_sql', { sql: query });
  
  if (err2) {
    console.error('❌ Error:', err2);
    process.exit(1);
  }
  
  console.log('📋 Devices table columns:\n');
  cols.forEach(col => {
    const nullable = col.not_null ? 'NOT NULL' : 'NULL';
    console.log(`  ${col.column_name}: ${col.data_type} (${nullable})`);
    if (col.default_value) {
      console.log(`     DEFAULT: ${col.default_value}`);
    }
  });
} else {
  console.log('📋 Devices table columns:\n');
  data.forEach(col => {
    const nullable = col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL';
    console.log(`  ${col.column_name}: ${col.data_type} (${nullable})`);
    if (col.column_default) {
      console.log(`     DEFAULT: ${col.column_default}`);
    }
  });
}
