/**
 * Phase 3 - MQTT Device Handler (HTTP Webhook Mode) - BUNDLED SINGLE FILE
 *
 * HTTP webhook receiver that processes MQTT messages forwarded from local MQTT service
 * All modules bundled into single file for Supabase Dashboard deployment
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DeviceStatusMessage {
  device_id: string;
  device_mac?: string;
  status: "alive";
  pending_count?: number;
  pendingImg?: number;
  firmware_version?: string;
  hardware_version?: string;
  wifi_rssi?: number;
  battery_voltage?: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
}

interface ImageMetadata {
  device_id: string;
  capture_timestamp: string;
  image_name: string;
  image_size: number;
  max_chunk_size: number;
  total_chunks_count: number;
  location?: string;
  error: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  slot_index?: number;
}

interface ImageChunk {
  device_id: string;
  image_name: string;
  chunk_id: number;
  max_chunk_size: number;
  payload: number[];
}

interface TelemetryOnlyMessage {
  device_id: string;
  captured_at: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  battery_voltage?: number;
  wifi_rssi?: number;
}

interface ImageBuffer {
  metadata: ImageMetadata | null;
  chunks: Map<number, Uint8Array>;
  totalChunks: number;
  imageRecord: any;
  payloadId: string | null;
  sessionInfo: any;
  createdAt: Date;
}

interface EdgeConfig {
  supabase: {
    url: string;
    serviceKey: string;
  };
  storage: {
    bucket: string;
  };
}

// ============================================
// PROTOCOL MODULE (BrainlyTree ESP32-CAM Spec)
// ============================================

/**
 * Protocol-compliant MQTT field names (EXACT as firmware expects)
 */
const PROTOCOL_FIELDS = {
  DEVICE_ID: 'device_id',
  STATUS: 'status',
  PENDING_IMG: 'pendingImg',
  CAPTURE_IMAGE: 'capture_image',
  SEND_IMAGE: 'send_image',
  NEXT_WAKE: 'next_wake',
  CAPTURE_TIMESTAMP: 'capture_timestamp',
  IMAGE_NAME: 'image_name',
  IMAGE_SIZE: 'image_size',
  MAX_CHUNK_SIZE: 'max_chunk_size',
  TOTAL_CHUNKS_COUNT: 'total_chunks_count',
  LOCATION: 'location',
  ERROR: 'error',
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  PRESSURE: 'pressure',
  GAS_RESISTANCE: 'gas_resistance',
  CHUNK_ID: 'chunk_id',
  PAYLOAD: 'payload',
  ACK_OK: 'ACK_OK',
  NEXT_WAKE_TIME: 'next_wake_time',
  MISSING_CHUNKS: 'missing_chunks',
} as const;

const PROTOCOL_TOPICS = {
  STATUS: (macId: string) => `ESP32CAM/${macId}/status`,
  DATA: (macId: string) => `ESP32CAM/${macId}/data`,
  CMD: (macId: string) => `ESP32CAM/${macId}/cmd`,
  ACK: (macId: string) => `ESP32CAM/${macId}/ack`,
} as const;

