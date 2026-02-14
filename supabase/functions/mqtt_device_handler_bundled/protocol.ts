/**
 * ESP32-CAM MQTT Protocol Compliance
 *
 * This module enforces exact protocol compliance per BrainlyTree specification.
 *
 * CRITICAL RULES:
 * 1. Field names in MQTT messages MUST match firmware exactly (case-sensitive)
 * 2. Database field names can differ - this module handles the mapping
 * 3. Use protocol field names when building MQTT messages
 * 4. Use database field names when working with Supabase
 */

/**
 * Protocol-compliant MQTT field names (EXACT as firmware expects)
 * Source: BrainlyTree ESP32CAM Architecture Document
 */
export const PROTOCOL_FIELDS = {
  // Common fields
  DEVICE_ID: 'device_id',          // MAC address

  // HELLO message (device -> server)
  STATUS: 'status',                 // "alive"
  PENDING_IMG: 'pendingImg',        // Count of pending images (camelCase!)

  // Server commands
  CAPTURE_IMAGE: 'capture_image',   // Command to capture
  SEND_IMAGE: 'send_image',         // Command with image name
  NEXT_WAKE: 'next_wake',           // Standalone wake command

  // METADATA message (device -> server)
  CAPTURE_TIMESTAMP: 'capture_timestamp',  // lowercase!
  IMAGE_NAME: 'image_name',
  IMAGE_SIZE: 'image_size',
  MAX_CHUNK_SIZE: 'max_chunk_size',
  TOTAL_CHUNKS_COUNT: 'total_chunks_count', // plural!
  LOCATION: 'location',
  ERROR: 'error',
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  PRESSURE: 'pressure',
  GAS_RESISTANCE: 'gas_resistance',

  // CHUNK message (device -> server)
  CHUNK_ID: 'chunk_id',
  PAYLOAD: 'payload',

  // ACK_OK message (server -> device)
  ACK_OK: 'ACK_OK',                 // Object containing next_wake_time
  NEXT_WAKE_TIME: 'next_wake_time', // Inside ACK_OK object

  // MISSING_CHUNKS message (server -> device)
  MISSING_CHUNKS: 'missing_chunks', // Array of chunk IDs
} as const;

/**
 * MQTT Topics per protocol spec
 */
export const PROTOCOL_TOPICS = {
  // Device publishes to
  STATUS: (macId: string) => `ESP32CAM/${macId}/status`,
  DATA: (macId: string) => `ESP32CAM/${macId}/data`,

  // Server publishes to
  CMD: (macId: string) => `ESP32CAM/${macId}/cmd`,
  ACK: (macId: string) => `ESP32CAM/${macId}/ack`,
} as const;

/**
 * Build HELLO acknowledgment with protocol-compliant fields
 * Per spec: When device reports pendingImg > 0, send ACK_OK
 */
export function buildHelloAck(params: {
  macAddress: string;
  imageName: string;
  nextWakeTime: string; // Formatted time string like "5:30PM"
}): Record<string, any> {
  return {
    [PROTOCOL_FIELDS.DEVICE_ID]: params.macAddress,
    [PROTOCOL_FIELDS.IMAGE_NAME]: params.imageName,
    [PROTOCOL_FIELDS.ACK_OK]: {
      [PROTOCOL_FIELDS.NEXT_WAKE_TIME]: params.nextWakeTime,
    },
  };
}

/**
 * Build CAPTURE_IMAGE command
 */
export function buildCaptureImageCommand(macAddress: string): Record<string, any> {
  return {
    [PROTOCOL_FIELDS.DEVICE_ID]: macAddress,
    [PROTOCOL_FIELDS.CAPTURE_IMAGE]: true,
  };
}

/**
 * Build SEND_IMAGE command
 */
export function buildSendImageCommand(macAddress: string, imageName: string): Record<string, any> {
  return {
    [PROTOCOL_FIELDS.DEVICE_ID]: macAddress,
    [PROTOCOL_FIELDS.SEND_IMAGE]: imageName,
  };
}

/**
 * Build NEXT_WAKE standalone command
 */
export function buildNextWakeCommand(macAddress: string, wakeTime: string): Record<string, any> {
  return {
    [PROTOCOL_FIELDS.DEVICE_ID]: macAddress,
    [PROTOCOL_FIELDS.NEXT_WAKE]: wakeTime,
  };
}

