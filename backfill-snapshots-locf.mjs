#!/usr/bin/env node
/**
 * Backfill Session Snapshots with Forward-Fill Logic (LOCF)
 *
 * This script applies Last Observation Carried Forward to existing snapshots
 * to ensure all devices have complete state for visualization.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function backfillSessionSnapshots(sessionId) {
  console.log(`Processing session: ${sessionId}`);

  // Fetch all snapshots for this session in chronological order
  const { data: snapshots, error } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('wake_round_start', { ascending: true });

  if (error) {
    console.error(`Error fetching snapshots for session ${sessionId}:`, error);
    return;
  }

  if (!snapshots || snapshots.length === 0) {
    console.log(`No snapshots found for session ${sessionId}`);
    return;
  }

  const deviceCache = new Map();
  const updatedSnapshots = [];

  for (const snapshot of snapshots) {
    try {
      const siteState = typeof snapshot.site_state === 'string'
        ? JSON.parse(snapshot.site_state)
        : snapshot.site_state;

      const currentDevices = siteState?.devices || [];

      // Update cache with new data from this snapshot
      for (const device of currentDevices) {
        const deviceId = device.device_id;
        const cachedState = deviceCache.get(deviceId) || {};

        // Merge new data with cached data (new data takes precedence)
        deviceCache.set(deviceId, {
          device_id: device.device_id,
          device_code: device.device_code,
          device_name: device.device_name || cachedState.device_name,
          position: device.position || cachedState.position,
          status: device.status || cachedState.status || 'active',
          last_seen_at: device.last_seen_at || cachedState.last_seen_at,
          battery_health_percent: device.battery_health_percent ?? cachedState.battery_health_percent,
          telemetry: {
            latest_temperature: device.telemetry?.latest_temperature ?? cachedState.telemetry?.latest_temperature,
            latest_humidity: device.telemetry?.latest_humidity ?? cachedState.telemetry?.latest_humidity,
          },
          mgi_state: {
            latest_mgi_score: device.mgi_state?.latest_mgi_score ?? cachedState.mgi_state?.latest_mgi_score,
            mgi_velocity: device.mgi_state?.mgi_velocity ?? cachedState.mgi_state?.mgi_velocity,
          },
        });
      }

      // Build complete device list from cache
      const completeDevices = Array.from(deviceCache.values())
        .filter(d => d.position && d.position.x !== null && d.position.y !== null);

      // Create updated site state
      const updatedSiteState = {
        ...siteState,
        devices: completeDevices,
      };

      updatedSnapshots.push({
        snapshot_id: snapshot.snapshot_id,
        site_state: updatedSiteState,
      });

    } catch (error) {
      console.error(`Error processing snapshot ${snapshot.snapshot_id}:`, error);
    }
  }

  // Update all snapshots in batch
  for (const updated of updatedSnapshots) {
    const { error: updateError } = await supabase
      .from('session_wake_snapshots')
      .update({ site_state: updated.site_state })
      .eq('snapshot_id', updated.snapshot_id);

    if (updateError) {
      console.error(`Error updating snapshot ${updated.snapshot_id}:`, updateError);
    }
  }

  console.log(`✓ Updated ${updatedSnapshots.length} snapshots for session ${sessionId}`);
}

async function main() {
  console.log('Starting snapshot backfill with forward-fill logic...\n');

  // Get all unique session IDs
  const { data: sessions, error } = await supabase
    .from('session_wake_snapshots')
    .select('session_id')
    .order('session_id');

  if (error) {
    console.error('Error fetching sessions:', error);
    process.exit(1);
  }

  const uniqueSessions = [...new Set(sessions.map(s => s.session_id))];
  console.log(`Found ${uniqueSessions.length} sessions to process\n`);

  let processed = 0;
  for (const sessionId of uniqueSessions) {
    await backfillSessionSnapshots(sessionId);
    processed++;

    if (processed % 5 === 0) {
      console.log(`Progress: ${processed}/${uniqueSessions.length} sessions\n`);
    }
  }

  console.log(`\n✅ Backfill complete! Processed ${processed} sessions`);
}

main().catch(console.error);
