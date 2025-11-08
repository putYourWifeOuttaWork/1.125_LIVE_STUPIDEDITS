import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Check device_alerts columns
const { error: alertError } = await supabase.from('device_alerts').select('alert_id, alert_type, severity, message, metadata').limit(0);
console.log('device_alerts columns check:', alertError ? 'ERROR: ' + alertError.message : 'OK - has: alert_type, severity, message, metadata (NOT title/alert_data)');

// Check if device_sessions exists
const { error: sessionError } = await supabase.from('device_sessions').select('session_id').limit(0);
console.log('device_sessions table:', sessionError ? 'ERROR: ' + sessionError.message : 'OK - exists');

// Check if device_wake_sessions exists
const { error: wakeError } = await supabase.from('device_wake_sessions').select('session_id').limit(0);
console.log('device_wake_sessions table:', wakeError ? 'ERROR: ' + wakeError.message : 'OK - exists');
