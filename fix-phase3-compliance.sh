#!/bin/bash

# Phase 3 Compliance Fix Script
# Applies all required changes to make edge function Phase-2.5 compliant

set -e

echo "🔧 Phase 3 Compliance Fix - Applying SQL Handler Integration"
echo ""

# Create updated idempotency.ts with Postgres-backed storage
cat > supabase/functions/mqtt_device_handler/idempotency.ts << 'EOF'
/**
 * Phase 3 - Idempotency Module (Postgres-Backed)
 *
 * Manage image buffers with durable Postgres storage
 * NO IN-MEMORY MAP - uses edge_chunk_buffer table
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { ImageBuffer } from './types.ts';

// Minimal in-memory cache for metadata only (not chunks)
const metadataCache = new Map<string, any>();

/**
 * Generate idempotency key for image
 */
export function getImageKey(deviceMac: string, imageName: string): string {
  return `${deviceMac}|${imageName}`;
}

/**
 * Get or create image buffer metadata
 */
export async function getOrCreateBuffer(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<ImageBuffer> {
  const key = getImageKey(deviceMac, imageName);

  // Check cache first
  if (metadataCache.has(key)) {
    return metadataCache.get(key)!;
  }

  // Create buffer metadata
  const buffer: ImageBuffer = {
    metadata: null,
    chunks: new Map(), // Won't be used - chunks in Postgres
    totalChunks,
    imageRecord: null,
    payloadId: null,
    sessionInfo: null,
    createdAt: new Date(),
  };

  metadataCache.set(key, buffer);
  return buffer;
}

/**
 * Get existing buffer
 */
export async function getBuffer(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string
): Promise<ImageBuffer | null> {
  const key = getImageKey(deviceMac, imageName);
  return metadataCache.get(key) || null;
}

/**
 * Store chunk in Postgres (idempotent)
 */
export async function storeChunk(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  chunkIndex: number,
  chunkData: Uint8Array
): Promise<boolean> {
  const key = `${deviceMac}|${imageName}|${chunkIndex}`;

  try {
    // Store in Postgres using UPSERT
    const { data, error } = await supabase
      .from('edge_chunk_buffer')
      .upsert({
        chunk_key: key,
        device_mac: deviceMac,
        image_name: imageName,
        chunk_index: chunkIndex,
        chunk_data: Array.from(chunkData), // Store as int array
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min TTL
      }, {
        onConflict: 'chunk_key',
        ignoreDuplicates: true, // Don't update if exists
      })
      .select('chunk_key')
      .maybeSingle();

    // If data returned, it was inserted (first time)
    return !!data;
  } catch (err) {
    console.error('[Idempotency] Error storing chunk:', err);
    return false;
  }
}

/**
 * Check if all chunks received (query Postgres)
 */
export async function isComplete(
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

/**
 * Get missing chunk indices
 */
export async function getMissingChunks(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<number[]> {
  // Get all received chunks
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

/**
 * Assemble chunks from Postgres
 */
export async function assembleImage(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number
): Promise<Uint8Array | null> {
  // Fetch all chunks ordered by index
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

  // Convert arrays back to Uint8Arrays and concatenate
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

/**
 * Clear buffer after completion
 */
export async function clearBuffer(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string
): Promise<void> {
  const key = getImageKey(deviceMac, imageName);

  // Clear from cache
  metadataCache.delete(key);

  // Clear chunks from Postgres
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

/**
 * Cleanup stale buffers (expired)
 */
export async function cleanupStaleBuffers(
  supabase: SupabaseClient
): Promise<number> {
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

/**
 * Single ACK guard using Postgres advisory lock
 */
export async function withSingleAck<T>(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  fn: () => Promise<T>
): Promise<T | null> {
  const lockKey = `ack_${deviceMac}_${imageName}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const lockId = hashCode(lockKey);

  try {
    // Try to acquire advisory lock
    const { data: lockAcquired } = await supabase.rpc('pg_try_advisory_lock', {
      key: lockId,
    });

    if (!lockAcquired) {
      console.log('[Idempotency] ACK already sent for:', imageName);
      return null;
    }

    // Execute function
    const result = await fn();

    // Release lock
    await supabase.rpc('pg_advisory_unlock', { key: lockId });

    return result;
  } catch (err) {
    console.error('[Idempotency] Error in withSingleAck:', err);
    return null;
  }
}

/**
 * Simple hash function for advisory lock keys
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
EOF

echo "✅ Updated idempotency.ts with Postgres-backed storage"

# Create SQL migration for edge_chunk_buffer table
cat > supabase/migrations/20251110170000_edge_chunk_buffer.sql << 'EOF'
/*
  # Edge Chunk Buffer Table
  
  1. Purpose
    - Durable storage for MQTT chunks during transmission
    - Prevents in-memory loss on edge function restart
    - Enables idempotent chunk processing across instances
  
  2. Schema
    - chunk_key: unique identifier (device_mac|image_name|chunk_index)
    - chunk_data: BYTEA or INT[] for chunk bytes
    - expires_at: TTL for automatic cleanup
*/

CREATE TABLE IF NOT EXISTS edge_chunk_buffer (
  chunk_key TEXT PRIMARY KEY,
  device_mac TEXT NOT NULL,
  image_name TEXT NOT NULL,
  chunk_index INT NOT NULL,
  chunk_data INT[] NOT NULL, -- Store as integer array
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_chunk_buffer_device_image 
  ON edge_chunk_buffer(device_mac, image_name);

CREATE INDEX IF NOT EXISTS idx_edge_chunk_buffer_expires 
  ON edge_chunk_buffer(expires_at);

COMMENT ON TABLE edge_chunk_buffer IS 'Temporary storage for MQTT image chunks during transmission. Auto-expires after 30 minutes.';
EOF

echo "✅ Created edge_chunk_buffer migration"

echo ""
echo "🎉 Phase 3 Compliance Fix Complete!"
echo ""
echo "Next steps:"
echo "  1. Apply migration: supabase db push"
echo "  2. Review remaining module fixes (finalize.ts, retry.ts, storage.ts)"
echo "  3. Update index.ts to use WebSocket MQTT"
echo "  4. Deploy: supabase functions deploy mqtt_device_handler"
echo ""
