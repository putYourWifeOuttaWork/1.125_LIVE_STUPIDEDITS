/**
 * Phase 3 - Ingest Module
 * 
 * Handle HELLO status and image metadata/chunk ingestion
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { DeviceStatusMessage, ImageMetadata, ImageChunk, DeviceLineage, SiteSessionInfo } from './types.ts';
import { resolveDeviceLineage, getOrCreateSiteSession } from './resolver.ts';
import { computeWakeBuckets, inferWakeIndex } from './schedule.ts';
import { getOrCreateBuffer, storeChunk } from './idempotency.ts';

/**
 * Handle device HELLO status message
 * Updates last_seen_at and queues commands if pending images exist
 */
export async function handleHelloStatus(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: DeviceStatusMessage
): Promise<void> {
  console.log('[Ingest] HELLO from device:', payload.device_id, 'pending:', payload.pendingImg || 0);

  try {
    // Resolve device lineage
    const lineage = await resolveDeviceLineage(supabase, payload.device_id);
    if (!lineage) {
      console.warn('[Ingest] Cannot resolve lineage for:', payload.device_id);
      // Could trigger auto-provision here if needed
      return;
    }

    // Update device last_seen_at
    await supabase
      .from('devices')
      .update({
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .eq('device_id', lineage.device_id);

    console.log('[Ingest] Updated last_seen for device:', lineage.device_id);

    // If pending images, could queue capture command
    if (payload.pendingImg && payload.pendingImg > 0) {
      console.log('[Ingest] Device has pending images:', payload.pendingImg);
      // Queue send_image command if needed
      // For now, device will send automatically
    }
  } catch (err) {
    console.error('[Ingest] Error handling HELLO:', err);
  }
}

/**
 * Handle image metadata message
 * Calls fn_wake_ingestion_handler to create payload and image records
 */
export async function handleMetadata(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: ImageMetadata,
  lineage: DeviceLineage,
  sessionInfo: SiteSessionInfo
): Promise<void> {
  console.log('[Ingest] Metadata received:', payload.image_name, 'chunks:', payload.total_chunks_count);

  try {
    // Prepare telemetry data JSON
    const telemetryData = {
      temperature: payload.temperature,
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      location: payload.location,
      error: payload.error,
      total_chunks: payload.total_chunks_count,
      slot_index: payload.slot_index,
      image_size: payload.image_size,
      max_chunk_size: payload.max_chunk_size,
    };

    // Call SQL handler: fn_wake_ingestion_handler
    const { data: result, error } = await supabase.rpc('fn_wake_ingestion_handler', {
      p_device_id: lineage.device_id,
      p_captured_at: payload.capture_timestamp,
      p_image_name: payload.image_name,
      p_telemetry_data: telemetryData,
    });

    if (error) {
      console.error('[Ingest] fn_wake_ingestion_handler error:', error);
      return;
    }

    if (!result || !result.success) {
      console.error('[Ingest] Wake ingestion failed:', result?.message);
      return;
    }

    console.log('[Ingest] Wake ingestion success:', {
      payload_id: result.payload_id,
      image_id: result.image_id,
      wake_index: result.wake_index,
      is_overage: result.is_overage,
    });

    // Store in buffer for chunk assembly
    const buffer = getOrCreateBuffer(payload.device_id, payload.image_name, payload.total_chunks_count);
    buffer.metadata = payload;
    buffer.imageRecord = { image_id: result.image_id };
    buffer.payloadId = result.payload_id;
    buffer.sessionInfo = sessionInfo;

    // Also insert into device_telemetry for historical tracking
    if (payload.temperature !== undefined || payload.humidity !== undefined) {
      await supabase.from('device_telemetry').insert({
        device_id: lineage.device_id,
        captured_at: payload.capture_timestamp,
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        gas_resistance: payload.gas_resistance,
        battery_voltage: null, // Would come from separate field
        company_id: lineage.company_id,
      });
    }
  } catch (err) {
    console.error('[Ingest] Exception handling metadata:', err);
  }
}

/**
 * Handle image chunk message
 * Stores chunk in buffer and updates received count
 */
export async function handleChunk(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: ImageChunk
): Promise<void> {
  try {
    const chunkData = new Uint8Array(payload.payload);
    
    // Store chunk in buffer
    storeChunk(payload.device_id, payload.image_name, payload.chunk_id, chunkData);

    // Get buffer to check progress
    const buffer = getOrCreateBuffer(payload.device_id, payload.image_name, 0);
    const receivedCount = buffer.chunks.size;

    console.log('[Ingest] Chunk received:', payload.chunk_id + 1, '/', buffer.totalChunks, 'for', payload.image_name);

    // Update device_images received_chunks counter
    if (buffer.imageRecord?.image_id) {
      await supabase
        .from('device_images')
        .update({ received_chunks: receivedCount })
        .eq('image_id', buffer.imageRecord.image_id);
    }
  } catch (err) {
    console.error('[Ingest] Exception handling chunk:', err);
  }
}
