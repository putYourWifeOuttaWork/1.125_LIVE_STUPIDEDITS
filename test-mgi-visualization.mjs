import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('MGI Visualization Test Setup');
  console.log('============================\n');

  const { data: site } = await supabase
    .from('sites')
    .select('site_id, name')
    .ilike('name', '%iot test site 2%')
    .maybeSingle();

  if (!site) {
    console.error('Site not found');
    process.exit(1);
  }

  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, x_position, y_position')
    .eq('site_id', site.site_id)
    .not('x_position', 'is', null);

  console.log(`Found ${devices.length} devices\n`);

  // Test different MGI + velocity combinations
  const mockData = [
    { mgi: 0.25, velocity: 0.02, description: 'Low MGI, small pulse' },
    { mgi: 0.45, velocity: 0.06, description: 'Medium MGI, medium pulse' },
    { mgi: 0.70, velocity: 0.10, description: 'High MGI, large pulse' },
    { mgi: 0.88, velocity: 0.15, description: 'Critical MGI, very large & fast pulse' },
  ];

  for (let i = 0; i < devices.length && i < mockData.length; i++) {
    const device = devices[i];
    const { mgi: mgiScore, velocity, description } = mockData[i];

    const { data: submission } = await supabase
      .from('submissions')
      .insert({
        device_id: device.device_id,
        site_id: site.site_id,
        submission_type: 'petri',
        status: 'completed',
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (submission) {
      await supabase
        .from('petri_observations')
        .insert({
          submission_id: submission.submission_id,
          device_id: device.device_id,
          site_id: site.site_id,
          petri_code: `PETRI-${device.device_code}`,
          fungicide_used: 'None',
          surrounding_water_schedule: 'None',
          image_url: `mock-${device.device_code}.jpg`,
          mgi_score: mgiScore,
          mgi_confidence: 0.92,
          mgi_scored_at: new Date().toISOString(),
          growth_velocity: velocity,
        });

      console.log(`${device.device_code}: ${description} - MGI ${(mgiScore * 100).toFixed(0)}%, velocity ${(velocity * 100).toFixed(1)}%`);
    }
  }

  console.log('\nRefresh homepage and select MGI from Zones dropdown!');
}

main().catch(console.error);
