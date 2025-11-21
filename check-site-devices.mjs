import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// First check all devices
const { data: allDevices, error: allError } = await supabase
  .from('devices')
  .select('device_code, latest_mgi_score, x_position');

console.log('Total devices in DB:', allDevices?.length || 0);
console.log('Error:', allError?.message || 'none');

// Now check with MGI filter (without sites join to avoid ambiguity)
const { data: devices, error } = await supabase
  .from('devices')
  .select('device_code, latest_mgi_score, latest_mgi_velocity, x_position, y_position, site_id')
  .not('latest_mgi_score', 'is', null)
  .not('x_position', 'is', null);

console.log('Devices with MGI and positions:', devices?.length || 0);
console.log('Error:', error?.message || 'none\n');

const bySite = {};
devices?.forEach(d => {
  const siteId = d.site_id || 'Unassigned';
  if (!bySite[siteId]) bySite[siteId] = [];
  bySite[siteId].push(d);
});

Object.keys(bySite).forEach(siteId => {
  console.log(`Site ID: ${siteId} (${bySite[siteId].length} devices)`);
  bySite[siteId].forEach(d => {
    const mgi = (d.latest_mgi_score*100).toFixed(1);
    const vel = (d.latest_mgi_velocity*100).toFixed(1);
    console.log(`  ${d.device_code}: MGI ${mgi}%, Vel ${vel}%, Pos (${d.x_position}, ${d.y_position})`);
  });
  console.log('');
});
