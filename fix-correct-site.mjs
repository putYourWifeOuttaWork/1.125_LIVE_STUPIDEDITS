#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function identifySite() {
  console.log('🔍 Identifying the site from the screenshot...\n');

  // The site from the screenshot
  const siteId = '4a21ccd9-56c5-48b2-90ca-c5fb756803d6';

  const { data: site, error } = await supabase
    .from('sites')
    .select('*')
    .eq('site_id', siteId)
    .single();

  if (error || !site) {
    console.error('❌ Site not found');
    return;
  }

  console.log('📍 Site from Screenshot:');
  console.log(`   Name: ${site.name}`);
  console.log(`   ID: ${site.site_id}`);
  console.log(`   Code: ${site.site_code}`);
  console.log('');

  // Check snapshots for this site
  const { data: snapshots } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, wake_round_start, session_id')
    .eq('site_id', siteId)
    .order('wake_round_start', { ascending: false })
    .limit(10);

  console.log(`📊 Snapshots for this site: ${snapshots?.length || 0}`);
  if (snapshots && snapshots.length > 0) {
    console.log('   Recent snapshots:');
    snapshots.forEach(s => {
      console.log(`   - Wake #${s.wake_number}: ${s.wake_round_start}`);
    });
  }
  console.log('');

  console.log('✅ This is the site you need to regenerate!\n');
  console.log(`Run: node regenerate-snapshots-with-fix.mjs "${site.name}"`);
}

identifySite().then(() => process.exit(0));
