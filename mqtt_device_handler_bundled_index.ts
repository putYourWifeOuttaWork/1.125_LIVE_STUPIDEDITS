/**
 * MQTT Device Handler - Bundled Single-File Version
 *
 * This is a complete bundled version of the mqtt_device_handler edge function,
 * containing all modules in a single file for easy deployment via Supabase dashboard.
 *
 * CRITICAL TEMPERATURE HANDLING:
 * - Devices send temperature in Celsius
 * - Edge function converts to Fahrenheit before storing
 * - Database stores Fahrenheit values
 * - Alert system checks Fahrenheit thresholds
 * - Formula: °F = (°C × 1.8) + 32
 *
 * Version: 3.3.0 (Bundled)
 * Last Updated: 2026-01-12
 * Total Lines: ~2850
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface DeviceStatusMessage {
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

export interface ImageMetadata {
  device_id: string;
  capture_timestamp?: string;
  timestamp?: string;
  capture_timeStamp?: string;
  image_name: string;
  image_id?: number;
  image_size: number;
  max_chunk_size?: number;
  max_chunks_size?: number;
  total_chunks_count?: number;
  total_chunk_count?: number;
  location?: string;
  error: number;
  sensor_data?: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
    gas_resistance?: number;
  };
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  slot_index?: number;
}

export interface ImageChunk {
  device_id: string;
  image_name: string;
  chunk_id: number;
  max_chunk_size?: number;
  max_chunks_size?: number;
  payload: string | number[];
}

export interface TelemetryOnlyMessage {
  device_id: string;
  captured_at: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  battery_voltage?: number;
  wifi_rssi?: number;
}

export interface AckMessage {
  device_id: string;
  image_name: string;
  ACK_OK?: {
    next_wake_time: string;
  };
}

export interface ImageBuffer {
  metadata: ImageMetadata | null;
  chunks: Map<number, Uint8Array>;
  totalChunks: number;
  imageRecord: any;
  payloadId: string | null;
  sessionInfo: any | null;
  createdAt: Date;
}

export interface EdgeConfig {
  mqtt: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  supabase: {
    url: string;
    serviceKey: string;
  };
  storage: {
    bucket: string;
  };
  timeouts: {
    bufferCleanupMinutes: number;
    chunkAssemblyMinutes: number;
  };
  features: {
    alertsEnabled: boolean;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function loadConfig(): EdgeConfig {
  const config: EdgeConfig = {
    mqtt: {
      host: Deno.env.get('MQTT_HOST') || '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud',
      port: parseInt(Deno.env.get('MQTT_PORT') || '8883'),
      username: Deno.env.get('MQTT_USERNAME') || 'BrainlyTesting',
      password: Deno.env.get('MQTT_PASSWORD') || 'BrainlyTest@1234',
    },
    supabase: {
      url: Deno.env.get('SUPABASE_URL')!,
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    storage: {
      bucket: Deno.env.get('STORAGE_BUCKET') || 'device-images',
    },
    timeouts: {
      bufferCleanupMinutes: parseInt(Deno.env.get('BUFFER_CLEANUP_MINUTES') || '30'),
      chunkAssemblyMinutes: parseInt(Deno.env.get('CHUNK_ASSEMBLY_MINUTES') || '15'),
    },
    features: {
      alertsEnabled: Deno.env.get('ALERTS_ENABLED') !== 'false',
    },
  };

  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  console.log('[Config] Loaded configuration');
  return config;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isValidMacAddress(input: string): boolean {
  const cleaned = input.replace(/[:\-\s]/g, '');
  return /^[0-9A-Fa-f]{12}$/.test(cleaned);
}

function normalizeMacAddress(identifier: string | null | undefined): string | null {
  if (!identifier) return null;

  const upper = identifier.toUpperCase();

  if (upper.startsWith('TEST-') || upper.startsWith('SYSTEM:') || upper.startsWith('VIRTUAL:')) {
    return upper;
  }

  if (!isValidMacAddress(identifier)) {
    console.warn(`Invalid device identifier format: "${identifier}"`);
    return null;
  }

  return identifier.replace(/[:\-\s]/g, '').toUpperCase();
}

function formatMacForDisplay(mac: string): string {
  if (!mac || mac.length !== 12) return mac;
  return mac.match(/.{2}/g)?.join(':') || mac;
}

// ============================================================================
// PROTOCOL DEFINITIONS
// ============================================================================

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

// ============================================================================
// IDEMPOTENCY & BUFFER MANAGEMENT
// ============================================================================

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

  const { error } = await supabase
    .from('edge_chunk_buffer')
    .delete()
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) {
    console.error('[Idempotency] Error clearing buffer:', error);
  } else {
    console.log('[Idempotency] Cleared buffer:', key);
  }
}

async function cleanupStaleBuffers(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('chunk_key');

  if (error) {
    console.error('[Idempotency] Error cleaning stale buffers:', error);
    return 0;
  }

  const cleaned = (data || []).length;
  if (cleaned > 0) {
    console.log('[Idempotency] Cleaned', cleaned, 'stale chunks');
  }

  return cleaned;
}

// ============================================================================
// STORAGE
// ============================================================================

async function uploadImage(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  imageBuffer: Uint8Array,
  bucketName: string
): Promise<string | null> {
  try {
    const normalizedMac = normalizeMacAddress(deviceMac);
    if (!normalizedMac) {
      console.error('[Storage] Invalid MAC address format:', deviceMac);
      return null;
    }

    const { data: lineageData } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    if (!lineageData) {
      const fileName = `${normalizedMac}/${imageName}`;
      return await uploadWithPath(supabase, bucketName, fileName, imageBuffer);
    }

    const { data: pathData } = await supabase.rpc(
      'fn_build_device_image_path',
      {
        p_company_id: lineageData.company_id,
        p_site_id: lineageData.site_id,
        p_device_mac: normalizedMac,
        p_image_name: imageName,
      }
    );

    const filePath = pathData || `${normalizedMac}/${imageName}`;
    return await uploadWithPath(supabase, bucketName, filePath, imageBuffer);
  } catch (err) {
    console.error('[Storage] Exception during upload:', err);
    return null;
  }
}

async function uploadWithPath(
  supabase: SupabaseClient,
  bucketName: string,
  filePath: string,
  imageBuffer: Uint8Array
): Promise<string | null> {
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
}

// ============================================================================
// SCHEDULER
// ============================================================================

function parseWakeHours(cronExpression: string): number[] {
  if (!cronExpression || cronExpression.trim() === '') {
    return [8];
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 2) {
    return [8];
  }

  const hourPart = parts[1];

  if (hourPart.includes(',')) {
    return hourPart
      .split(',')
      .map(h => parseInt(h.trim()))
      .filter(h => !isNaN(h) && h >= 0 && h <= 23)
      .sort((a, b) => a - b);
  }

  if (hourPart.includes('*/')) {
    const match = hourPart.match(/\*\/(\d+)/);
    if (match) {
      const interval = parseInt(match[1]);
      if (interval > 0 && interval <= 24) {
        const hours: number[] = [];
        for (let h = 0; h < 24; h += interval) {
          hours.push(h);
        }
        return hours;
      }
    }
  }

  if (hourPart === '*') {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  const hour = parseInt(hourPart);
  if (!isNaN(hour) && hour >= 0 && hour <= 23) {
    return [hour];
  }

  return [8];
}