/**
 * Build ACK_OK message after successful image completion
 */
export function buildAckOk(params: {
  macAddress: string;
  imageName: string;
  nextWakeTime: string;
}): Record<string, any> {
  return {
    [PROTOCOL_FIELDS.DEVICE_ID]: params.macAddress,
    [PROTOCOL_FIELDS.IMAGE_NAME]: params.imageName,
    [PROTOCOL_FIELDS.ACK_OK]: {
      [PROTOCOL_FIELDS.NEXT_WAKE_TIME]: params.nextWakeTime,
    },
  };
}

/**
 * Build MISSING_CHUNKS request
 * IMPORTANT: Per protocol spec, this goes to CMD topic, not ACK topic!
 */
export function buildMissingChunksRequest(params: {
  macAddress: string;
  imageName: string;
  missingChunks: number[];
}): Record<string, any> {
  return {
    [PROTOCOL_FIELDS.DEVICE_ID]: params.macAddress,
    [PROTOCOL_FIELDS.IMAGE_NAME]: params.imageName,
    [PROTOCOL_FIELDS.MISSING_CHUNKS]: params.missingChunks,
  };
}

/**
 * Parse HELLO message from device
 */
export function parseHelloMessage(payload: Record<string, any>): {
  macAddress: string;
  status: string;
  pendingImageCount: number;
} | null {
  const deviceId = payload[PROTOCOL_FIELDS.DEVICE_ID];
  const status = payload[PROTOCOL_FIELDS.STATUS];
  const pendingImg = payload[PROTOCOL_FIELDS.PENDING_IMG];

  if (!deviceId || !status) {
    return null;
  }

  return {
    macAddress: deviceId,
    status,
    pendingImageCount: pendingImg || 0,
  };
}

/**
 * Parse METADATA message from device
 */
export function parseMetadataMessage(payload: Record<string, any>): {
  macAddress: string;
  captureTimestamp: string;
  imageName: string;
  imageSize: number;
  maxChunkSize: number;
  totalChunksCount: number;
  location?: string;
  error: number;
  telemetry: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
    gasResistance?: number;
  };
} | null {
  const deviceId = payload[PROTOCOL_FIELDS.DEVICE_ID];
  const captureTimestamp = payload[PROTOCOL_FIELDS.CAPTURE_TIMESTAMP];
  const imageName = payload[PROTOCOL_FIELDS.IMAGE_NAME];
  const imageSize = payload[PROTOCOL_FIELDS.IMAGE_SIZE];
  const maxChunkSize = payload[PROTOCOL_FIELDS.MAX_CHUNK_SIZE];
  const totalChunksCount = payload[PROTOCOL_FIELDS.TOTAL_CHUNKS_COUNT];
  const error = payload[PROTOCOL_FIELDS.ERROR];

  if (!deviceId || !imageName || imageSize == null || totalChunksCount == null) {
    return null;
  }

  return {
    macAddress: deviceId,
    captureTimestamp,
    imageName,
    imageSize,
    maxChunkSize,
    totalChunksCount,
    location: payload[PROTOCOL_FIELDS.LOCATION],
    error: error ?? 0,
    telemetry: {
      temperature: payload[PROTOCOL_FIELDS.TEMPERATURE],
      humidity: payload[PROTOCOL_FIELDS.HUMIDITY],
      pressure: payload[PROTOCOL_FIELDS.PRESSURE],
      gasResistance: payload[PROTOCOL_FIELDS.GAS_RESISTANCE],
    },
  };
}

/**
 * Parse CHUNK message from device
 */
export function parseChunkMessage(payload: Record<string, any>): {
  macAddress: string;
  imageName: string;
  chunkId: number;
  maxChunkSize: number;
  payload: any;
} | null {
  const deviceId = payload[PROTOCOL_FIELDS.DEVICE_ID];
  const imageName = payload[PROTOCOL_FIELDS.IMAGE_NAME];
  const chunkId = payload[PROTOCOL_FIELDS.CHUNK_ID];
  const maxChunkSize = payload[PROTOCOL_FIELDS.MAX_CHUNK_SIZE];
  const chunkPayload = payload[PROTOCOL_FIELDS.PAYLOAD];

  if (!deviceId || !imageName || chunkId == null || !chunkPayload) {
    return null;
  }

  return {
    macAddress: deviceId,
    imageName,
    chunkId,
    maxChunkSize,
    payload: chunkPayload,
  };
}

