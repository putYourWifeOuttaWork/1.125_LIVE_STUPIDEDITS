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
import { publishSnapCommand, publishSleepCommand, calculateNextWake } from './ack.ts';
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
      .select('device_id, device_mac, wake_schedule_cron, company_id, manual_wake_override')
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
          // Unmapped or unprovisvioned device: Send SLEEP only (no image capture)
          console.log('[Ingest] Device not fully provisioned or unmapped - sending SLEEP only');
          await publishSleepCommand(client, normalizedMac, nextWakeFormatted, supabase, payloadId);

          // Update to sleep_only state
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
          // Provisioned and mapped: Check for pending images first
          console.log('[Ingest] Device provisioned - checking for pending images');

          const pendingCount = payload.pending_count || 0;

          // Check database for oldest incomplete image
          const { data: pendingImage } = await supabase
            .from('device_images')
            .select('image_id, image_name, status, received_chunks, total_chunks')
            .eq('device_id', existingDevice.device_id)
            .in('status', ['pending', 'receiving'])
            .order('captured_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (pendingCount > 0 && pendingImage) {
            // Device has pending image and we found it in DB - send ACK to resume
            console.log('[Ingest] Resuming pending image transfer:', pendingImage.image_name,
                       `(${pendingImage.received_chunks}/${pendingImage.total_chunks} chunks)`);

            // Update wake payload to track pending image resume
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

            // Send ACK for pending image (empty ACK_OK, no next_wake_time)
            const { publishPendingImageAck } = await import('./ack.ts');
            await publishPendingImageAck(client, normalizedMac, pendingImage.image_name, supabase);

            console.log('[Ingest] Pending image ACK sent - device will continue transfer');
          } else {
            // No pending images (or device reports 0) - proceed with new capture
            console.log('[Ingest] No pending images - initiating new image capture');

            // Update state to ACK sent
            if (payloadId) {
              await supabase
                .from('device_wake_payloads')
                .update({
                  protocol_state: 'ack_sent',
                  ack_sent_at: new Date().toISOString(),
                })
                .eq('payload_id', payloadId);
            }

            // Send SNAP command to capture new image
            await publishSnapCommand(client, normalizedMac, serverImageName, supabase, payloadId);

            console.log('[Ingest] Protocol flow initiated: HELLO -> ACK -> SNAP, waiting for metadata');
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
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(payload.device_id);
    if (!normalizedMac) {
      console.error('[Ingest] Invalid MAC address format:', payload.device_id);
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
      battery_voltage: (payload as any).battery_voltage, // Include if present (telemetry payloads)
      wifi_rssi: (payload as any).wifi_rssi,             // Include if present (telemetry payloads)
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

    // PHASE 2.3: Update wake_payload with image information and chunk tracking
    if (result.payload_id && result.image_id) {
      const { error: wakeUpdateError } = await supabase
        .from('device_wake_payloads')
        .update({
          image_id: result.image_id,
          image_status: 'receiving',
          wake_type: 'image_wake',
          chunk_count: payload.total_chunks_count,
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
    if (payload.temperature !== undefined || payload.humidity !== undefined ||
        payload.pressure !== undefined || payload.gas_resistance !== undefined) {

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
          captured_at: payload.capture_timestamp,
          temperature: celsiusToFahrenheit(payload.temperature),  // Convert Celsius → Fahrenheit
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
      const { data: alerts, error: alertError } = await supabase.rpc(
        'check_absolute_thresholds',
        {
          p_device_id: lineageData.device_id,
          p_temperature: payload.temperature || null,
          p_humidity: payload.humidity || null,
          p_mgi: null,
          p_measurement_timestamp: capturedAt,
        }
      );

      if (alertError) {
        console.error('[Ingest] Error checking alerts:', alertError);
      } else if (alerts && alerts.length > 0) {
        console.log('[Ingest] Alerts triggered:', alerts.length, 'alerts');
        alerts.forEach((alert: any) => {
          console.log(`  - ${alert.type} (${alert.severity}): ${alert.message}`);
        });
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