function calculateNextWakeFromCron(
  cronExpression: string,
  fromTime?: Date
): string {
  const now = fromTime || new Date();
  const wakeHours = parseWakeHours(cronExpression);
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  let nextWakeHour: number | null = null;
  let isNextDay = false;

  for (const hour of wakeHours) {
    if (hour > currentHour || (hour === currentHour && currentMinute < 30)) {
      nextWakeHour = hour;
      break;
    }
  }

  if (nextWakeHour === null) {
    nextWakeHour = wakeHours[0];
    isNextDay = true;
  }

  const nextWake = new Date(now);
  nextWake.setUTCHours(nextWakeHour, 0, 0, 0);

  if (isNextDay) {
    nextWake.setUTCDate(nextWake.getUTCDate() + 1);
  }

  return nextWake.toISOString();
}

// ============================================================================
// ACK & COMMANDS
// ============================================================================

async function publishPendingImageAck(
  client: MqttClient | null,
  deviceMac: string,
  imageName: string,
  supabase?: SupabaseClient
): Promise<void> {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[ACK] Invalid MAC address format:', deviceMac);
    return;
  }

  const message = {
    device_id: normalizedMac,
    image_name: imageName,
    ACK_OK: {},
  };

  const topic = `ESP32CAM/${normalizedMac}/ack`;
  console.log('[ACK] Sending ACK for pending image:', { device: normalizedMac, image: imageName });

  if (!client) {
    console.log('[ACK] HTTP mode - pending image ACK tracked in database only');
    return;
  }

  try {
    client.publish(topic, JSON.stringify(message));
    console.log('[ACK] Pending image ACK published successfully');
  } catch (err) {
    console.error('[ACK] Failed to publish pending image ACK:', err);
  }
}