/**
 * Format next wake time according to protocol spec
 * Database stores UTC timestamp, firmware expects formatted string like "5:30PM"
 */
export function formatNextWakeTime(timestamp: Date): string {
  const hours = timestamp.getUTCHours();
  const minutes = timestamp.getUTCMinutes();

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');

  return `${displayHours}:${displayMinutes}${period}`;
}

/**
 * Validate message structure against protocol
 */
export function validateMessage(
  messageType: 'hello' | 'metadata' | 'chunk' | 'ack_ok' | 'missing_chunks',
  payload: Record<string, any>
): {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const missingFields: string[] = [];

  // Check device_id present in all messages
  if (!payload[PROTOCOL_FIELDS.DEVICE_ID]) {
    missingFields.push(PROTOCOL_FIELDS.DEVICE_ID);
  }

  switch (messageType) {
    case 'hello':
      if (!payload[PROTOCOL_FIELDS.STATUS]) {
        missingFields.push(PROTOCOL_FIELDS.STATUS);
      }
      // pendingImg is required but can be 0
      if (payload[PROTOCOL_FIELDS.PENDING_IMG] == null) {
        missingFields.push(PROTOCOL_FIELDS.PENDING_IMG);
      }
      break;

    case 'metadata':
      const metadataRequired = [
        PROTOCOL_FIELDS.CAPTURE_TIMESTAMP,
        PROTOCOL_FIELDS.IMAGE_NAME,
        PROTOCOL_FIELDS.IMAGE_SIZE,
        PROTOCOL_FIELDS.MAX_CHUNK_SIZE,
        PROTOCOL_FIELDS.TOTAL_CHUNKS_COUNT,
        PROTOCOL_FIELDS.ERROR,
      ];
      metadataRequired.forEach((field) => {
        if (payload[field] == null) {
          missingFields.push(field);
        }
      });
      break;

    case 'chunk':
      const chunkRequired = [
        PROTOCOL_FIELDS.IMAGE_NAME,
        PROTOCOL_FIELDS.CHUNK_ID,
        PROTOCOL_FIELDS.MAX_CHUNK_SIZE,
        PROTOCOL_FIELDS.PAYLOAD,
      ];
      chunkRequired.forEach((field) => {
        if (payload[field] == null) {
          missingFields.push(field);
        }
      });
      break;

    case 'ack_ok':
      if (!payload[PROTOCOL_FIELDS.IMAGE_NAME]) {
        missingFields.push(PROTOCOL_FIELDS.IMAGE_NAME);
      }
      if (!payload[PROTOCOL_FIELDS.ACK_OK]) {
        missingFields.push(PROTOCOL_FIELDS.ACK_OK);
      } else if (!payload[PROTOCOL_FIELDS.ACK_OK][PROTOCOL_FIELDS.NEXT_WAKE_TIME]) {
        errors.push(`${PROTOCOL_FIELDS.ACK_OK} must contain ${PROTOCOL_FIELDS.NEXT_WAKE_TIME}`);
      }
      break;

    case 'missing_chunks':
      if (!payload[PROTOCOL_FIELDS.IMAGE_NAME]) {
        missingFields.push(PROTOCOL_FIELDS.IMAGE_NAME);
      }
      if (!Array.isArray(payload[PROTOCOL_FIELDS.MISSING_CHUNKS])) {
        errors.push(`${PROTOCOL_FIELDS.MISSING_CHUNKS} must be an array`);
      }
      break;
  }

  return {
    isValid: missingFields.length === 0 && errors.length === 0,
    missingFields,
    errors,
  };
}

/**
 * Protocol compliance logger
 */
export function logProtocolViolation(
  messageType: string,
  direction: 'inbound' | 'outbound',
  violation: string,
  payload: Record<string, any>
): void {
  console.error('[PROTOCOL VIOLATION]', {
    messageType,
    direction,
    violation,
    payload,
    timestamp: new Date().toISOString(),
  });
}
