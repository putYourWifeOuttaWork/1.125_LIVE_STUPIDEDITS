import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL
});

await client.connect();

const result = await client.query(`
  SELECT pg_get_functiondef('generate_session_wake_snapshot'::regproc);
`);

console.log(result.rows[0].pg_get_functiondef);

await client.end();
