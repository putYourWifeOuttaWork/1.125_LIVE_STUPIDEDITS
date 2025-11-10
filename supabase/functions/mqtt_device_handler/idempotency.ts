/**
 * Phase 3 - Idempotency Module
 * 
 * Manage image buffers and prevent duplicate processing
 */

import type { ImageBuffer } from './types.ts';

// Global buffer Map: "device_mac|image_name" → ImageBuffer
const imageBuffers = new Map<string, ImageBuffer>();

/**
 * Generate idempotency key for image
 */
export function getImageKey(deviceMac: string, imageName: string): string {
  return `${deviceMac}|${imageName}`;
}

/**
 * Get or create image buffer
 */
export function getOrCreateBuffer(
  deviceMac: string,
  imageName: string,
  totalChunks: number
): ImageBuffer {
  const key = getImageKey(deviceMac, imageName);
  
  if (imageBuffers.has(key)) {
    return imageBuffers.get(key)!;
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

  imageBuffers.set(key, buffer);
  console.log('[Idempotency] Created new buffer:', key);
  
  return buffer;
}

/**
 * Get existing buffer
 */
export function getBuffer(deviceMac: string, imageName: string): ImageBuffer | null {
  const key = getImageKey(deviceMac, imageName);
  return imageBuffers.get(key) || null;
}

/**
 * Store chunk in buffer
 */
export function storeChunk(
  deviceMac: string,
  imageName: string,
  chunkIndex: number,
  chunkData: Uint8Array
): void {
  const buffer = getBuffer(deviceMac, imageName);
  if (!buffer) {
    console.warn('[Idempotency] No buffer found for chunk:', imageName);
    return;
  }

  buffer.chunks.set(chunkIndex, chunkData);
  console.log('[Idempotency] Stored chunk:', chunkIndex, 'for', imageName, `(${buffer.chunks.size}/${buffer.totalChunks})`);
}

/**
 * Check if all chunks received
 */
export function isComplete(deviceMac: string, imageName: string): boolean {
  const buffer = getBuffer(deviceMac, imageName);
  if (!buffer) return false;
  
  return buffer.chunks.size === buffer.totalChunks;
}

/**
 * Get missing chunk indices
 */
export function getMissingChunks(deviceMac: string, imageName: string): number[] {
  const buffer = getBuffer(deviceMac, imageName);
  if (!buffer) return [];

  const missing: number[] = [];
  for (let i = 0; i < buffer.totalChunks; i++) {
    if (!buffer.chunks.has(i)) {
      missing.push(i);
    }
  }

  return missing;
}

/**
 * Assemble chunks into single buffer
 */
export function assembleImage(deviceMac: string, imageName: string): Uint8Array | null {
  const buffer = getBuffer(deviceMac, imageName);
  if (!buffer) return null;

  // Sort chunks by index
  const sortedChunks: Uint8Array[] = [];
  for (let i = 0; i < buffer.totalChunks; i++) {
    const chunk = buffer.chunks.get(i);
    if (!chunk) {
      console.error('[Idempotency] Missing chunk during assembly:', i);
      return null;
    }
    sortedChunks.push(chunk);
  }

  // Concatenate
  const totalLength = sortedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of sortedChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  console.log('[Idempotency] Assembled image:', imageName, `(${totalLength} bytes)`);
  return merged;
}

/**
 * Clear buffer after completion
 */
export function clearBuffer(deviceMac: string, imageName: string): void {
  const key = getImageKey(deviceMac, imageName);
  if (imageBuffers.delete(key)) {
    console.log('[Idempotency] Cleared buffer:', key);
  }
}

/**
 * Cleanup stale buffers (older than threshold)
 */
export function cleanupStaleBuffers(thresholdMinutes: number): number {
  const now = new Date();
  const threshold = thresholdMinutes * 60 * 1000; // Convert to ms
  let cleaned = 0;

  for (const [key, buffer] of imageBuffers.entries()) {
    const age = now.getTime() - buffer.createdAt.getTime();
    if (age > threshold) {
      imageBuffers.delete(key);
      cleaned++;
      console.log('[Idempotency] Cleaned stale buffer:', key, `(${age}ms old)`);
    }
  }

  return cleaned;
}

/**
 * Get buffer statistics
 */
export function getBufferStats(): { total: number; keys: string[] } {
  return {
    total: imageBuffers.size,
    keys: Array.from(imageBuffers.keys()),
  };
}