function formatNextWakeTime(timestamp: Date): string {
  const hours = timestamp.getHours();
  const minutes = timestamp.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes}${period}`;
}

async function logMqttMessage(
  supabase: SupabaseClient,
  macAddress: string,
  direction: 'inbound' | 'outbound',
  topic: string,
  payload: any,
  messageType: string,
  sessionId?: string | null,
  wakePayloadId?: string | null,
  imageName?: string | null,
  chunkId?: number | null
): Promise<void> {
  try {
    await supabase.rpc('log_mqtt_message', {
      p_mac_address: macAddress,
      p_direction: direction,
      p_topic: topic,
      p_payload: payload,
      p_message_type: messageType,
      p_session_id: sessionId || null,
      p_wake_payload_id: wakePayloadId || null,
      p_image_name: imageName || null,
      p_chunk_id: chunkId || null,
    });
  } catch (err) {
    console.error('[Protocol] Failed to log MQTT message:', err);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Checks if the input is a valid MAC address pattern
 *
 * @param input - String to check
 * @returns True if input matches MAC address pattern
 */
function isValidMacAddress(input: string): boolean {
  // Remove common separators and check if result is 12 hex characters
  const cleaned = input.replace(/[:\-\s]/g, '');
  return /^[0-9A-Fa-f]{12}$/.test(cleaned);
}

/**
 * Normalizes device identifier to standard format
 *
 * Handles both MAC addresses and special device identifiers:
 * - MAC addresses: Converts to uppercase 12-character string without separators
 * - Special identifiers: Preserves TEST-, SYSTEM:, VIRTUAL: prefixes
 *
 * Examples:
 *   "98:A3:16:F8:29:28"      -> "98A316F82928"
 *   "98-a3-16-f8-29-28"      -> "98A316F82928"
 *   "98A316F82928"           -> "98A316F82928"
 *   "TEST-ESP32-002"         -> "TEST-ESP32-002"
 *   "SYSTEM:AUTO:GENERATED"  -> "SYSTEM:AUTO:GENERATED"
 *   "VIRTUAL:SIMULATOR:001"  -> "VIRTUAL:SIMULATOR:001"
 *
 * @param identifier - Device identifier (MAC or special identifier)
 * @returns Normalized identifier or null if invalid
 */
function normalizeMacAddress(identifier: string | null | undefined): string | null {
  if (!identifier) {
    return null;
  }

  const upper = identifier.toUpperCase();

  // Check for special identifier prefixes - preserve as-is
  if (upper.startsWith('TEST-') || upper.startsWith('SYSTEM:') || upper.startsWith('VIRTUAL:')) {
    return upper;
  }

  // Check if it looks like a MAC address
  if (!isValidMacAddress(identifier)) {
    console.warn(`Invalid device identifier format: "${identifier}"`);
    return null;
  }

  // Normalize MAC address: remove separators and uppercase
  return identifier.replace(/[:\-\s]/g, '').toUpperCase();
}

// ============================================
// CONFIGURATION
// ============================================

function loadConfig(): EdgeConfig {
  const config: EdgeConfig = {
    supabase: {
      url: Deno.env.get('SUPABASE_URL')!,
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    storage: {
      bucket: Deno.env.get('STORAGE_BUCKET') || 'device-images',
    },
  };

  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  return config;
}

// ============================================
// IDEMPOTENCY MODULE (Postgres-backed)
// ============================================

const metadataCache = new Map<string, ImageBuffer>();

function getImageKey(deviceMac: string, imageName: string): string {
  return `${deviceMac}|${imageName}`;
}

async function getOrCreateBuffer(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<ImageBuffer> {
  const key = getImageKey(deviceMac, imageName);

  if (metadataCache.has(key)) {
    return metadataCache.get(key)!;
  }

  const buffer: ImageBuffer = {
    metadata: null,
    chunks: new Map(),
    totalChunks,
    imageRecord: null,
    payloadId: null,
    sessionInfo: null,
    createdAt: new Date(),
  };

  metadataCache.set(key, buffer);
  return buffer;
}

async function getBuffer(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string
): Promise<ImageBuffer | null> {
  const key = getImageKey(deviceMac, imageName);
  return metadataCache.get(key) || null;
}

async function storeChunk(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  chunkIndex: number,
  chunkData: Uint8Array
): Promise<boolean> {
  const key = `${deviceMac}|${imageName}|${chunkIndex}`;

  try {
    const { data } = await supabase
      .from('edge_chunk_buffer')
      .upsert({
        chunk_key: key,
        device_mac: deviceMac,
        image_name: imageName,
        chunk_index: chunkIndex,
        chunk_data: Array.from(chunkData),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, {
        onConflict: 'chunk_key',
        ignoreDuplicates: true,
      })
      .select('chunk_key')
      .maybeSingle();

    return !!data;
  } catch (err) {
    console.error('[Idempotency] Error storing chunk:', err);
    return false;
  }
}

async function isComplete(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<boolean> {
  const { count, error } = await supabase
    .from('edge_chunk_buffer')
    .select('*', { count: 'exact', head: true })
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) {
    console.error('[Idempotency] Error checking completion:', error);
    return false;
  }

  return (count || 0) === totalChunks;
}

async function getMissingChunks(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<number[]> {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .select('chunk_index')
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) {
    console.error('[Idempotency] Error fetching chunks:', error);
    return [];
  }

  const receivedIndices = new Set((data || []).map(r => r.chunk_index));
  const missing: number[] = [];

  for (let i = 0; i < totalChunks; i++) {
    if (!receivedIndices.has(i)) {
      missing.push(i);
    }
  }

  return missing;
}

async function assembleImage(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .select('chunk_index, chunk_data')
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName)
    .order('chunk_index', { ascending: true });

  if (error || !data || data.length !== totalChunks) {
    console.error('[Idempotency] Error assembling image:', error);
    return null;
  }

  const chunks: Uint8Array[] = data.map(row => new Uint8Array(row.chunk_data));
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  console.log('[Idempotency] Assembled image:', imageName, `(${totalLength} bytes)`);
  return merged;
}

async function clearBuffer(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string
): Promise<void> {
  const key = getImageKey(deviceMac, imageName);
  metadataCache.delete(key);

  await supabase
    .from('edge_chunk_buffer')
    .delete()
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);
}

async function cleanupStaleBuffers(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('chunk_key');

  if (error) return 0;
  return (data || []).length;
}

// ============================================
// STORAGE MODULE
// ============================================

async function uploadImage(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  imageBuffer: Uint8Array,
  bucketName: string
): Promise<string | null> {
  try {
    const { data: lineageData } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: deviceMac }
    );

    let filePath: string;
    if (lineageData?.company_id && lineageData?.site_id) {
      const { data: pathData } = await supabase.rpc(
        'fn_build_device_image_path',
        {
          p_company_id: lineageData.company_id,
          p_site_id: lineageData.site_id,
          p_device_mac: deviceMac,
          p_image_name: imageName,
        }
      );
      filePath = pathData || `${deviceMac}/${imageName}`;
    } else {
      filePath = `${deviceMac}/${imageName}`;
    }

    console.log('[Storage] Uploading image:', filePath, `(${imageBuffer.length} bytes)`);

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[Storage] Upload error:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    console.log('[Storage] Upload successful:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (err) {
    console.error('[Storage] Exception during upload:', err);
    return null;
  }
}

// ============================================
// SCHEDULER MODULE
// ============================================

function calculateNextWake(cronExpression: string, fromTime?: Date): string {
  const now = fromTime || new Date();
  const nextWake = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours default
  return nextWake.toISOString();
}

// ============================================
// ACK MODULE (NO MQTT CLIENT - HTTP Mode)
// ============================================

async function logAckToAudit(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  ackType: string,
  topic: string,
  payload: any,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    await supabase.rpc('fn_log_device_ack', {
      p_device_mac: deviceMac,
      p_image_name: imageName,
      p_ack_type: ackType,
      p_mqtt_topic: topic,
      p_mqtt_payload: payload,
      p_mqtt_success: success,
      p_mqtt_error: error || null,
    });
  } catch (err) {
    console.error('[ACK] Failed to log to audit:', err);
  }
}

// ============================================
// INGEST MODULE
// ============================================

const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000001';

async function generateDeviceCode(supabase: SupabaseClient, hardwareVersion: string): Promise<string> {
  const hwNormalized = hardwareVersion.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const prefix = `DEVICE-${hwNormalized}-`;

  const { data: existingDevices } = await supabase
    .from('devices')
    .select('device_code')
    .like('device_code', `${prefix}%`)
    .order('device_code');

  const numbers: number[] = [];
  existingDevices?.forEach(d => {
    if (d.device_code) {
      const match = d.device_code.match(new RegExp(`${prefix}(\\d+)`));
      if (match) {
        numbers.push(parseInt(match[1]));
      }
    }
  });

  let nextNum = 1;
  while (numbers.includes(nextNum)) {
    nextNum++;
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

async function handleHelloStatus(
  supabase: SupabaseClient,
  payload: DeviceStatusMessage
): Promise<void> {
  const macAddress = payload.device_mac || payload.device_id;
  const pendingCount = payload.pendingImg || payload.pending_count || 0;

  console.log('[Ingest] HELLO from device:', payload.device_id, 'MAC:', macAddress, 'pending:', pendingCount);

  // Normalize MAC address (remove separators, uppercase)
  const normalizedMac = normalizeMacAddress(macAddress);
  if (!normalizedMac) {
    console.error('[Ingest] Invalid MAC address format:', macAddress);
    return;
  }

  // Log MQTT message
  await logMqttMessage(
    supabase,
    normalizedMac,
    'inbound',
    PROTOCOL_TOPICS.STATUS(normalizedMac),
    payload,
    'hello'
  );

  try {
    const { data: lineageData } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    const deviceTimezone = lineageData?.timezone || 'America/New_York';

    const { data: existingDevice, error: queryError } = await supabase
      .from('devices')
      .select('device_id, device_mac, wake_schedule_cron, company_id')
      .eq('device_mac', normalizedMac)
      .maybeSingle();

    if (queryError) {
      console.error('[Ingest] Error querying device:', queryError);
      return;
    }

    const now = new Date().toISOString();

    if (!existingDevice) {
      // Auto-provision new device
      console.log('[Ingest] Auto-provisioning new device:', payload.device_id);

      const hardwareVersion = payload.hardware_version || 'ESP32-S3';
      const deviceCode = await generateDeviceCode(supabase, hardwareVersion);

      await supabase
        .from('devices')
        .insert({
          device_mac: normalizedMac,
          device_code: deviceCode,
          mqtt_client_id: payload.device_id,
          device_name: `Device ${payload.device_id}`,
          firmware_version: payload.firmware_version || 'unknown',
          hardware_version: hardwareVersion,
          battery_voltage: payload.battery_voltage,
          wifi_rssi: payload.wifi_rssi,
          provisioning_status: 'pending_mapping',
          device_type: 'physical',
          is_active: true,
          last_seen_at: now,
          last_wake_at: now,
          last_updated_by_user_id: SYSTEM_USER_UUID,
          notes: `Auto-provisioned from MQTT HELLO on ${now}`,
        });

      console.log('[Ingest] Device auto-provisioned:', deviceCode);
      return;
    }

    // Update existing device
    const updateData: any = {
      last_seen_at: now,
      last_wake_at: now,
      is_active: true,
      mqtt_client_id: payload.device_id,
      last_updated_by_user_id: SYSTEM_USER_UUID,
    };

    if (payload.battery_voltage !== undefined) {
      updateData.battery_voltage = payload.battery_voltage;
    }
    if (payload.wifi_rssi !== undefined) {
      updateData.wifi_rssi = payload.wifi_rssi;
    }
    if (payload.firmware_version) {
      updateData.firmware_version = payload.firmware_version;
    }
    if (payload.hardware_version) {
      updateData.hardware_version = payload.hardware_version;
    }

    if (existingDevice.wake_schedule_cron) {
      const { data: nextWakeCalc } = await supabase.rpc(
        'fn_calculate_next_wake_time',
        {
          p_last_wake_at: now,
          p_cron_expression: existingDevice.wake_schedule_cron,
          p_timezone: deviceTimezone
        }
      );

      if (nextWakeCalc) {
        updateData.next_wake_at = nextWakeCalc;
      }
    }

    await supabase
      .from('devices')
      .update(updateData)
      .eq('device_id', existingDevice.device_id);

    // Create wake payload record
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

    await supabase
      .from('device_wake_payloads')
      .insert({
        device_id: existingDevice.device_id,
        company_id: existingDevice.company_id,
        program_id: lineageData?.program_id || null,
        site_id: lineageData?.site_id || null,
        site_device_session_id: sessionId,
        captured_at: now,
        received_at: now,
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        gas_resistance: payload.gas_resistance,
        battery_voltage: payload.battery_voltage,
        wifi_rssi: payload.wifi_rssi,
        telemetry_data: payload,
        wake_type: 'hello',
        payload_status: 'complete',
        overage_flag: false,
        is_complete: true,
      });

    console.log('[Ingest] Device updated:', existingDevice.device_id);
  } catch (err) {
    console.error('[Ingest] Error handling HELLO:', err);
  }
}

async function handleMetadata(
  supabase: SupabaseClient,
  payload: ImageMetadata
): Promise<void> {
  console.log('[Ingest] Metadata received:', payload.image_name, 'chunks:', payload.total_chunks_count);

  // Normalize MAC address (remove separators, uppercase)
  const normalizedMac = normalizeMacAddress(payload.device_id);
  if (!normalizedMac) {
    console.error('[Ingest] Invalid MAC address format:', payload.device_id);
    return;
  }

  // Log MQTT message
  await logMqttMessage(
    supabase,
    normalizedMac,
    'inbound',
    PROTOCOL_TOPICS.DATA(normalizedMac),
    payload,
    'metadata',
    null,
    null,
    payload.image_name
  );

  try {
    const { data: lineageData, error: lineageError } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    if (lineageError || !lineageData || lineageData.error) {
      console.error('[Ingest] Device lineage error:', lineageError || lineageData?.error);
      return;
    }

    const deviceId = lineageData.device_id;

    const telemetryData = {
      captured_at: payload.capture_timestamp,
      total_chunks: payload.total_chunks_count,
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

    const { data: result, error } = await supabase.rpc('fn_wake_ingestion_handler', {
      p_device_id: deviceId,
      p_captured_at: payload.capture_timestamp,
      p_image_name: payload.image_name,
      p_telemetry_data: telemetryData,
    });

    if (error || !result || !result.success) {
      console.error('[Ingest] Wake ingestion failed:', error || result?.message);
      return;
    }

    console.log('[Ingest] Wake ingestion success:', {
      payload_id: result.payload_id,
      image_id: result.image_id,
      session_id: result.session_id,
      wake_index: result.wake_index,
    });

    if (result.payload_id && result.image_id) {
      await supabase
        .from('device_wake_payloads')
        .update({
          image_id: result.image_id,
          image_status: 'receiving',
          wake_type: 'image_wake',
          chunk_count: payload.total_chunks_count,
          chunks_received: 0,
        })
        .eq('payload_id', result.payload_id);
    }

    const buffer = await getOrCreateBuffer(
      supabase,
      payload.device_id,
      payload.image_name,
      payload.total_chunks_count
    );

    buffer.metadata = payload;
    buffer.imageRecord = {
      image_id: result.image_id,
      wake_payload_id: result.payload_id
    };
    buffer.payloadId = result.payload_id;
    buffer.sessionInfo = { session_id: result.session_id };
  } catch (err) {
    console.error('[Ingest] Exception handling metadata:', err);
  }
}

async function handleChunk(
  supabase: SupabaseClient,
  payload: ImageChunk
): Promise<void> {
  try {
    // Log MQTT message
    await logMqttMessage(
      supabase,
      payload.device_id,
      'inbound',
      PROTOCOL_TOPICS.DATA(payload.device_id),
      payload,
      'chunk',
      null,
      null,
      payload.image_name,
      payload.chunk_id
    );

    const chunkData = new Uint8Array(payload.payload);
    const isFirstTime = await storeChunk(
      supabase,
      payload.device_id,
      payload.image_name,
      payload.chunk_id,
      chunkData
    );

    if (isFirstTime) {
      console.log('[Ingest] Chunk received:', payload.chunk_id, 'for', payload.image_name);
    }
  } catch (err) {
    console.error('[Ingest] Exception handling chunk:', err);
  }
}

async function handleTelemetryOnly(
  supabase: SupabaseClient,
  payload: TelemetryOnlyMessage
): Promise<void> {
  const deviceMac = (payload as any).device_mac || payload.device_id;
  console.log('[Ingest] Telemetry-only from device:', deviceMac);

  // Normalize MAC address (remove separators, uppercase)
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[Ingest] Invalid MAC address format:', deviceMac);
    return;
  }

  // Log MQTT message
  await logMqttMessage(
    supabase,
    normalizedMac,
    'inbound',
    PROTOCOL_TOPICS.DATA(normalizedMac),
    payload,
    'telemetry'
  );

  try {
    const { data: lineageData } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    if (!lineageData || lineageData.error) {
      console.error('[Ingest] Device lineage error');
      return;
    }

    let sessionId = null;
    if (lineageData.site_id) {
      const { data: sessionData } = await supabase
        .from('site_device_sessions')
        .select('session_id')
        .eq('site_id', lineageData.site_id)
        .in('status', ['pending', 'in_progress'])
        .eq('session_date', new Date().toISOString().split('T')[0])
        .limit(1)
        .maybeSingle();
      sessionId = sessionData?.session_id || null;
    }

    const capturedAt = payload.captured_at || new Date().toISOString();
    await supabase
      .from('device_telemetry')
      .insert({
        device_id: lineageData.device_id,
        company_id: lineageData.company_id,
        program_id: lineageData.program_id,
        site_id: lineageData.site_id,
        site_device_session_id: sessionId,
        captured_at: capturedAt,
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        gas_resistance: payload.gas_resistance,
        battery_voltage: payload.battery_voltage,
        wifi_rssi: payload.wifi_rssi,
      });

    console.log('[Ingest] Telemetry saved successfully');
  } catch (err) {
    console.error('[Ingest] Exception handling telemetry:', err);
  }
}

// ============================================
// FINALIZE MODULE
// ============================================

async function finalizeImage(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number,
  bucketName: string
): Promise<void> {
  console.log('[Finalize] Starting finalization for:', imageName);

  try {
    const buffer = await getBuffer(supabase, deviceMac, imageName);
    if (!buffer || !buffer.imageRecord?.image_id) {
      console.error('[Finalize] No buffer or image_id found');
      return;
    }

    const missingChunks = await getMissingChunks(supabase, deviceMac, imageName, totalChunks);
    if (missingChunks.length > 0) {
      console.log('[Finalize] Missing chunks detected:', missingChunks.length);
      // In HTTP mode, we can't send MQTT commands directly
      // The local MQTT service handles this
      return;
    }

    const imageBuffer = await assembleImage(supabase, deviceMac, imageName, totalChunks);
    if (!imageBuffer) {
      console.error('[Finalize] Failed to assemble image');
      return;
    }

    const imageUrl = await uploadImage(supabase, deviceMac, imageName, imageBuffer, bucketName);
    if (!imageUrl) {
      console.error('[Finalize] Failed to upload image');
      return;
    }

    const { data: result, error } = await supabase.rpc('fn_image_completion_handler', {
      p_image_id: buffer.imageRecord.image_id,
      p_image_url: imageUrl,
    });

    if (error || !result || !result.success) {
      console.error('[Finalize] Completion handler error:', error || result?.message);
      return;
    }

    console.log('[Finalize] Image completion success:', {
      image_id: result.image_id,
      observation_id: result.observation_id,
    });

    if (buffer.imageRecord.wake_payload_id) {
      await supabase
        .from('device_wake_payloads')
        .update({
          image_status: 'complete',
          chunks_received: totalChunks,
        })
        .eq('payload_id', buffer.imageRecord.wake_payload_id);
    }

    const nextWake = result.next_wake_at || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const formattedNextWake = formatNextWakeTime(new Date(nextWake));

    // Build protocol-compliant ACK_OK message
    const ackPayload = {
      [PROTOCOL_FIELDS.DEVICE_ID]: deviceMac,
      [PROTOCOL_FIELDS.IMAGE_NAME]: imageName,
      [PROTOCOL_FIELDS.ACK_OK]: {
        [PROTOCOL_FIELDS.NEXT_WAKE_TIME]: formattedNextWake,
      },
    };

    // Log MQTT message
    await logMqttMessage(
      supabase,
      deviceMac,
      'outbound',
      PROTOCOL_TOPICS.ACK(deviceMac),
      ackPayload,
      'ack_ok',
      null,
      buffer.imageRecord.wake_payload_id,
      imageName
    );

    // Log successful completion (local MQTT service will send ACK)
    await logAckToAudit(
      supabase,
      deviceMac,
      imageName,
      'ACK_OK',
      PROTOCOL_TOPICS.ACK(deviceMac),
      ackPayload,
      true
    );

    await clearBuffer(supabase, deviceMac, imageName);
    console.log('[Finalize] Finalization complete');
  } catch (err) {
    console.error('[Finalize] Exception during finalization:', err);
  }
}

// ============================================
// MAIN HANDLER
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

let supabaseClient: SupabaseClient | null = null;
let configGlobal: EdgeConfig | null = null;

async function handleMqttMessage(
  topic: string,
  payload: any,
  supabase: SupabaseClient,
  config: EdgeConfig
): Promise<void> {
  try {
    const deviceMac = topic.split('/')[1];

    console.log(`[MQTT] ${topic.includes('/status') ? 'HELLO' : 'DATA'} from ${deviceMac}`);

    if (topic.includes('/status')) {
      await handleHelloStatus(supabase, payload);
    } else if (topic.includes('/data')) {
      if (!payload.image_name && payload.chunk_id === undefined &&
          (payload.temperature !== undefined || payload.humidity !== undefined)) {
        await handleTelemetryOnly(supabase, payload);
      } else if (payload.chunk_id !== undefined) {
        await handleChunk(supabase, payload);

        const chunkPayload = payload as ImageChunk;
        if (chunkPayload.image_name) {
          const buffer = await getBuffer(supabase, deviceMac, chunkPayload.image_name);

          if (buffer && buffer.totalChunks > 0) {
            const complete = await isComplete(supabase, deviceMac, chunkPayload.image_name, buffer.totalChunks);

            if (complete) {
              console.log('[MQTT] All chunks received, finalizing:', chunkPayload.image_name);
              await finalizeImage(
                supabase,
                deviceMac,
                chunkPayload.image_name,
                buffer.totalChunks,
                config.storage.bucket
              );
            }
          }
        }
      } else {
        await handleMetadata(supabase, payload);

        const metadataPayload = payload as ImageMetadata;
        if (metadataPayload.image_name && metadataPayload.total_chunks_count) {
          const complete = await isComplete(supabase, deviceMac, metadataPayload.image_name, metadataPayload.total_chunks_count);

          if (complete) {
            console.log('[MQTT] All chunks already received, finalizing:', metadataPayload.image_name);
            await finalizeImage(
              supabase,
              deviceMac,
              metadataPayload.image_name,
              metadataPayload.total_chunks_count,
              config.storage.bucket
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[MQTT] Exception in message handler:', err);
  }
}

function startCleanupTimer(supabase: SupabaseClient): void {
  setInterval(async () => {
    const cleaned = await cleanupStaleBuffers(supabase);
    if (cleaned > 0) {
      console.log('[Cleanup] Removed', cleaned, 'stale chunks');
    }
  }, 60 * 1000);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (!configGlobal) {
      configGlobal = loadConfig();
    }

    if (!supabaseClient) {
      supabaseClient = createClient(configGlobal.supabase.url, configGlobal.supabase.serviceKey);
      startCleanupTimer(supabaseClient);
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { topic, payload } = body;

      if (!topic || !payload) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Missing topic or payload',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      console.log(`[HTTP] Received ${topic}`);

      await handleMqttMessage(topic, payload, supabaseClient, configGlobal);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Message processed',
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'MQTT Device Handler V3 (HTTP Webhook Mode) - BUNDLED',
        mode: 'HTTP POST webhook (no persistent MQTT connection)',
        version: '3.3.1-bundled',
        phase: 'Phase 3 - HTTP Webhook Integration',
        usage: 'POST with {topic: string, payload: object}',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Error] Handler error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
