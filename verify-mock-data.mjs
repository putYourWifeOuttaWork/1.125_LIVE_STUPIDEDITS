#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('🔍 Verifying mock data...\n');

  // Check sessions
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, expected_wake_count, completed_wake_count, status')
    .order('session_date', { ascending: false })
    .limit(7);

  console.log('📅 Sessions created:');
  sessions.forEach(s => {
    console.log(`   ${s.session_date}: ${s.completed_wake_count}/${s.expected_wake_count} wakes, status: ${s.status}`);
  });

  // Check payloads
  const { count: payloadCount } = await supabase
    .from('device_wake_payloads')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📡 Total wake payloads: ${payloadCount}`);

  // Check images
  const { data: images } = await supabase
    .from('device_images')
    .select('status')
    .order('created_at', { ascending: false })
    .limit(100);

  const imagesByStatus = images.reduce((acc, img) => {
    acc[img.status] = (acc[img.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📸 Images by status:');
  Object.entries(imagesByStatus).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  console.log('\n✅ Data verification complete!');
  console.log('\n🎯 Next steps:');
  console.log('   1. Open the app in your browser');
  console.log('   2. Navigate to Lab > Site Sessions');
  console.log('   3. Select the "Cold" site');
  console.log('   4. Choose date range: Last 7 days');
  console.log('   5. View your generated test data!');
}

verify();
