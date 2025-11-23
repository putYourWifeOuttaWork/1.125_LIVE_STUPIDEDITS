#!/usr/bin/env node
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

// Get all triggers on device_telemetry
const triggerQuery = `
  SELECT
    t.tgname as trigger_name,
    p.proname as function_name,
    pg_get_triggerdef(t.oid) as trigger_def
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_proc p ON t.tgfoid = p.oid
  WHERE c.relname = 'device_telemetry'
    AND NOT t.tgisinternal;
`;

const result = await client.query(triggerQuery);

console.log('\n📋 Triggers on device_telemetry table:\n');
result.rows.forEach(row => {
  console.log(`Trigger: ${row.trigger_name}`);
  console.log(`Function: ${row.function_name}`);
  console.log(`Definition: ${row.trigger_def}`);
  console.log('---\n');
});

// Get the function source that uses format()
const formatFuncQuery = `
  SELECT
    p.proname,
    pg_get_functiondef(p.oid) as source
  FROM pg_proc p
  WHERE pg_get_functiondef(p.oid) LIKE '%format(%'
    AND p.proname LIKE '%telemetry%';
`;

const formatResult = await client.query(formatFuncQuery);

if (formatResult.rows.length > 0) {
  console.log('\n🔍 Functions with format() that mention telemetry:\n');
  formatResult.rows.forEach(row => {
    console.log(`Function: ${row.proname}`);
    console.log(`Source:\n${row.source}`);
    console.log('---\n');
  });
}

await client.end();
