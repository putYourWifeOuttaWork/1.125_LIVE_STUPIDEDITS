#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkNov11() {
  // Get all payloads from Nov 11
  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, payload_status, overage_flag, site_device_session_id, captured_at')
    .gte('captured_at', '2025-11-11T00:00:00Z')
    .lt('captured_at', '2025-11-12T00:00:00Z');

  console.log(`Total Nov 11 payloads: ${payloads?.length || 0}\n`);

  payloads?.forEach(p => {
    console.log(`Payload: ${p.payload_id.substring(0, 8)}`);
    console.log(`  Status: ${p.payload_status}`);
    console.log(`  Overage: ${p.overage_flag}`);
    console.log(`  Session: ${p.site_device_session_id ? p.site_device_session_id.substring(0, 8) : 'null'}`);
    console.log(`  Captured: ${p.captured_at}\n`);
  });
}

checkNov11().then(() => process.exit(0)).catch(console.error);
