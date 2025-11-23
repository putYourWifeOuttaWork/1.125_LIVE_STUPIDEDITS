import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get a recent session
const sessions = await supabase
  .from('site_device_sessions')
  .select('session_id, session_date, site_id, session_start_time, session_end_time')
  .order('session_date', { ascending: false })
  .limit(1);

if (!sessions.data || sessions.data.length === 0) {
  console.log('No sessions found');
  process.exit(0);
}

const session = sessions.data[0];
console.log('Session:', session.session_id);
console.log('Date:', session.session_date);
console.log('Time:', session.session_start_time, 'to', session.session_end_time);
console.log();

// Get devices assigned to this site
const devices = await supabase
  .from('devices')
  .select('device_id, device_code')
  .eq('site_id', session.site_id)
  .limit(5);

console.log('Devices at this site:', devices.data?.length || 0);
console.log();

if (devices.data && devices.data.length > 0) {
  for (const device of devices.data) {
    console.log('Device:', device.device_code);
    
    // Count wake payloads for this device in this session
    const wakes = await supabase
      .from('device_wake_payloads')
      .select('*')
      .eq('device_id', device.device_id)
      .eq('site_device_session_id', session.session_id);
    
    console.log('  Wakes with site_device_session_id match:', wakes.data?.length || 0);
    
    // Count ALL wakes for this device on this date
    const allWakes = await supabase
      .from('device_wake_payloads')
      .select('*')
      .eq('device_id', device.device_id)
      .gte('captured_at', session.session_date + 'T' + session.session_start_time)
      .lte('captured_at', session.session_date + 'T' + session.session_end_time);
    
    console.log('  All wakes in session timeframe:', allWakes.data?.length || 0);
    console.log();
  }
}
