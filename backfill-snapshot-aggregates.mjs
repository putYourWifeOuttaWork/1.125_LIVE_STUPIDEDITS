#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function backfillSnapshotAggregates() {
  console.log('=== BACKFILL SNAPSHOT AGGREGATES ===\n');

  try {
    // Get all snapshots that need aggregate data (where avg_temperature, avg_humidity, avg_mgi, or max_mgi is NULL)
    const { data: snapshots, error: fetchError } = await supabase
      .from('session_wake_snapshots')
      .select('snapshot_id, site_id, wake_round_start, wake_round_end, avg_temperature, avg_humidity, avg_mgi, max_mgi')
      .or('avg_temperature.is.null,avg_humidity.is.null,avg_mgi.is.null,max_mgi.is.null')
      .order('wake_round_start', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${snapshots.length} snapshots to backfill\n`);

    if (snapshots.length === 0) {
      console.log('✅ All snapshots already have aggregate data!');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const snapshot of snapshots) {
      try {
        // Calculate aggregate metrics for this snapshot's time window

        // Get temperature and humidity averages
        const { data: telemetryAggregates, error: telemetryError } = await supabase
          .from('device_telemetry')
          .select('temperature, humidity')
          .eq('site_id', snapshot.site_id)
          .gte('captured_at', snapshot.wake_round_start)
          .lte('captured_at', snapshot.wake_round_end);

        if (telemetryError) throw telemetryError;

        let avg_temperature = null;
        let avg_humidity = null;

        if (telemetryAggregates && telemetryAggregates.length > 0) {
          const tempReadings = telemetryAggregates.filter(t => t.temperature !== null).map(t => t.temperature);
          const humidityReadings = telemetryAggregates.filter(t => t.humidity !== null).map(t => t.humidity);

          if (tempReadings.length > 0) {
            avg_temperature = (tempReadings.reduce((a, b) => a + b, 0) / tempReadings.length).toFixed(2);
          }
          if (humidityReadings.length > 0) {
            avg_humidity = (humidityReadings.reduce((a, b) => a + b, 0) / humidityReadings.length).toFixed(2);
          }
        }

        // Get MGI averages and max
        const { data: mgiAggregates, error: mgiError } = await supabase
          .from('device_images')
          .select('mgi_score')
          .eq('site_id', snapshot.site_id)
          .gte('captured_at', snapshot.wake_round_start)
          .lte('captured_at', snapshot.wake_round_end)
          .not('mgi_score', 'is', null);

        if (mgiError) throw mgiError;

        let avg_mgi = null;
        let max_mgi = null;

        if (mgiAggregates && mgiAggregates.length > 0) {
          const mgiScores = mgiAggregates.map(i => i.mgi_score);
          avg_mgi = (mgiScores.reduce((a, b) => a + b, 0) / mgiScores.length).toFixed(2);
          max_mgi = Math.max(...mgiScores).toFixed(2);
        }

        // Update the snapshot with calculated aggregates
        const { error: updateError } = await supabase
          .from('session_wake_snapshots')
          .update({
            avg_temperature: avg_temperature ? parseFloat(avg_temperature) : null,
            avg_humidity: avg_humidity ? parseFloat(avg_humidity) : null,
            avg_mgi: avg_mgi ? parseFloat(avg_mgi) : null,
            max_mgi: max_mgi ? parseFloat(max_mgi) : null
          })
          .eq('snapshot_id', snapshot.snapshot_id);

        if (updateError) throw updateError;

        successCount++;

        if (successCount % 10 === 0) {
          console.log(`  Processed ${successCount}/${snapshots.length} snapshots...`);
        }

      } catch (err) {
        console.error(`Error processing snapshot ${snapshot.snapshot_id}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n=== BACKFILL COMPLETE ===');
    console.log(`✅ Successfully updated: ${successCount} snapshots`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} snapshots`);
    }

  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  }
}

backfillSnapshotAggregates();
