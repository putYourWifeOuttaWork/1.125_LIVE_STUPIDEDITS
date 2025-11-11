import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jycxolmevsvrxmeinxff.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI'
);

async function checkSchema() {
  console.log('Checking devices table schema...\n');

  // Get actual devices table columns
  const { data: devices, error } = await supabase
    .from('devices')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (devices && devices.length > 0) {
    console.log('Devices table columns:');
    console.log(Object.keys(devices[0]).sort().join('\n'));
  } else {
    console.log('No devices found, checking via information_schema...');

    const { data: columns, error: colError } = await supabase
      .rpc('exec_sql', {
        sql_query: `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'devices'
          ORDER BY column_name;
        `
      });

    if (colError) {
      console.log('Could not query information_schema directly.');
      console.log('Please run this SQL in Supabase dashboard:');
      console.log(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'devices'
        ORDER BY column_name;
      `);
    } else {
      console.log('Columns:', columns);
    }
  }
}

checkSchema().catch(console.error);
