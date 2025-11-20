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

  const mockMGIScores = [0.25, 0.65, 0.85];

  for (let i = 0; i < devices.length && i < mockMGIScores.length; i++) {
    const device = devices[i];
    const mgiScore = mockMGIScores[i];

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
          slot_index: 0,
          captured_at: new Date().toISOString(),
          image_path: `mock-${device.device_code}.jpg`,
          mgi_score: mgiScore,
          mgi_confidence: 0.92,
          mgi_scored_at: new Date().toISOString(),
        });

      console.log(`${device.device_code}: MGI ${(mgiScore * 100).toFixed(0)}%`);
    }
  }

  console.log('\nRefresh homepage and select MGI from Zones dropdown!');
}

main().catch(console.error);