async function publishSnapCommand(
  client: MqttClient | null,
  deviceMac: string,
  imageName: string,
  supabase: SupabaseClient,
  payloadId?: string
): Promise<void> {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[CMD] Invalid MAC address format:', deviceMac);
    return;
  }

  const message = {
    [PROTOCOL_FIELDS.DEVICE_ID]: normalizedMac,
    [PROTOCOL_FIELDS.SEND_IMAGE]: imageName,
  };

  const topic = PROTOCOL_TOPICS.CMD(normalizedMac);
  console.log('[CMD] Sending SNAP command:', { device: normalizedMac, image: imageName });

  if (payloadId) {
    await supabase
      .from('device_wake_payloads')
      .update({
        protocol_state: 'snap_sent',
        snap_sent_at: new Date().toISOString(),
        server_image_name: imageName,
      })
      .eq('payload_id', payloadId);
  }

  if (!client) {
    console.log('[CMD] HTTP mode - SNAP command tracked in database only');
    return;
  }

  try {
    client.publish(topic, JSON.stringify(message));
    console.log('[CMD] SNAP command published successfully');
  } catch (err) {
    console.error('[CMD] Failed to publish SNAP command:', err);
  }
}

async function publishSleepCommand(
  client: MqttClient | null,
  deviceMac: string,
  nextWakeTime: string,
  supabase: SupabaseClient,
  payloadId?: string
): Promise<void> {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[CMD] Invalid MAC address format:', deviceMac);
    return;
  }

  const message = {
    [PROTOCOL_FIELDS.DEVICE_ID]: normalizedMac,
    [PROTOCOL_FIELDS.NEXT_WAKE]: nextWakeTime,
  };

  const topic = PROTOCOL_TOPICS.CMD(normalizedMac);
  console.log('[CMD] Sending SLEEP command:', { device: normalizedMac, next_wake: nextWakeTime });

  if (payloadId) {
    await supabase
      .from('device_wake_payloads')
      .update({
        protocol_state: 'complete',
        sleep_sent_at: new Date().toISOString(),
        is_complete: true,
      })
      .eq('payload_id', payloadId);
  }

  if (!client) {
    console.log('[CMD] HTTP mode - SLEEP command tracked in database only');
    return;
  }

  try {
    client.publish(topic, JSON.stringify(message));
    console.log('[CMD] SLEEP command published successfully');
  } catch (err) {
    console.error('[CMD] Failed to publish SLEEP command:', err);
  }
}

async function calculateNextWake(
  supabase: SupabaseClient,
  deviceId: string,
  siteId: string | null,
  timezone: string
): Promise<Date | null> {
  const { data: device } = await supabase
    .from('devices')
    .select('wake_schedule_cron, last_wake_at')
    .eq('device_id', deviceId)
    .single();

  if (!device) {
    console.error('[CMD] Device not found:', deviceId);
    return null;
  }

  let scheduleToUse = device.wake_schedule_cron;

  if (!scheduleToUse && siteId) {
    const { data: site } = await supabase
      .from('sites')
      .select('wake_schedule_cron')
      .eq('site_id', siteId)
      .single();

    if (site?.wake_schedule_cron) {
      scheduleToUse = site.wake_schedule_cron;
      console.log('[CMD] Device inheriting site wake schedule');
    }
  }

  if (!scheduleToUse) {
    console.log('[CMD] No wake schedule found for device or site');
    return null;
  }

  const { data: nextWake, error } = await supabase.rpc('fn_calculate_next_wake_time', {
    p_last_wake_at: device.last_wake_at || new Date().toISOString(),
    p_cron_expression: scheduleToUse,
    p_timezone: timezone,
  });

  if (error) {
    console.error('[CMD] Error calculating next wake:', error);
    return null;
  }

  return nextWake ? new Date(nextWake) : null;
}

async function publishMissingChunks(
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  missingChunks: number[],
  supabase?: SupabaseClient
): Promise<void> {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[ACK] Invalid MAC address format:', deviceMac);
    return;
  }

  const message = {
    device_id: normalizedMac,
    image_name: imageName,
    missing_chunks: missingChunks,
  };

  const topic = `ESP32CAM/${normalizedMac}/ack`;

  try {
    client.publish(topic, JSON.stringify(message));
    console.log('[ACK] Published missing_chunks:', {
      device: normalizedMac,
      image: imageName,
      missing: missingChunks.length,
    });
  } catch (err) {
    console.error('[ACK] Failed to publish missing_chunks:', err);
  }
}

