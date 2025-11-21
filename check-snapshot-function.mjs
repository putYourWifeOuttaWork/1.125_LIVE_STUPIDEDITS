import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();

try {
  // Get function source
  const result = await client.query(`
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'generate_session_wake_snapshot'
    ORDER BY oid DESC
    LIMIT 1
  `);
  
  if (result.rows.length > 0) {
    const source = result.rows[0].prosrc;
    const lines = source.split('\n');
    
    console.log('Looking for EXTRACT usage...\n');
    let lineNum = 1;
    for (const line of lines) {
      if (line.includes('EXTRACT') || line.includes('program_day') || line.includes('total_days')) {
        console.log('Line', lineNum, ':', line.trim());
      }
      lineNum++;
    }
  } else {
    console.log('Function not found!');
  }
} finally {
  await client.end();
}
