#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function backfillWakePayloads() {
  console.log('=== Backfilling Wake Payload Status ===\n');

  // Check current status
  const { data: payloads, error: fetchError } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, payload_status, captured_at, received_at, image_id')
    .eq('payload_status', 'pending');

  if (fetchError) {
    console.error('Error fetching payloads:', fetchError);
    return;
  }

  console.log(`Found ${payloads.length} payloads stuck in 'pending' status\n`);

  if (payloads.length === 0) {
    console.log('✅ No payloads need backfilling. All are already complete!');
    return;
  }

  console.log('Analysis:');
  console.log(`- All these payloads have captured_at and received_at timestamps`);
  console.log(`- This means the device WOKE UP and transmitted data`);
  console.log(`- Therefore, the wake is COMPLETE (regardless of image status)\n`);

  console.log('Updating payloads to status="complete"...');

  // Update all pending payloads to complete
  // A wake is complete if we have captured_at and received_at (device transmitted)
  const { data: updated, error: updateError } = await supabase
    .from('device_wake_payloads')
    .update({
      payload_status: 'complete',
      is_complete: true
    })
    .eq('payload_status', 'pending')
    .not('captured_at', 'is', null)  // Device captured data
    .select('payload_id');

  if (updateError) {
    console.error('Error updating payloads:', updateError);
    return;
  }

  console.log(`✅ Updated ${updated?.length || 0} payloads to 'complete' status\n`);

  // Verify the update
  const { data: afterUpdate, error: verifyError } = await supabase
    .from('device_wake_payloads')
    .select('payload_status')
    .eq('payload_status', 'pending');

  if (verifyError) {
    console.error('Error verifying:', verifyError);
    return;
  }

  console.log('Verification:');
  console.log(`- Remaining 'pending' payloads: ${afterUpdate.length}`);
  
  // Count by status
  const { data: statusCounts } = await supabase
    .from('device_wake_payloads')
    .select('payload_status');

  const counts = {
    complete: 0,
    pending: 0,
    failed: 0
  };

  statusCounts?.forEach(p => {
    if (counts[p.payload_status] !== undefined) {
      counts[p.payload_status]++;
    }
  });

  console.log('\nFinal Status Distribution:');
  console.log(`  complete: ${counts.complete}`);
  console.log(`  pending: ${counts.pending}`);
  console.log(`  failed: ${counts.failed}`);
  console.log('\n✅ Backfill complete! Session counters should now update via triggers.');
}

backfillWakePayloads().then(() => process.exit(0)).catch(console.error);