// ============================================================================
// FINALIZE MODULE
// ============================================================================

async function finalizeImage(
  supabase: SupabaseClient,
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number,
  bucketName: string
): Promise<void> {
  console.log('[Finalize] Starting finalization for:', imageName);

  try {
    const normalizedMac = normalizeMacAddress(deviceMac);
    if (!normalizedMac) {
      console.error('[Finalize] Invalid MAC address format:', deviceMac);
      return;
    }

    const buffer = await getBuffer(supabase, normalizedMac, imageName);
    if (!buffer || !buffer.imageRecord?.image_id) {
      console.error('[Finalize] No buffer or image_id found for:', imageName);
      return;
    }

    const missingChunks = await getMissingChunks(supabase, normalizedMac, imageName, totalChunks);
    if (missingChunks.length > 0) {
      console.log('[Finalize] Missing chunks detected:', missingChunks.length);
      await publishMissingChunks(client, normalizedMac, imageName, missingChunks, supabase);
      return;
    }

    const imageBuffer = await assembleImage(supabase, normalizedMac, imageName, totalChunks);
    if (!imageBuffer) {
      console.error('[Finalize] Failed to assemble image:', imageName);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 2, 'Image assembly failed');
      return;
    }

    const imageUrl = await uploadImage(supabase, normalizedMac, imageName, imageBuffer, bucketName);
    if (!imageUrl) {
      console.error('[Finalize] Failed to upload image:', imageName);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 1, 'Image upload failed');
      return;
    }

    const { data: result, error } = await supabase.rpc('fn_image_completion_handler', {
      p_image_id: buffer.imageRecord.image_id,
      p_image_url: imageUrl,
    });

    if (error || !result || !result.success) {
      console.error('[Finalize] fn_image_completion_handler error:', error || result?.message);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 3, 'Completion handler failed');
      return;
    }

    console.log('[Finalize] Image completion success:', {
      image_id: result.image_id,
      observation_id: result.observation_id,
      slot_index: result.slot_index,
      submission_id: result.submission_id,
    });

    if (buffer.imageRecord.wake_payload_id) {
      await supabase
        .from('device_wake_payloads')
        .update({
          image_status: 'complete',
          chunks_received: totalChunks,
          protocol_state: 'metadata_received',
        })
        .eq('payload_id', buffer.imageRecord.wake_payload_id);
    }

    const { data: lineageData } = await supabase.rpc('fn_resolve_device_lineage', {
      p_device_mac: normalizedMac,
    });

    if (!lineageData) {
      console.error('[Finalize] Device lineage not found for:', normalizedMac);
      return;
    }

    const deviceId = lineageData.device_id;
    const siteId = lineageData.site_id;
    const timezone = lineageData.timezone || 'America/New_York';

    const nextWakeDate = await calculateNextWake(supabase, deviceId, siteId, timezone);
    const nextWakeFormatted = nextWakeDate ? formatNextWakeTime(nextWakeDate) : '8:00AM';

    console.log('[Finalize] Calculated next wake:', {
      nextWake: nextWakeDate?.toISOString(),
      formatted: nextWakeFormatted,
      timezone,
    });

    if (deviceId) {
      await supabase
        .from('devices')
        .update({
          next_wake_at: nextWakeDate?.toISOString() || null,
          last_wake_at: new Date().toISOString(),
        })
        .eq('device_id', deviceId);
    }

    await publishSleepCommand(
      client,
      normalizedMac,
      nextWakeFormatted,
      supabase,
      buffer.imageRecord.wake_payload_id
    );

    await clearBuffer(supabase, normalizedMac, imageName);
    console.log('[Finalize] Finalization complete for:', imageName);
  } catch (err) {
    console.error('[Finalize] Exception during finalization:', err);
  }
}

async function callFailureHandler(
  supabase: SupabaseClient,
  imageId: string,
  errorCode: number,
  errorMessage: string
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('fn_image_failure_handler', {
      p_image_id: imageId,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    });

    if (error) {
      console.error('[Finalize] fn_image_failure_handler error:', error);
    } else {
      console.log('[Finalize] Marked image as failed:', imageId, 'alert_created:', data?.alert_created);
    }
  } catch (err) {
    console.error('[Finalize] Exception calling failure handler:', err);
  }
}

// Due to character limits, the ingest module and main handler will be continued in the next message...
// This file needs to be combined with part 2 for the complete bundled function.
// See ALERT_SYSTEM_FIX_COMPLETE_GUIDE.md for full deployment instructions.
