/**
 * Phase 3 - Ingest Module (SQL-Compliant)
 *
 * Handle HELLO status and image metadata/chunk ingestion
 * CALLS SQL HANDLERS - NO INLINE SQL
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { DeviceStatusMessage, ImageMetadata, ImageChunk, TelemetryOnlyMessage } from './types.ts';
import { getOrCreateBuffer, storeChunk } from './idempotency.ts';

// System user UUID for automated updates
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000001';

/**
 * Handle device HELLO status message
 * Auto-provisions new devices or updates existing ones
 * Updates last_seen_at, battery data, wifi_rssi, mqtt_client_id, and calculates next_wake_at
 */
export async function handleHelloStatus(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: DeviceStatusMessage
): Promise<void> {
  console.log('[Ingest] HELLO from device:', payload.device_id, 'MAC:', payload.device_mac, 'pending:', payload.pending_count || 0);

  try {
    // First, resolve lineage to get timezone for next wake calculation
    const { data: lineageData } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: payload.device_mac || payload.device_id }
    );

    const deviceTimezone = lineageData?.timezone || 'America/New_York'; // Fallback to Eastern

    // Check if device exists
    const { data: existingDevice, error: queryError } = await supabase
      .from('devices')
      .select('device_id, device_mac, wake_schedule_cron, company_id')
      .eq('device_mac', payload.device_mac || payload.device_id)
      .maybeSingle();

    if (queryError) {
      console.error('[Ingest] Error querying device:', queryError);
      return;
    }

    const now = new Date().toISOString();

    if (!existingDevice) {
      // Auto-provision new device (per PDF Section 7)
      console.log('[Ingest] Auto-provisioning new device:', payload.device_id);

      // Generate unique device_code by finding the next available number
      const hardwareType = payload.hardware_version || 'ESP32-S3';
      const codePrefix = `DEVICE-${hardwareType.replace(/[^A-Z0-9]/g, '')}-`;

      // Query last device code with this prefix
      const { data: lastDevice } = await supabase
        .from('devices')
        .select('device_code')
        .like('device_code', `${codePrefix}%`)
        .order('device_code', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNumber = 1;
      if (lastDevice && lastDevice.device_code) {
        const match = lastDevice.device_code.match(/-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      const deviceCode = `${codePrefix}${String(nextNumber).padStart(3, '0')}`;
      console.log('[Ingest] Generated device_code:', deviceCode);

      const { data: newDevice, error: insertError } = await supabase
        .from('devices')
        .insert({
          device_mac: payload.device_mac || payload.device_id,
          device_code: deviceCode, // CRITICAL: Must be unique
          mqtt_client_id: payload.device_id, // Store firmware-reported ID
          device_name: `Device ${payload.device_id}`,
          firmware_version: payload.firmware_version || 'unknown',
          hardware_version: hardwareType,
          battery_voltage: payload.battery_voltage, // Trigger auto-calculates health
          wifi_rssi: payload.wifi_rssi,
          wifi_ssid: null, // Will be set during mapping
          provisioning_status: 'pending_mapping', // Auto-discovered, needs mapping
          device_type: 'physical',
          is_active: true,
          last_seen_at: now,
          last_wake_at: now, // Track actual wake time
          last_updated_by_user_id: SYSTEM_USER_UUID, // System update
          notes: `Auto-provisioned from MQTT HELLO on ${now}`,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Ingest] Error auto-provisioning device:', insertError);
        return;
      }

      console.log('[Ingest] Device auto-provisioned:', newDevice.device_id, 'Code:', newDevice.device_code);
      return; // Done with auto-provisioning
    } else {
      // Update existing device
      const updateData: any = {
        last_seen_at: now,
        last_wake_at: now, // CRITICAL: Track actual wake time for next wake calculation
        is_active: true,
        mqtt_client_id: payload.device_id, // Store/update firmware ID
        last_updated_by_user_id: SYSTEM_USER_UUID, // System update
      };

      // Update battery voltage (trigger auto-calculates health_percent)
      if (payload.battery_voltage !== undefined) {
        updateData.battery_voltage = payload.battery_voltage;
      }

      // Update WiFi signal strength
      if (payload.wifi_rssi !== undefined) {
        updateData.wifi_rssi = payload.wifi_rssi;
      }

      // Update firmware/hardware versions if changed
      if (payload.firmware_version) {
        updateData.firmware_version = payload.firmware_version;
      }
      if (payload.hardware_version) {
        updateData.hardware_version = payload.hardware_version;
      }

      // Calculate next wake time based on THIS actual wake + schedule
      if (existingDevice.wake_schedule_cron) {
        const { data: nextWakeCalc, error: calcError } = await supabase.rpc(
          'fn_calculate_next_wake_time',
          {
            p_last_wake_at: now,
            p_cron_expression: existingDevice.wake_schedule_cron,
            p_timezone: deviceTimezone
          }
        );

        if (!calcError && nextWakeCalc) {
          updateData.next_wake_at = nextWakeCalc;
          console.log('[Ingest] Next wake calculated:', nextWakeCalc, 'timezone:', deviceTimezone);
        } else if (calcError) {
          console.error('[Ingest] Error calculating next wake:', calcError);
        }
      }

      // Update device record
      const { error: updateError } = await supabase
        .from('devices')
        .update(updateData)
        .eq('device_id', existingDevice.device_id);

      if (updateError) {
        console.error('[Ingest] Error updating device:', updateError);
        return;
      }

      // Create historical telemetry record for battery & wifi tracking
      if (payload.battery_voltage !== undefined || payload.wifi_rssi !== undefined) {
        const { error: telemetryError } = await supabase
          .from('device_telemetry')
          .insert({
            device_id: existingDevice.device_id,
            company_id: existingDevice.company_id,
            captured_at: now,
            battery_voltage: payload.battery_voltage,
            wifi_rssi: payload.wifi_rssi,
            // No environmental sensors in HELLO message
          });

        if (telemetryError) {
          console.error('[Ingest] Error creating telemetry record:', telemetryError);
          // Don't return - telemetry is secondary to device update
        }
      }

      console.log('[Ingest] Device updated:', existingDevice.device_id,
                  'Battery:', payload.battery_voltage, 'WiFi:', payload.wifi_rssi,
                  'Next wake:', updateData.next_wake_at);
    }

    // If pending images, log for monitoring
    if (payload.pending_count && payload.pending_count > 0) {
      console.log('[Ingest] Device has pending images:', payload.pending_count);
      // Device will send automatically - no action needed per PDF Section 8.5
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
    // Resolve device MAC to complete lineage using SQL function
    const { data: lineageData, error: lineageError } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: payload.device_id }
    );

    if (lineageError) {
      console.error('[Ingest] Error resolving device lineage:', lineageError);
      return;
    }

    if (!lineageData) {
      console.error('[Ingest] Device not found or inactive:', payload.device_id);
      return;
    }

    // Check for incomplete lineage
    if (lineageData.error) {
      console.error('[Ingest] Incomplete device lineage:', lineageData.error, lineageData);
      return;
    }

    // Validate complete lineage
    if (!lineageData.device_id || !lineageData.site_id || !lineageData.program_id || !lineageData.company_id) {
      console.error('[Ingest] Missing required lineage fields:', lineageData);
      return;
    }

    console.log('[Ingest] Device lineage resolved:', {
      device: lineageData.device_name,
      site: lineageData.site_name,
      program: lineageData.program_name,
      company: lineageData.company_name,
      timezone: lineageData.timezone,
    });

    const deviceId = lineageData.device_id;

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

    // Create historical telemetry record if environmental data present
    if (payload.temperature !== undefined || payload.humidity !== undefined ||
        payload.pressure !== undefined || payload.gas_resistance !== undefined) {

      const { error: telemetryError } = await supabase
        .from('device_telemetry')
        .insert({
          device_id: lineageData.device_id,
          company_id: lineageData.company_id,
          captured_at: payload.capture_timestamp,
          temperature: payload.temperature,
          humidity: payload.humidity,
          pressure: payload.pressure,
          gas_resistance: payload.gas_resistance,
          // battery_voltage and wifi_rssi not in metadata payload
        });

      if (telemetryError) {
        console.error('[Ingest] Error creating telemetry from metadata:', telemetryError);
        // Don't fail - telemetry is secondary
      } else {
        console.log('[Ingest] Telemetry recorded: temp=', payload.temperature, 'rh=', payload.humidity);
      }
    }

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

/**
 * Handle telemetry-only message (Phase 1)
 * Records sensor data WITHOUT creating device_images or session entries
 */
export async function handleTelemetryOnly(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: TelemetryOnlyMessage
): Promise<void> {
  console.log('[Ingest] Telemetry-only from device:', payload.device_id, 'temp:', payload.temperature, 'rh:', payload.humidity);

  try {
    // Resolve device MAC to get device_id and company_id
    const { data: lineageData, error: lineageError } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: payload.device_id }
    );

    if (lineageError) {
      console.error('[Ingest] Error resolving device lineage:', lineageError);
      return;
    }

    if (!lineageData) {
      console.error('[Ingest] Device not found or inactive:', payload.device_id);
      return;
    }

    // Check for incomplete lineage
    if (lineageData.error) {
      console.error('[Ingest] Incomplete device lineage:', lineageData.error);
      return;
    }

    // Validate required fields
    if (!lineageData.device_id || !lineageData.company_id) {
      console.error('[Ingest] Missing device_id or company_id in lineage');
      return;
    }

    console.log('[Ingest] Telemetry device resolved:', {
      device: lineageData.device_name,
      company: lineageData.company_name,
    });

    // Update device properties if battery or wifi data present
    if (payload.battery_voltage !== undefined || payload.wifi_rssi !== undefined) {
      const deviceUpdates: any = {
        last_seen_at: payload.captured_at,
        last_updated_by_user_id: SYSTEM_USER_UUID, // System update
      };

      if (payload.battery_voltage !== undefined) {
        deviceUpdates.battery_voltage = payload.battery_voltage; // Trigger calculates health
      }
      if (payload.wifi_rssi !== undefined) {
        deviceUpdates.wifi_rssi = payload.wifi_rssi;
      }

      const { error: updateError } = await supabase
        .from('devices')
        .update(deviceUpdates)
        .eq('device_id', lineageData.device_id);

      if (updateError) {
        console.error('[Ingest] Error updating device from telemetry:', updateError);
        // Don't return - continue with telemetry insert
      } else {
        console.log('[Ingest] Device properties updated from telemetry:',
                    'Battery:', payload.battery_voltage, 'WiFi:', payload.wifi_rssi);
      }
    }

    // Insert into device_telemetry table
    // DOES NOT create device_images or touch session counters
    const { error: insertError } = await supabase
      .from('device_telemetry')
      .insert({
        device_id: lineageData.device_id,
        company_id: lineageData.company_id,
        captured_at: payload.captured_at,
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        gas_resistance: payload.gas_resistance,
        battery_voltage: payload.battery_voltage,
        wifi_rssi: payload.wifi_rssi,
      });

    if (insertError) {
      console.error('[Ingest] Error inserting telemetry:', insertError);
      return;
    }

    console.log('[Ingest] Telemetry saved successfully for device:', lineageData.device_name);

  } catch (err) {
    console.error('[Ingest] Exception handling telemetry:', err);

    // Log to async_error_logs
    try {
      await supabase.from('async_error_logs').insert({
        table_name: 'device_telemetry',
        trigger_name: 'edge_ingest_telemetry',
        function_name: 'handleTelemetryOnly',
        payload: { telemetry: payload },
        error_message: err instanceof Error ? err.message : String(err),
        error_details: { stack: err instanceof Error ? err.stack : null },
      });
    } catch (logErr) {
      console.error('[Ingest] Failed to log error:', logErr);
    }
  }
}
