import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('🔍 Verifying Migrations Applied...\n');

// 1. Check device_sessions does NOT exist (should be removed)
const { error: sessionError } = await supabase.from('device_sessions').select('session_id').limit(0);
console.log('1. device_sessions table (should NOT exist):', sessionError ? '✅ Correctly removed' : '❌ Still exists');

// 2. Check device_wake_sessions exists
const { error: wakeError } = await supabase.from('device_wake_sessions').select('session_id').limit(0);
console.log('2. device_wake_sessions table:', wakeError ? '❌ Missing' : '✅ Exists');

// 3. Check device_images has retry columns
const { error: imgError } = await supabase.from('device_images').select('retry_count, max_retries, failed_at, timeout_reason').limit(0);
console.log('3. device_images retry columns:', imgError ? '❌ ' + imgError.message : '✅ All present');

// 4. Check device_commands has scheduling columns
const { error: cmdError } = await supabase.from('device_commands').select('priority, scheduled_for, expires_at, max_retries, error_message').limit(0);
console.log('4. device_commands scheduling columns:', cmdError ? '❌ ' + cmdError.message : '✅ All present');

// 5. Check functions exist
const { data: timeoutFunc, error: timeoutErr } = await supabase.rpc('timeout_stale_images');
console.log('5. timeout_stale_images() function:', timeoutErr?.message.includes('does not exist') ? '❌ Missing' : '✅ Exists');

console.log('\n✨ Migration verification complete!');
