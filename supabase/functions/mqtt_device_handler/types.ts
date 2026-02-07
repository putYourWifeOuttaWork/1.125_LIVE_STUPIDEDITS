/**
 * Phase 3 - MQTT Edge Function Type DefinitionsDEC25
 * 
 * Shared types for all modules to ensure type safety across the edge function
 */

// ============================================
// MQTT Protocol Message Types (Firmware-Fixed)
// ============================================

export interface DeviceStatusMessage {
  device_id: string; // MAC address or client ID
  device_mac?: string; // MAC address
  status: "alive";
  pending_count?: number; // pending images count
  pendingImg?: number; // legacy field name support
  firmware_version?: string; // e.g., "bt-aws-v4.0.0"
  hardware_version?: string; // e.g., "ESP32-S3"
  wifi_rssi?: number; // WiFi signal strength
  battery_voltage?: number; // Battery voltage in volts
}

export interface ImageMetadata {
  device_id: string; // MAC address
  // Timestamp field variations (firmware sends 'timestamp', backend expects 'capture_timestamp')
  capture_timestamp?: string; // ISO 8601 - backend format
  timestamp?: string; // ISO 8601 - firmware format
  capture_timeStamp?: string; // Legacy format
  image_name: string; // stable identifier
  image_id?: number; // firmware sends image_id
  image_size: number;
  // Chunk size field variations (firmware sends 'max_chunks_size', backend expects 'max_chunk_size')
  max_chunk_size?: number; // backend format
  max_chunks_size?: number; // firmware format (with 's')
  // Chunk count field variations (firmware sends 'total_chunk_count', backend expects 'total_chunks_count')
  total_chunks_count?: number; // backend format (plural)
  total_chunk_count?: number; // firmware format (singular)
  location?: string;
  error: number;
  // Sensor data can be nested (firmware format) or flat (backend format)
  sensor_data?: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
    gas_resistance?: number;
  };
  // Flat sensor fields (backend format)
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  slot_index?: number; // optional device-reported slot
}

export interface ImageChunk {
  device_id: string; // MAC address
  image_name: string;
  chunk_id: number; // 0-indexed
  max_chunk_size?: number;
  max_chunks_size?: number; // firmware format
  // Payload can be base64 string (firmware) or number array (processed)
  payload: string | number[]; // base64 string from firmware, or byte array after processing
}

export interface MissingChunksRequest {
  device_id: string; // MAC address
  image_name: string;
  missing_chunks: number[];
}

export interface AckMessage {
  device_id: string; // MAC address
  image_name: string;
  ACK_OK?: {
    next_wake_time: string; // ISO 8601 UTC
  };
}

export interface TelemetryOnlyMessage {
  device_id: string; // MAC address
  captured_at: string; // ISO 8601
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  battery_voltage?: number;
  wifi_rssi?: number;
}

// ============================================
// Internal Data Structures
// ============================================

export interface DeviceLineage {
  device_id: string; // UUID from database
  device_mac: string; // MAC address
  device_name: string; // Device friendly name
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  company_id: string;
  company_name: string;
  timezone: string;
  wake_schedule_cron: string | null;
  is_active: boolean;
  provisioning_status: string;
  error?: string; // Present if lineage incomplete
}

export interface SiteSessionInfo {
  session_id: string;
  site_id: string;
  session_date: string; // YYYY-MM-DD
  device_submission_id: string | null;
  expected_wake_count: number;
  status: string;
}

export interface ImageBuffer {
  metadata: ImageMetadata | null;
  chunks: Map<number, Uint8Array>;
  totalChunks: number;
  imageRecord: any;
  payloadId: string | null;
  sessionInfo: SiteSessionInfo | null;
  createdAt: Date;
}

export interface WakeBucket {
  hour: number;
  index: number; // 1-based wake index
}

export interface WakeIndexResult {
  wake_index: number;
  is_overage: boolean;
  matched_hour?: number;
}

// ============================================
// SQL Function Response Types
// ============================================

export interface WakeIngestionResult {
  success: boolean;
  payload_id?: string;
  image_id?: string;
  session_id?: string;
  wake_index?: number;
  is_overage?: boolean;
  message?: string;
}

export interface ImageCompletionResult {
  success: boolean;
  image_id?: string;
  observation_id?: string;
  payload_id?: string;
  session_id?: string;
  slot_index?: number;
  message?: string;
}

export interface ImageFailureResult {
  success: boolean;
  image_id?: string;
  device_id?: string;
  error_code?: number;
  alert_created?: boolean;
  message?: string;
}

export interface RetryResult {
  success: boolean;
  image_id?: string;
  was_failed?: boolean;
  is_complete?: boolean;
  retry_count?: number;
  session_id?: string;
  original_captured_at?: string;
  resent_received_at?: string;
  message?: string;
}

// ============================================
// Configuration
// ============================================

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
