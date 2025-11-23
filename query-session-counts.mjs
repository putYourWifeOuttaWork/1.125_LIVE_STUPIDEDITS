import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const client = new pg.Client({ connectionString: process.env.VITE_SUPABASE_DB_URL });
await client.connect();
const res = await client.query(`
  SELECT 
    s.session_id,
    s.session_date,
    s.site_id,
    s.completed_wake_count AS stored_complete,
    s.failed_wake_count AS stored_failed,
    s.extra_wake_count AS stored_extra,
    COUNT(*) FILTER (WHERE p.payload_status = 'complete' AND p.overage_flag = false) AS actual_complete,
    COUNT(*) FILTER (WHERE p.payload_status = 'failed') AS actual_failed,
    COUNT(*) FILTER (WHERE p.overage_flag = true) AS actual_extra,
    COUNT(*) AS total_payloads
  FROM site_device_sessions s
  LEFT JOIN device_wake_payloads p ON p.site_device_session_id = s.session_id
  WHERE s.session_date >= CURRENT_DATE - INTERVAL '2 days'
  GROUP BY s.session_id, s.session_date, s.site_id, s.completed_wake_count, s.failed_wake_count, s.extra_wake_count
  ORDER BY s.session_date DESC
  LIMIT 5
`);
console.log('Session Roll-up Alignment Check:\n');
for (const row of res.rows) {
  const aligned = row.stored_complete == row.actual_complete && row.stored_failed == row.actual_failed && row.stored_extra == row.actual_extra;
  console.log(`Date: ${row.session_date} | Session: ${row.session_id.substring(0,8)}...`);
  console.log(`  Stored:  ${row.stored_complete}/${row.stored_failed}/${row.stored_extra}`);
  console.log(`  Actual:  ${row.actual_complete}/${row.actual_failed}/${row.actual_extra} (${row.total_payloads} payloads)`);
  console.log(`  ${aligned ? '✓ ALIGNED' : '✗ MISALIGNED'}\n`);
}
await client.end();
