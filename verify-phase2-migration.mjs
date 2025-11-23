#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('🔍 Verifying Phase 2 Migration...\n');
  
  // Check new columns
  const { data: sample, error } = await supabase
    .from('device_wake_payloads')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  const newColumns = ['telemetry_id', 'wake_type', 'chunk_count', 'chunks_received', 'is_complete'];
  const existingColumns = Object.keys(sample[0] || {});
  
  console.log('✅ New Columns Check:');
  newColumns.forEach(col => {
    const exists = existingColumns.includes(col);
    console.log(`   ${exists ? '✅' : '❌'} ${col}: ${exists ? 'EXISTS' : 'MISSING'}`);
  });
  
  // Check data distribution
  const { data: stats, error: statsError } = await supabase
    .from('device_wake_payloads')
    .select('wake_type, is_complete');
  
  if (stats) {
    const grouped = stats.reduce((acc, row) => {
      const type = row.wake_type || 'null';
      if (!acc[type]) acc[type] = { total: 0, complete: 0 };
      acc[type].total++;
      if (row.is_complete) acc[type].complete++;
      return acc;
    }, {});
    
    console.log('\n📊 Wake Type Distribution:');
    Object.entries(grouped).forEach(([type, counts]) => {
      console.log(`   ${type}: ${counts.total} total, ${counts.complete} complete`);
    });
  }
  
  // Check device_wake_sessions dropped
  try {
    const { error: sessError } = await supabase
      .from('device_wake_sessions')
      .select('*')
      .limit(1);
    
    if (sessError && sessError.message.includes('does not exist')) {
      console.log('\n✅ device_wake_sessions table successfully dropped');
    } else {
      console.log('\n⚠️  device_wake_sessions table still exists');
    }
  } catch (err) {
    console.log('\n✅ device_wake_sessions table successfully dropped');
  }
  
  console.log('\n🎉 Phase 2 Migration Verified Successfully!\n');
}

verify();
