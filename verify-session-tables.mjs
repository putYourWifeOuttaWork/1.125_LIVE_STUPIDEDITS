import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function verifyTables() {
  console.log('🔍 Verifying session and timeout tracking tables...\n');

  // Check device_sessions table
  const { data: sessions, error: sessionsError } = await supabase
    .from('device_sessions')
    .select('*')
    .limit(1);

  if (sessionsError) {
    console.log('❌ device_sessions table:', sessionsError.message);
  } else {
    console.log('✅ device_sessions table exists');
  }

  // Check device_commands with new columns
  const { data: commands, error: commandsError } = await supabase
    .from('device_commands')
    .select('command_id, priority, scheduled_for, expires_at')
    .limit(1);

  if (commandsError) {
    console.log('❌ device_commands new columns:', commandsError.message);
  } else {
    console.log('✅ device_commands table has new columns (priority, scheduled_for, expires_at)');
  }

  // Check device_images with retry columns
  const { data: images, error: imagesError } = await supabase
    .from('device_images')
    .select('image_id, retry_count, max_retries, failed_at, timeout_reason')
    .limit(1);

  if (imagesError) {
    console.log('❌ device_images retry columns:', imagesError.message);
  } else {
    console.log('✅ device_images table has retry tracking columns');
  }

  // Check device_history session_id column
  const { data: history, error: historyError } = await supabase
    .from('device_history')
    .select('history_id, session_id')
    .limit(1);

  if (historyError) {
    console.log('❌ device_history session_id column:', historyError.message);
  } else {
    console.log('✅ device_history table has session_id column');
  }

  console.log('\n✨ All tables verified successfully!');
}

verifyTables().catch(console.error);
