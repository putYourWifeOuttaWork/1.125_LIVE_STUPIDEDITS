#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkPayloads() {
  console.log('=== Analyzing Wake Payload Statuses ===\n');

  // Get all payloads with their status
  const { data: payloads, error } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, payload_status, image_id, image_status, captured_at, received_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Group by status
  const statusCounts = {
    pending: 0,
    complete: 0,
    failed: 0,
    null_or_other: 0
  };

  const statusDetails = {
    pending: [],
    complete: [],
    failed: []
  };

  payloads.forEach(p => {
    const status = p.payload_status || 'null_or_other';
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
      statusDetails[status]?.push(p);
    } else {
      statusCounts.null_or_other++;
    }
  });

  console.log(`Total payloads analyzed: ${payloads.length}\n`);
  console.log('Status Distribution:');
  console.log(`  pending: ${statusCounts.pending}`);
  console.log(`  complete: ${statusCounts.complete}`);
  console.log(`  failed: ${statusCounts.failed}`);
  console.log(`  null/other: ${statusCounts.null_or_other}\n`);

  // Analyze pending payloads
  if (statusCounts.pending > 0) {
    console.log('=== PENDING PAYLOADS ANALYSIS ===');
    console.log(`Found ${statusCounts.pending} pending payloads. Checking what they are waiting for...\n`);
    
    statusDetails.pending.slice(0, 5).forEach(p => {
      const age = (new Date() - new Date(p.created_at)) / 1000 / 60; // minutes
      console.log(`Payload ${p.payload_id.substring(0, 8)}...`);
      console.log(`  Created: ${p.created_at}`);
      console.log(`  Age: ${Math.round(age)} minutes`);
      console.log(`  Captured at: ${p.captured_at || 'NULL'}`);
      console.log(`  Received at: ${p.received_at || 'NULL'}`);
      console.log(`  Has image_id: ${p.image_id ? 'YES' : 'NO'}`);
      console.log(`  Image status: ${p.image_status || 'NULL'}`);
      console.log('');
    });
  }

  console.log('\n=== ISSUE ANALYSIS ===');
  console.log('You are correct: A wake either happened or it did not.');
  console.log('The payload_status field should be:');
  console.log('  - "complete" when device woke up and transmitted (regardless of image status)');
  console.log('  - "failed" when device was expected to wake but did not');
  console.log('');
  console.log('Current problem: Payloads are stuck in "pending" state.');
  console.log('This likely means:');
  console.log('  1. MQTT handler creates payload as "pending" when device first transmits');
  console.log('  2. Handler should mark it "complete" when transmission finishes');
  console.log('  3. Timeout system should mark it "failed" if device never wakes');
  console.log('');
  console.log('The logic to mark payloads "complete" may be missing or broken.');
}

checkPayloads().then(() => process.exit(0)).catch(console.error);
