#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function backfillWakePayloadLinkages() {
  console.log('🔗 BACKFILLING WAKE_PAYLOAD_ID LINKAGES\n');
  console.log('=' .repeat(80));

  let telemetryLinked = 0;
  let telemetryFailed = 0;
  let imagesLinked = 0;
  let imagesFailed = 0;

  // ============================================================
  // 1. LINK TELEMETRY TO WAKE PAYLOADS
  // ============================================================
  console.log('\n📊 1. LINKING TELEMETRY TO WAKE PAYLOADS');
  console.log('-'.repeat(80) + '\n');

  // Get all unlinked telemetry
  const { data: unlinkedTelemetry, error: telemetryError } = await supabase
    .from('device_telemetry')
    .select('telemetry_id, device_id, site_device_session_id, captured_at, temperature, humidity')
    .is('wake_payload_id', null)
    .not('site_device_session_id', 'is', null)
    .order('captured_at');

  if (telemetryError) {
    console.error('❌ Error fetching unlinked telemetry:', telemetryError);
  } else {
    console.log(`Found ${unlinkedTelemetry.length} unlinked telemetry records\n`);

    for (const telemetry of unlinkedTelemetry) {
      try {
        // Find matching wake_payload within ±5 seconds
        const capturedTime = new Date(telemetry.captured_at);
        const startWindow = new Date(capturedTime.getTime() - 5000); // 5 seconds before
        const endWindow = new Date(capturedTime.getTime() + 5000);   // 5 seconds after

        const { data: matchingPayload, error: payloadError } = await supabase
          .from('device_wake_payloads')
          .select('payload_id, captured_at, temperature, humidity')
          .eq('device_id', telemetry.device_id)
          .eq('site_device_session_id', telemetry.site_device_session_id)
          .gte('captured_at', startWindow.toISOString())
          .lte('captured_at', endWindow.toISOString())
          .limit(1)
          .maybeSingle();

        if (payloadError) {
          console.error(`  ❌ Error finding payload for telemetry ${telemetry.telemetry_id}:`, payloadError);
          telemetryFailed++;
          continue;
        }

        if (matchingPayload) {
          // Update telemetry with wake_payload_id
          const { error: updateError } = await supabase
            .from('device_telemetry')
            .update({ wake_payload_id: matchingPayload.payload_id })
            .eq('telemetry_id', telemetry.telemetry_id);

          if (updateError) {
            console.error(`  ❌ Error updating telemetry ${telemetry.telemetry_id}:`, updateError);
            telemetryFailed++;
          } else {
            telemetryLinked++;
            if (telemetryLinked % 10 === 0) {
              console.log(`  ✅ Linked ${telemetryLinked} telemetry records...`);
            }
          }
        } else {
          // No matching payload found - this is expected for standalone telemetry
          telemetryFailed++;
          if (telemetryFailed <= 5) {
            console.log(`  ⚠️  No payload found for telemetry at ${telemetry.captured_at} (device ${telemetry.device_id.substring(0, 8)}...)`);
          }
        }
      } catch (error) {
        console.error(`  ❌ Exception processing telemetry ${telemetry.telemetry_id}:`, error);
        telemetryFailed++;
      }
    }

    console.log(`\n✅ Telemetry linking complete: ${telemetryLinked} linked, ${telemetryFailed} failed/skipped\n`);
  }

  // ============================================================
  // 2. LINK IMAGES TO WAKE PAYLOADS
  // ============================================================
  console.log('\n📸 2. LINKING IMAGES TO WAKE PAYLOADS');
  console.log('-'.repeat(80) + '\n');

  // Get all unlinked images
  const { data: unlinkedImages, error: imagesError } = await supabase
    .from('device_images')
    .select('image_id, device_id, site_device_session_id, captured_at, image_name')
    .is('wake_payload_id', null)
    .not('site_device_session_id', 'is', null)
    .order('captured_at');

  if (imagesError) {
    console.error('❌ Error fetching unlinked images:', imagesError);
  } else {
    console.log(`Found ${unlinkedImages.length} unlinked images\n`);

    for (const image of unlinkedImages) {
      try {
        // Find matching wake_payload within ±10 seconds (images can have slight delay)
        const capturedTime = new Date(image.captured_at);
        const startWindow = new Date(capturedTime.getTime() - 10000); // 10 seconds before
        const endWindow = new Date(capturedTime.getTime() + 10000);   // 10 seconds after

        const { data: matchingPayload, error: payloadError } = await supabase
          .from('device_wake_payloads')
          .select('payload_id, captured_at, image_id')
          .eq('device_id', image.device_id)
          .eq('site_device_session_id', image.site_device_session_id)
          .gte('captured_at', startWindow.toISOString())
          .lte('captured_at', endWindow.toISOString())
          .is('image_id', null) // Only match payloads that don't already have an image
          .order('captured_at')
          .limit(1)
          .maybeSingle();

        if (payloadError) {
          console.error(`  ❌ Error finding payload for image ${image.image_id}:`, payloadError);
          imagesFailed++;
          continue;
        }

        if (matchingPayload) {
          // Update BOTH tables: image gets wake_payload_id AND payload gets image_id
          const { error: updateImageError } = await supabase
            .from('device_images')
            .update({ wake_payload_id: matchingPayload.payload_id })
            .eq('image_id', image.image_id);

          const { error: updatePayloadError } = await supabase
            .from('device_wake_payloads')
            .update({ image_id: image.image_id })
            .eq('payload_id', matchingPayload.payload_id);

          if (updateImageError || updatePayloadError) {
            console.error(`  ❌ Error updating image ${image.image_id}:`, updateImageError || updatePayloadError);
            imagesFailed++;
          } else {
            imagesLinked++;
            if (imagesLinked % 10 === 0) {
              console.log(`  ✅ Linked ${imagesLinked} images...`);
            }
          }
        } else {
          // No matching payload found
          imagesFailed++;
          if (imagesFailed <= 5) {
            console.log(`  ⚠️  No payload found for image at ${image.captured_at} (device ${image.device_id.substring(0, 8)}...)`);
          }
        }
      } catch (error) {
        console.error(`  ❌ Exception processing image ${image.image_id}:`, error);
        imagesFailed++;
      }
    }

    console.log(`\n✅ Image linking complete: ${imagesLinked} linked, ${imagesFailed} failed/skipped\n`);
  }

  // ============================================================
  // 3. SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('📋 BACKFILL SUMMARY');
  console.log('='.repeat(80) + '\n');

  console.log('Telemetry Records:');
  console.log(`  ✅ Successfully linked: ${telemetryLinked}`);
  console.log(`  ❌ Failed/Skipped: ${telemetryFailed}\n`);

  console.log('Image Records:');
  console.log(`  ✅ Successfully linked: ${imagesLinked}`);
  console.log(`  ❌ Failed/Skipped: ${imagesFailed}\n`);

  const totalLinked = telemetryLinked + imagesLinked;
  console.log(`🎉 Total records linked: ${totalLinked}\n`);

  // Verify final state
  console.log('🔍 Verifying final state...\n');

  const { count: remainingTelemetry } = await supabase
    .from('device_telemetry')
    .select('*', { count: 'exact', head: true })
    .is('wake_payload_id', null);

  const { count: remainingImages } = await supabase
    .from('device_images')
    .select('*', { count: 'exact', head: true })
    .is('wake_payload_id', null);

  console.log(`Remaining unlinked telemetry: ${remainingTelemetry || 0}`);
  console.log(`Remaining unlinked images: ${remainingImages || 0}\n`);

  if ((remainingTelemetry || 0) === 0 && (remainingImages || 0) === 0) {
    console.log('✅ All records are now linked!\n');
  } else {
    console.log('⚠️  Some records remain unlinked (this is normal for standalone data)\n');
  }

  return {
    telemetryLinked,
    telemetryFailed,
    imagesLinked,
    imagesFailed,
    totalLinked
  };
}

// Run backfill
backfillWakePayloadLinkages()
  .then(results => {
    console.log('✅ Backfill complete!\n');
    if (results.totalLinked > 0) {
      console.log('Next step: Regenerate snapshots for sessions with data\n');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  });
