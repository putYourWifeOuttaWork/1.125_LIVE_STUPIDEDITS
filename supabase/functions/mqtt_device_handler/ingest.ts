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
import { normalizeMacAddress } from './utils.ts';
import { publishCaptureCommand, publishSleepCommand, calculateNextWake } from './ack.ts';
import { formatNextWakeTime } from './protocol.ts';

// System user UUID for automated updates
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000001';

/**
 * Convert Celsius to Fahrenheit
 * Devices send temperature in Celsius, system stores in Fahrenheit
 * Formula: °F = (°C × 1.8) + 32
 */
function celsiusToFahrenheit(celsius: number | null | undefined): number | null {
  if (celsius === null || celsius === undefined) return null;

  // Validate input range (-40°C to 85°C is typical sensor range)
  if (celsius < -40 || celsius > 85) {
    console.warn(`[Temperature] Out of range Celsius value: ${celsius}°C`);
  }

  const fahrenheit = (celsius * 1.8) + 32;

  // Round to 2 decimal places
  return Math.round(fahrenheit * 100) / 100;
}

/**
 * Generate a unique device_code based on hardware version
 * Format: DEVICE-{HARDWARE}-{NNN} where NNN is zero-padded sequential number
 */
async function generateDeviceCode(supabase: SupabaseClient, hardwareVersion: string): Promise<string> {
  // Normalize hardware version for code generation
  const hwNormalized = hardwareVersion.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const prefix = `DEVICE-${hwNormalized}-`;

  // Query existing device codes with this prefix
  const { data: existingDevices } = await supabase
    .from('devices')
    .select('device_code')
    .like('device_code', `${prefix}%`)
    .order('device_code');

  // Extract numbers from existing codes
  const numbers: number[] = [];
  existingDevices?.forEach(d => {
    if (d.device_code) {
      const match = d.device_code.match(new RegExp(`${prefix}(\\d+)`));
      if (match) {
        numbers.push(parseInt(match[1]));
      }
    }
  });

  // Find the first available number (starting from 1)
  let nextNum = 1;
  while (numbers.includes(nextNum)) {
    nextNum++;
  }

  // Return zero-padded code
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

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
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(payload.device_mac || payload.device_id);
    if (!normalizedMac) {
      console.error('[Ingest] Invalid MAC address format:', payload.device_mac || payload.device_id);
      return;
    }

    // First, resolve lineage to get timezone for next wake calculation
    const { data: lineageData } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    const deviceTimezone = lineageData?.timezone || 'America/New_York'; // Fallback to Eastern

    // Check if device exists
    const { data: existingDevice, error: queryError } = await supabase
      .from('devices')
      .select('device_id, device_mac, wake_schedule_cron, company_id, manual_wake_override, archived_at')
      .eq('device_mac', normalizedMac)
      .maybeSingle();

    if (queryError) {
      console.error('[Ingest] Error querying device:', queryError);
      return;
    }

    const now = new Date().toISOString();

    if (!existingDevice) {
      // Auto-provision new device (per PDF Section 7)
      console.log('[Ingest] Auto-provisioning new device:', payload.device_id);

      // Generate unique device_code
      const hardwareVersion = payload.hardware_version || 'ESP32-S3';
      const deviceCode = await generateDeviceCode(supabase, hardwareVersion);
      console.log('[Ingest] Generated device_code:', deviceCode);

      const { data: newDevice, error: insertError } = await supabase
        .from('devices')
        .insert({
          device_mac: normalizedMac,
          device_code: deviceCode, // Add generated code
          mqtt_client_id: payload.device_id, // Store firmware-reported ID
          device_name: `Device ${payload.device_id}`,
          firmware_version: payload.firmware_version || 'unknown',
          hardware_version: hardwareVersion,
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

      console.log('[Ingest] Device auto-provisioned:', newDevice.device_id, 'Code:', deviceCode);
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

      if (existingDevice.archived_at) {
        console.log('[Ingest] Device was archived -- auto-restoring on HELLO');
        updateData.archived_at = null;
        updateData.archived_by_user_id = null;
        updateData.archive_reason = null;
        updateData.provisioning_status = 'pending_mapping';
      }

      // Check if this was a manual wake override
      const wasManualWake = existingDevice.manual_wake_override === true;
      if (wasManualWake) {
        console.log('[Ingest] Manual wake override detected - clearing flag and resuming schedule');
        updateData.manual_wake_override = false;
        updateData.manual_wake_requested_by = null;
        updateData.manual_wake_requested_at = null;
      }

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

      // Calculate next wake time
      // For manual wakes: Calculate from the PREVIOUS scheduled wake (before manual override)
      // For normal wakes: Calculate from THIS wake
      if (existingDevice.wake_schedule_cron) {
        // For manual wakes, we want to resume the regular schedule
        // Use the schedule to find the next occurrence after now (not based on manual time)
        const baseTime = wasManualWake ? now : now;

        const { data: nextWakeCalc, error: calcError } = await supabase.rpc(
          'fn_calculate_next_wake_time',
          {
            p_last_wake_at: baseTime,
            p_cron_expression: existingDevice.wake_schedule_cron,
            p_timezone: deviceTimezone
          }
        );

        if (!calcError && nextWakeCalc) {
          updateData.next_wake_at = nextWakeCalc;
          console.log(
            wasManualWake ? '[Ingest] Resuming scheduled wake:' : '[Ingest] Next wake calculated:',
            nextWakeCalc,
            'timezone:',
            deviceTimezone
          );
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

      // PHASE 2.3: Create wake_payload record for this wake event (per ESP32-CAM architecture)
      // Get active session for context
      let sessionId = null;
      if (lineageData?.site_id) {
        const { data: sessionData } = await supabase
          .from('site_device_sessions')
          .select('session_id')
          .eq('site_id', lineageData.site_id)
          .in('status', ['pending', 'in_progress'])
          .eq('session_date', new Date().toISOString().split('T')[0])
          .order('session_start_time', { ascending: false })
          .limit(1)
          .maybeSingle();
        sessionId = sessionData?.session_id || null;
      }

      // Generate server image name for this wake
      const timestamp = Date.now();
      const serverImageName = `${normalizedMac}_${timestamp}.jpg`;

      // Create consolidated wake_payload record with protocol state tracking
      // NOTE: ALL TEMPERATURES ARE IN FAHRENHEIT - device sends °F, we store °F
      const { data: wakePayload, error: wakeError } = await supabase
        .from('device_wake_payloads')
        .insert({
          device_id: existingDevice.device_id,
          company_id: existingDevice.company_id,
          program_id: lineageData?.program_id || null,
          site_id: lineageData?.site_id || null,
          site_device_session_id: sessionId,
          captured_at: now,
          received_at: now,
          temperature: celsiusToFahrenheit(payload.temperature),  // Convert Celsius → Fahrenheit
          humidity: payload.humidity,
          pressure: payload.pressure,
          gas_resistance: payload.gas_resistance,
          battery_voltage: payload.battery_voltage,
          wifi_rssi: payload.wifi_rssi,
          telemetry_data: payload,
          wake_type: 'hello',
          protocol_state: 'hello_received', // Initial state
          server_image_name: serverImageName,
          payload_status: 'pending', // Pending until SLEEP sent
          overage_flag: false,
          is_complete: false, // Not complete until SLEEP sent
        })
        .select('payload_id')
        .single();

      if (wakeError) {
        console.error('[Ingest] Error creating wake_payload:', wakeError);
        // Continue - wake tracking is supplementary
      } else {
        console.log('[Ingest] Wake payload created:', wakePayload?.payload_id, 'state: hello_received');

        // STATE MACHINE: Process HELLO and send appropriate commands
        const payloadId = wakePayload?.payload_id;
        const isProvisioned = lineageData?.provisioning_status === 'provisioned';
        const isMapped = lineageData?.site_id !== null;

        // Calculate next wake time (with site inheritance)
        const nextWake = await calculateNextWake(
          supabase,
          existingDevice.device_id,
          lineageData?.site_id || null,
          deviceTimezone
        );

        const nextWakeFormatted = nextWake ? formatNextWakeTime(nextWake) : '8:00AM'; // Default fallback

        if (!isProvisioned || !isMapped) {
          console.log('[Ingest] Device not fully provisioned or unmapped - sending SLEEP only');
          await publishSleepCommand(client, normalizedMac, nextWakeFormatted, supabase, payloadId);

          if (payloadId) {
            await supabase
              .from('device_wake_payloads')
              .update({
                protocol_state: 'sleep_only',
                payload_status: 'complete',
                is_complete: true,
              })
              .eq('payload_id', payloadId);
          }
        } else {
          console.log('[Ingest] Device provisioned - checking for active session and pending images');

          const { data: activePayload } = await supabase
            .from('device_wake_payloads')
            .select('payload_id, protocol_state')
            .eq('device_id', existingDevice.device_id)
            .in('protocol_state', ['capture_sent', 'snap_sent', 'ack_sent', 'ack_pending_sent', 'draining_pending'])
            .eq('is_complete', false)
            .neq('payload_id', payloadId || '')
            .order('received_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activePayload) {
            console.log(`[Ingest] Active session already exists for device (payload: ${activePayload.payload_id}, state: ${activePayload.protocol_state}) -- skipping command issuance to prevent conflict`);
            if (payloadId) {
              await supabase
                .from('device_wake_payloads')
                .update({
                  protocol_state: 'deferred_to_existing',
                  payload_status: 'complete',
                  is_complete: true,
                })
                .eq('payload_id', payloadId);
            }
          } else {
            const pendingCount = payload.pending_count ?? 0;

            const { data: pendingImage } = await supabase
              .from('device_images')
              .select('image_id, image_name, status, received_chunks, total_chunks')
              .eq('device_id', existingDevice.device_id)
              .in('status', ['pending', 'receiving'])
              .order('captured_at', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (pendingCount > 0 && pendingImage) {
              console.log('[Ingest] Resuming pending image transfer:', pendingImage.image_name,
                         `(${pendingImage.received_chunks}/${pendingImage.total_chunks} chunks)`);

              if (payloadId) {
                await supabase
                  .from('device_wake_payloads')
                  .update({
                    protocol_state: 'ack_pending_sent',
                    ack_sent_at: new Date().toISOString(),
                    server_image_name: pendingImage.image_name,
                    device_image_id: pendingImage.image_id,
                  })
                  .eq('payload_id', payloadId);
              }

              const { publishPendingImageAck } = await import('./ack.ts');
              await publishPendingImageAck(client, normalizedMac, pendingImage.image_name, supabase);

              console.log('[Ingest] Pending image ACK sent - device will continue transfer');
            } else {
              console.log('[Ingest] No pending images - sending capture_image command');

              if (payloadId) {
                await supabase
                  .from('device_wake_payloads')
                  .update({
                    protocol_state: 'capture_sent',
                    ack_sent_at: new Date().toISOString(),
                  })
                  .eq('payload_id', payloadId);
              }

              await publishCaptureCommand(client, normalizedMac, serverImageName, supabase, payloadId);

              console.log('[Ingest] Protocol flow initiated: HELLO -> capture_image, waiting for metadata');
            }
          }
        }
      }

      // Create historical telemetry record for battery & wifi tracking (legacy system)
      // NOTE: ALL TEMPERATURES IN FAHRENHEIT - device sends °C, converted to °F, stored as °F, alerts check °F
      if (payload.battery_voltage !== undefined || payload.wifi_rssi !== undefined) {
        const { error: telemetryError } = await supabase
          .from('device_telemetry')
          .insert({
            device_id: existingDevice.device_id,
            company_id: existingDevice.company_id,
            program_id: lineageData?.program_id || null,
            site_id: lineageData?.site_id || null,
            site_device_session_id: sessionId,
            wake_payload_id: wakePayload?.payload_id || null, // Link to wake payload
            captured_at: now,
            battery_voltage: payload.battery_voltage,
            wifi_rssi: payload.wifi_rssi,
            temperature: celsiusToFahrenheit(payload.temperature),  // Convert Celsius → Fahrenheit
            humidity: payload.humidity,
            pressure: payload.pressure,
            gas_resistance: payload.gas_resistance,
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
  } catch (err) {
    console.error('[Ingest] Error handling HELLO:', err);
  }
}

/**
 * Normalize metadata payload from firmware format to backend format
 * Firmware sends: timestamp, sensor_data (nested), max_chunks_size (with 's'), total_chunk_count (singular)
 * Backend expects: capture_timestamp, temperature (flat), max_chunk_size (no 's'), total_chunks_count (plural)
 */
function normalizeMetadataPayload(payload: ImageMetadata): ImageMetadata {
  // Extract sensor data from nested structure or use flat fields (backward compatibility)
  const sensorData = payload.sensor_data || {};

  const normalized: ImageMetadata = {
    ...payload,
    // Field name mappings (firmware → backend)
    capture_timestamp: payload.timestamp || payload.capture_timestamp || payload.capture_timeStamp || new Date().toISOString(),
    max_chunk_size: payload.max_chunks_size || payload.max_chunk_size || 1024,
    total_chunks_count: payload.total_chunk_count || payload.total_chunks_count || 0,

    // Extract sensor data from nested object (firmware sends nested, backend expects flat)
    temperature: sensorData.temperature ?? payload.temperature,
    humidity: sensorData.humidity ?? payload.humidity,
    pressure: sensorData.pressure ?? payload.pressure,
    gas_resistance: sensorData.gas_resistance ?? payload.gas_resistance,

    // Preserve other fields
    device_id: payload.device_id,
    image_name: payload.image_name,
    image_id: payload.image_id,
    image_size: payload.image_size,
    location: payload.location,
    error: payload.error,
    slot_index: payload.slot_index,
  };

  console.log('[Ingest] Normalized firmware metadata:', {
    timestamp_field: payload.timestamp ? 'timestamp' : payload.capture_timestamp ? 'capture_timestamp' : 'generated',
    sensor_data_nested: !!payload.sensor_data,
    temp: normalized.temperature,
    humidity: normalized.humidity,
    chunks_field: payload.total_chunk_count ? 'total_chunk_count (singular)' : 'total_chunks_count (plural)'
  });

  return normalized;
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
  // Normalize firmware format to backend format
  const normalized = normalizeMetadataPayload(payload);

  console.log('[Ingest] Metadata received:', normalized.image_name, 'chunks:', normalized.total_chunks_count, 'temp:', normalized.temperature);

  try {
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(normalized.device_id);
    if (!normalizedMac) {
      console.error('[Ingest] Invalid MAC address format:', normalized.device_id);
      return;
    }

    // Resolve device MAC to complete lineage using SQL function
    const { data: lineageData, error: lineageError } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
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

    // Prepare telemetry data JSON with schema-compliant field names (use normalized payload)
    const telemetryData = {
      captured_at: normalized.capture_timestamp, // Use schema name
      total_chunks: normalized.total_chunks_count, // Fix name
      image_size: normalized.image_size,
      max_chunk_size: normalized.max_chunk_size,
      temperature: normalized.temperature,
      humidity: normalized.humidity,
      pressure: normalized.pressure,
      gas_resistance: normalized.gas_resistance,
      battery_voltage: (normalized as any).battery_voltage, // Include if present (telemetry payloads)
      wifi_rssi: (normalized as any).wifi_rssi,             // Include if present (telemetry payloads)
      location: normalized.location,
      error_code: normalized.error,
      slot_index: normalized.slot_index,
    };

    // Call SQL handler: fn_wake_ingestion_handler
    const { data: result, error } = await supabase.rpc('fn_wake_ingestion_handler', {
      p_device_id: deviceId,
      p_captured_at: normalized.capture_timestamp!,
      p_image_name: normalized.image_name,
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

    // PHASE 2.3: Update wake_payload with image information and chunk tracking
    if (result.payload_id && result.image_id) {
      const { error: wakeUpdateError } = await supabase
        .from('device_wake_payloads')
        .update({
          image_id: result.image_id,
          image_status: 'receiving',
          wake_type: 'image_wake',
          chunk_count: normalized.total_chunks_count,
          chunks_received: 0,
        })
        .eq('payload_id', result.payload_id);

      if (wakeUpdateError) {
        console.error('[Ingest] Error updating wake_payload with image info:', wakeUpdateError);
        // Don't fail - wake tracking is supplementary
      } else {
        console.log('[Ingest] Wake payload updated with image info:', result.payload_id);
      }
    }

    // Create historical telemetry record if environmental data present
    if (normalized.temperature !== undefined || normalized.humidity !== undefined ||
        normalized.pressure !== undefined || normalized.gas_resistance !== undefined) {

      // Get active session for context
      let sessionId = null;
      if (lineageData.site_id) {
        const { data: sessionData } = await supabase
          .from('site_device_sessions')
          .select('session_id')
          .eq('site_id', lineageData.site_id)
          .in('status', ['pending', 'in_progress'])
          .eq('session_date', new Date().toISOString().split('T')[0])
          .order('session_start_time', { ascending: false })
          .limit(1)
          .maybeSingle();
        sessionId = sessionData?.session_id || null;
      }

      // NOTE: ALL TEMPERATURES IN FAHRENHEIT - device sends °C, converted to °F, stored as °F, alerts check °F
      const { error: telemetryError } = await supabase
        .from('device_telemetry')
        .insert({
          device_id: lineageData.device_id,
          company_id: lineageData.company_id,
          program_id: lineageData.program_id,         // ✅ INHERIT FROM DEVICE
          site_id: lineageData.site_id,               // ✅ INHERIT FROM DEVICE
          site_device_session_id: sessionId,          // ✅ ACTIVE SESSION
          wake_payload_id: result.payload_id,         // ✅ LINK TO WAKE PAYLOAD
          captured_at: normalized.capture_timestamp!,
          temperature: celsiusToFahrenheit(normalized.temperature),  // Convert Celsius → Fahrenheit
          humidity: normalized.humidity,
          pressure: normalized.pressure,
          gas_resistance: normalized.gas_resistance,
          // battery_voltage and wifi_rssi not in metadata payload
        });

      if (telemetryError) {
        console.error('[Ingest] Error creating telemetry from metadata:', telemetryError);
        // Don't fail - telemetry is secondary
      } else {
        console.log('[Ingest] Telemetry recorded: temp=', normalized.temperature, 'rh=', normalized.humidity);
      }
    }

    // Store in buffer for chunk assembly
    const buffer = await getOrCreateBuffer(
      supabase,
      normalized.device_id,
      normalized.image_name,
      normalized.total_chunks_count!
    );

    buffer.metadata = normalized;
    buffer.imageRecord = {
      image_id: result.image_id,
      wake_payload_id: result.payload_id  // Link to wake payload for finalization
    };
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
 * Firmware sends base64-encoded payload, we decode to binary
 */
export async function handleChunk(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: ImageChunk
): Promise<void> {
  try {
    let chunkData: Uint8Array;

    // Handle both base64 string (firmware format) and number array (processed format)
    if (typeof payload.payload === 'string') {
      // Firmware sends base64-encoded string - decode it
      console.log('[Ingest] Decoding base64 chunk:', payload.chunk_id, 'length:', payload.payload.length);

      // Use Deno's built-in atob for base64 decoding
      const binaryString = atob(payload.payload);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      chunkData = bytes;

      console.log('[Ingest] Decoded chunk size:', chunkData.length, 'bytes');
    } else if (Array.isArray(payload.payload)) {
      // Already processed as number array
      chunkData = new Uint8Array(payload.payload);
    } else {
      console.error('[Ingest] Invalid payload format:', typeof payload.payload);
      return;
    }

    // Validate chunk has data
    if (chunkData.length === 0) {
      console.error('[Ingest] Chunk', payload.chunk_id, 'has zero length after decoding');
      return;
    }

    // For first chunk, verify JPEG header
    if (payload.chunk_id === 0) {
      const jpegHeader = chunkData.slice(0, 3);
      if (jpegHeader[0] === 0xFF && jpegHeader[1] === 0xD8 && jpegHeader[2] === 0xFF) {
        console.log('[Ingest] ✅ Valid JPEG header detected in first chunk');
      } else {
        console.warn('[Ingest] ⚠️ Warning: First chunk may not have valid JPEG header:',
          Array.from(jpegHeader).map(b => b.toString(16).padStart(2, '0')).join(' '));
      }
    }

    // Store chunk in buffer (idempotent via Postgres)
    const isFirstTime = await storeChunk(
      supabase,
      payload.device_id,
      payload.image_name,
      payload.chunk_id,
      chunkData
    );

    if (isFirstTime) {
      console.log('[Ingest] Chunk received:', payload.chunk_id, 'for', payload.image_name, '(', chunkData.length, 'bytes)');
    } else {
      console.log('[Ingest] Duplicate chunk ignored:', payload.chunk_id, 'for', payload.image_name);
    }
  } catch (err) {
    console.error('[Ingest] Exception handling chunk:', err);
    console.error('[Ingest] Payload type:', typeof payload.payload, 'chunk_id:', payload.chunk_id);
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
  const deviceMac = (payload as any).device_mac || payload.device_id;
  console.log('[Ingest] Telemetry-only from device:', deviceMac, 'temp:', payload.temperature, 'rh:', payload.humidity);

  try {
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(deviceMac);
    if (!normalizedMac) {
      console.error('[Ingest] Invalid MAC address format:', deviceMac);
      return;
    }

    // Resolve device MAC to get device_id and company_id
    const { data: lineageData, error: lineageError } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
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
      const capturedAt = payload.captured_at || (payload as any).capture_timestamp || new Date().toISOString();
      const deviceUpdates: any = {
        last_seen_at: capturedAt,
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

    // Get active session for the site (if exists)
    let sessionId = null;
    if (lineageData.site_id) {
      const { data: sessionData } = await supabase
        .from('site_device_sessions')
        .select('session_id')
        .eq('site_id', lineageData.site_id)
        .in('status', ['pending', 'in_progress'])
        .eq('session_date', new Date().toISOString().split('T')[0])
        .order('session_start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      sessionId = sessionData?.session_id || null;
    }

    // Insert into device_telemetry table with FULL CONTEXT
    // DOES NOT create device_images or touch session counters
    // NOTE: ALL TEMPERATURES IN FAHRENHEIT - device sends °F, we store °F, alerts check °F
    const capturedAt = payload.captured_at || (payload as any).capture_timestamp || new Date().toISOString();
    const { error: insertError } = await supabase
      .from('device_telemetry')
      .insert({
        device_id: lineageData.device_id,
        company_id: lineageData.company_id,
        program_id: lineageData.program_id,           // ✅ INHERIT FROM DEVICE
        site_id: lineageData.site_id,                 // ✅ INHERIT FROM DEVICE
        site_device_session_id: sessionId,            // ✅ ACTIVE SESSION
        wake_payload_id: null,                        // OK - telemetry-only has no wake payload
        captured_at: capturedAt,
        temperature: celsiusToFahrenheit(payload.temperature),  // Convert Celsius → Fahrenheit
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

    // Check for threshold alerts
    try {
      // Convert temperature to Fahrenheit for alert checking (thresholds are in Fahrenheit)
      const tempFahrenheit = celsiusToFahrenheit(payload.temperature);

      // Check absolute thresholds
      const { data: absoluteAlerts, error: alertError } = await supabase.rpc(
        'check_absolute_thresholds',
        {
          p_device_id: lineageData.device_id,
          p_temperature: tempFahrenheit,
          p_humidity: payload.humidity || null,
          p_mgi: null,
          p_measurement_timestamp: capturedAt,
        }
      );

      if (alertError) {
        console.error('[Ingest] Error checking absolute threshold alerts:', alertError);
      } else if (absoluteAlerts && absoluteAlerts.length > 0) {
        console.log('[Ingest] Absolute threshold alerts triggered:', absoluteAlerts.length, 'alerts');
        absoluteAlerts.forEach((alert: any) => {
          console.log(`  - ${alert.type} (${alert.severity}): ${alert.message}`);
        });
      }

      // Check combination zones (temp + humidity danger zones)
      if (tempFahrenheit !== null && payload.humidity !== null) {
        const { data: comboAlerts, error: comboError } = await supabase.rpc(
          'check_combination_zones',
          {
            p_device_id: lineageData.device_id,
            p_temperature: tempFahrenheit,
            p_humidity: payload.humidity,
            p_measurement_timestamp: capturedAt,
          }
        );

        if (comboError) {
          console.error('[Ingest] Error checking combination zone alerts:', comboError);
        } else if (comboAlerts && comboAlerts.length > 0) {
          console.log('[Ingest] Combination zone alerts triggered:', comboAlerts.length, 'alerts');
          comboAlerts.forEach((alert: any) => {
            console.log(`  - ${alert.type} (${alert.severity}): ${alert.message}`);
          });
        }
      }
    } catch (alertErr) {
      console.error('[Ingest] Exception checking alerts:', alertErr);
      // Don't fail the whole operation if alert check fails
    }

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
