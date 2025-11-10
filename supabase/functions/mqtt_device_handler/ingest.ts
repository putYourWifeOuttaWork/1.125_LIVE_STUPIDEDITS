/**
 * Phase 3 - Ingest Module (SQL-Compliant)
 *
 * Handle HELLO status and image metadata/chunk ingestion
 * CALLS SQL HANDLERS - NO INLINE SQL
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { DeviceStatusMessage, ImageMetadata, ImageChunk } from './types.ts';
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
    // Update device last_seen_at (simple update is OK here - no complex logic)
    const { error } = await supabase
      .from('devices')
      .update({
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .eq('device_mac', payload.device_id); // device_id in MQTT is MAC address

    if (error) {
      console.error('[Ingest] Error updating last_seen:', error);
    }

    // If pending images, log for monitoring
    if (payload.pendingImg && payload.pendingImg > 0) {
      console.log('[Ingest] Device has pending images:', payload.pendingImg);
      // Device will send automatically - no action needed
    }
  } catch (err) {
    console.error('[Ingest] Error handling HELLO:', err);
  }
}

/**
 * Handle image metadata message
 * CALLS fn_wake_ingestion_handler - NO INLINE SQL
 */
export async function handleMetadata(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: ImageMetadata
): Promise<void> {
  console.log('[Ingest] Metadata received:', payload.image_name, 'chunks:', payload.total_chunks_count);

  try {
    // First resolve device_mac to device_id (UUID)
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_mac', payload.device_id)
      .maybeSingle();

    if (deviceError || !deviceData) {
      console.error('[Ingest] Device not found:', payload.device_id);
      return;
    }

    const deviceId = deviceData.device_id;

    // Prepare telemetry data JSON with schema-compliant field names
    const telemetryData = {
      captured_at: payload.capture_timestamp, // Use schema name
      total_chunks: payload.total_chunks_count, // Fix name
      image_size: payload.image_size,
      max_chunk_size: payload.max_chunk_size,
      temperature: payload.temperature,
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      location: payload.location,
      error_code: payload.error,
      slot_index: payload.slot_index,
    };

    // Call SQL handler: fn_wake_ingestion_handler
    const { data: result, error } = await supabase.rpc('fn_wake_ingestion_handler', {
      p_device_id: deviceId,
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
      session_id: result.session_id,
      wake_index: result.wake_index,
      is_overage: result.is_overage,
    });

    // Store in buffer for chunk assembly
    const buffer = await getOrCreateBuffer(
      supabase,
      payload.device_id,
      payload.image_name,
      payload.total_chunks_count
    );

    buffer.metadata = payload;
    buffer.imageRecord = { image_id: result.image_id };
    buffer.payloadId = result.payload_id;
    buffer.sessionInfo = { session_id: result.session_id };
  } catch (err) {
    console.error('[Ingest] Exception handling metadata:', err);

    // Log to async_error_logs
    try {
      await supabase.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'edge_ingest',
        function_name: 'handleMetadata',
        payload: { metadata: payload },
        error_message: err instanceof Error ? err.message : String(err),
        error_details: { stack: err instanceof Error ? err.stack : null },
      });
    } catch (logErr) {
      console.error('[Ingest] Failed to log error:', logErr);
    }
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

    // Store chunk in buffer (idempotent via Postgres)
    const isFirstTime = await storeChunk(
      supabase,
      payload.device_id,
      payload.image_name,
      payload.chunk_id,
      chunkData
    );

    if (isFirstTime) {
      console.log('[Ingest] Chunk received:', payload.chunk_id, 'for', payload.image_name);
    } else {
      console.log('[Ingest] Duplicate chunk ignored:', payload.chunk_id, 'for', payload.image_name);
    }
  } catch (err) {
    console.error('[Ingest] Exception handling chunk:', err);
  }
}
